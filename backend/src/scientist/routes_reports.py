"""POST /v1/reports/export: a report draft in, a PDF or DOCX file out. No network, no server paths, plain text only."""
import asyncio
import hashlib
import json
import logging
import re
from collections import OrderedDict
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, model_validator

from scientist import llm, report_render, usage
from scientist.routes_store import require_json

router = APIRouter()
TIMEOUT_S, MAX_CHARS, MAX_BYTES = 20, 200_000, 10 << 20
TYPES = {"pdf": "application/pdf",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


class Run(BaseModel):
    text: str = Field(max_length=5000)
    bold: bool = False
    italic: bool = False
    code: bool = False


Runs = Annotated[list[Run], Field(max_length=200)]
Cell = Annotated[str, Field(max_length=500)]


class ParagraphBlock(BaseModel):
    type: Literal["paragraph"]
    runs: Runs


class ListBlock(BaseModel):
    type: Literal["bullets", "numbered"]
    items: list[Runs] = Field(max_length=100)


class TableBlock(BaseModel):
    type: Literal["table"]
    header: list[Cell] = Field(default=[], max_length=12)
    rows: list[list[Cell]] = Field(max_length=100)

    @model_validator(mode="after")
    def _cols(self):
        if max([len(self.header)] + [len(r) for r in self.rows]) > 12:
            raise ValueError("a table can have at most 12 columns")
        return self


Block = Annotated[ParagraphBlock | ListBlock | TableBlock, Field(discriminator="type")]


class Section(BaseModel):
    heading: str = Field(max_length=200)
    paragraphs: list[str] = Field(default=[], max_length=60)
    blocks: list[Block] = Field(default=[], max_length=60)  # if present, used instead of paragraphs

    @model_validator(mode="after")
    def _len(self):
        if any(len(p) > 5000 for p in self.paragraphs):
            raise ValueError("paragraph longer than 5000 characters")
        return self

    def chars(self) -> int:
        n = len(self.heading) + sum(map(len, self.paragraphs))
        for b in self.blocks:
            if isinstance(b, ParagraphBlock):
                n += sum(len(r.text) for r in b.runs)
            elif isinstance(b, ListBlock):
                n += sum(len(r.text) for i in b.items for r in i)
            else:
                n += sum(map(len, b.header)) + sum(len(c) for r in b.rows for c in r)
        return n


class Reference(BaseModel):
    id: str = Field(max_length=50)
    title: str = Field(max_length=500)
    authors: list[str] = Field(default=[], max_length=50)
    year: int | None = None
    doi: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=1000)
    status: Literal["verified", "unverified", "unknown"]


class ExportRequest(BaseModel):
    format: Literal["pdf", "docx"]
    language: Literal["th", "en"]
    title: str = Field(max_length=200)
    subtitle: str | None = Field(default=None, max_length=300)
    sections: list[Section] = Field(max_length=30)
    references: list[Reference] = Field(default=[], max_length=100)
    style: Literal["standard", "official"] = "standard"  # official = Thai government letter layout
    # None = style default (sarabun; DOCX of official style names "TH Sarabun New"). PDF always embeds a bundled OFL face.
    font: Literal[tuple(report_render.FONTS_BY_ID)] | None = None

    @model_validator(mode="after")
    def _total(self):
        n = len(self.title) + sum(s.chars() for s in self.sections)
        if n > MAX_CHARS:
            raise ValueError(f"document is longer than {MAX_CHARS} characters")
        return self


def filename(title: str) -> str:
    s = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|;%​]+', " ", title)
    return re.sub(r"\s+", "_", s.strip())[:80].strip("_.") or "report"


