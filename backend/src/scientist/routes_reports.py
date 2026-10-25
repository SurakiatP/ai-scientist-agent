"""POST /v1/reports/export: a report draft in, a PDF or DOCX file out. No network, no server paths, plain text only."""
import asyncio
import re
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator

from scientist import report_render
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
    font: Literal["sarabun"] = "sarabun"  # bundled OFL font; Noto Sans Thai not bundled

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