@router.post("/v1/reports/export")
async def export(req: ExportRequest, request: Request):
    require_json(request)
    g = request.app.state.preview_gate  # same renderer pool as previews
    if g.free == 0:
        raise HTTPException(429, "too many exports in progress; try again shortly")
    g.free -= 1
    render = report_render.render_pdf if req.format == "pdf" else report_render.render_docx
    try:
        data = await asyncio.wait_for(asyncio.to_thread(render, req.model_dump()), TIMEOUT_S)
    except (TimeoutError, ImportError):
        raise HTTPException(503, "report renderer unavailable")
    finally:
        g.release()
    if len(data) > MAX_BYTES:
        raise HTTPException(422, "report is too large")
    name = quote(f"{filename(req.title)}.{req.format}")
    return Response(data, media_type=TYPES[req.format], headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{name}", "X-Content-Type-Options": "nosniff"})


# --- POST /v1/reports/translate: segments of the report in, the same segments in the other language out ---
log = logging.getLogger(__name__)
PROMPT = (Path(__file__).parent / "prompts" / "translate.md").read_text()
T_TIMEOUT_S, BATCH_CHARS, PARALLEL, T_MAX_QUEUE, CACHE_SIZE = 90, 6000, 3, 10, 512
T_MAX_SEGMENTS, T_MAX_SEGMENT, T_MAX_TOTAL = 2000, 5000, 200_000
CACHE: OrderedDict[str, str] = OrderedDict()  # ponytail: in-process LRU, lost on restart; Redis only if several workers


class TranslateRequest(BaseModel):
    target: Literal["th", "en"]
    segments: list[Annotated[str, Field(max_length=T_MAX_SEGMENT)]] = Field(max_length=T_MAX_SEGMENTS)

    @model_validator(mode="after")
    def _total(self):
        if sum(map(len, self.segments)) > T_MAX_TOTAL:
            raise ValueError(f"segments are longer than {T_MAX_TOTAL} characters in total")
        return self


class TranslateFailed(Exception):
    pass


def _key(model: str, target: str, seg: str) -> str:
    return hashlib.sha256(json.dumps([model, target, seg]).encode()).hexdigest()


def _batches(todo: list[tuple[int, str]]) -> list[list[tuple[int, str]]]:
    out, n = [], 0
    for item in todo:
        if not out or n + len(item[1]) > BATCH_CHARS:
            out.append([])
            n = 0
        out[-1].append(item)
        n += len(item[1])
    return out


async def _one(batch: list[tuple[int, str]], target: str, model: str) -> list[str]:
    # JSON keeps the text a string; escaping "<" stops it from closing the block early
    data = "<data>\n" + json.dumps({"target": target, "segments": [s for _, s in batch]}, ensure_ascii=False).replace("<", "\\u003c") + "\n</data>"
    for _ in range(2):  # one retry: a wrong item count or malformed JSON is usually a one-off
        try:
            r = await llm.complete(PROMPT, data, model=model, max_tokens=12000, json_mode=True)
            t = json.loads(r.text)["t"]
            if isinstance(t, list) and len(t) == len(batch) and all(isinstance(x, str) for x in t):
                return t
        except Exception as e:
            log.warning("translate batch failed: %s", type(e).__name__)
    raise TranslateFailed


@router.post("/v1/reports/translate")
async def translate(req: TranslateRequest, request: Request):
    require_json(request)
    st = request.app.state
    model = st.settings.model
    keys = [_key(model, req.target, s) for s in req.segments]
    out = [("" if not s.strip() else CACHE.get(k)) for s, k in zip(req.segments, keys)]
    todo = [(i, req.segments[i]) for i, o in enumerate(out) if o is None]
    if todo:
        g = st.translate_gate
        if g.free == 0 and len(g.queue) >= T_MAX_QUEUE:
            raise HTTPException(429, "too many translations queued; try again shortly")
        acc, sem = usage.Acc(), asyncio.Semaphore(PARALLEL)
        usage.CURRENT.set(acc)  # llm.complete counts its calls here; tasks below inherit it

        async def run(batch):
            async with sem:
                for (i, _), t in zip(batch, await _one(batch, req.target, model)):
                    out[i] = t
                    CACHE[keys[i]] = t
                    CACHE.move_to_end(keys[i])
                while len(CACHE) > CACHE_SIZE:
                    CACHE.popitem(last=False)

        async def slot():
            async for _ in g.acquire():
                pass
            try:
                await asyncio.gather(*map(run, _batches(todo)))
            finally:
                g.release()

        ok = False
        try:
            await asyncio.wait_for(slot(), T_TIMEOUT_S)
            ok = True
        except TimeoutError:
            return JSONResponse({"code": "translate_timeout"}, 504)
        except TranslateFailed:
            return JSONResponse({"code": "translate_failed"}, 502)
        finally:
            if st.db is not None and acc.calls:
                t = asyncio.create_task(usage.record(st.db, mode="translate", phases={}, acc=acc, ok=ok))
                usage.PENDING.add(t)
                t.add_done_callback(usage.PENDING.discard)
    return {"segments": out}
