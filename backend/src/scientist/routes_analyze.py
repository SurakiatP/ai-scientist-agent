"""POST /v1/async/analyze: run a model-written pandas script on an uploaded file in the sandbox, as an SSE stream.
GET /v1/artifacts/{id}: figures and CSVs produced by a run, served from MinIO."""
import csv
import io
import json
import re
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, field_validator

from scientist import llm, sandbox
from scientist.config import Settings, get_settings
from scientist.events import AnalysisResult, AnalysisScript, AnalysisStep, Artifact, Complete, Error, Event, Refused
from scientist.guardrail import check_scope
from scientist.object_store import ObjectMissing
from scientist.routes_ask import HEADERS, _sse
from scientist.routes_files import ID

router = APIRouter()
SYSTEM = (Path(__file__).parent / "prompts/analyze.md").read_text()
EXTS = {"csv", "parquet", "xlsx", "json"}
FENCE = re.compile(r"```(?:python)?\s*\n(.*?)```", re.S)
FAIL = "The analysis could not be completed. Try a simpler question."


class AnalyzeRequest(BaseModel):
    file_id: str
    question: str

    @field_validator("question")
    @classmethod
    def _length(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("question is empty")
        if len(v) > (limit := get_settings().max_question_chars):
            raise ValueError(f"question is longer than {limit} characters")
        return v


def _extract(text: str) -> str:
    m = FENCE.search(text)
    return (m[1] if m else text).strip()


def _prompt(question: str, quality: dict, feedback: str | None) -> str:
    cols = [{k: c[k] for k in ("name", "dtype", "null_pct")} for c in quality["columns_info"]]
    data = json.dumps({"rows": quality["rows"], "columns": cols, "sample_rows": quality["head"]},
                      ensure_ascii=False, default=str)
    return (f"<data>\n{data}\n</data>\n\nQuestion: {question}"
            + (f"\n\nYour previous script failed:\n{feedback}\nReturn the corrected full script." if feedback else ""))


def _csv(t: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(t["columns"])
    w.writerows(t["rows"])
    return buf.getvalue().encode()


async def analyze(file_id: str, question: str, *, store, settings: Settings, name: str, ext: str,
                  data: bytes) -> AsyncIterator[Event]:
    yield AnalysisStep(step="profiling")
    prof = await sandbox.run_analysis(None, data, ext, settings)
    if not prof.ok:
        yield Error(message="The file could not be read as a table." if prof.error == "script_error" else FAIL)
        return
    quality = prof.result["quality"]
    verdict = await check_scope(f"{question} (data columns: {', '.join(c['name'] for c in quality['columns_info'])})",
                                settings=settings)
    if not verdict.in_scope:
        yield Refused(reason=verdict.reason)
        return
    feedback, run = None, None
    for attempt in range(2):  # first try, then one repair
        yield AnalysisStep(step="writing_script" if attempt == 0 else "repairing")
        r = await llm.complete(SYSTEM, _prompt(question, quality, feedback), max_tokens=settings.analyze_max_tokens,
                               settings=settings)
        code = _extract(r.text)
        yield AnalysisScript(code=code)
        if bad := sandbox.check_script(code):
            feedback = f"Rejected before running: {bad}"
            continue
        yield AnalysisStep(step="running")
        run = await sandbox.run_analysis(code, data, ext, settings)
        if run.ok:
            break
        if run.error != "script_error":  # timeout, oom, output cap: a rewrite will not help
            yield Error(message="The analysis timed out or used too many resources." if run.error else FAIL)
            return
        feedback = "\n".join(run.stderr_tail.splitlines()[-20:])
    if not run or not run.ok:
        yield Error(message=FAIL)
        return
    yield AnalysisStep(step="storing")
    arts = []
    try:
        for fname, png in run.figures.items():
            aid = uuid.uuid4().hex
            await store.put(aid, png, content_type="image/png", metadata={"name": fname})
            arts.append(Artifact(id=aid, name=fname, kind="figure", url=f"/v1/artifacts/{aid}"))
        for i, t in enumerate(run.result["tables"], 1):
            aid = uuid.uuid4().hex
            await store.put(aid, _csv(t), content_type="text/csv", metadata={"name": f"table-{i}.csv"})
            arts.append(Artifact(id=aid, name=f"table-{i}.csv", kind="csv", url=f"/v1/artifacts/{aid}"))
    except Exception:
        yield Error(message="Results could not be stored.")
        return
    res = run.result
    yield AnalysisResult(quality=quality, tables=res["tables"], findings=res["findings"],
                         timings=res["timings"], artifacts=arts)
    yield Complete()


@router.post("/v1/async/analyze")
async def analyze_route(body: AnalyzeRequest, request: Request) -> StreamingResponse:
    st = request.app.state
    if (store := st.store) is None:
        raise HTTPException(503, "file storage unavailable")
    if not ID.fullmatch(body.file_id):
        raise HTTPException(404, "file not found")
    try:
        data, meta = await store.get(body.file_id)
    except ObjectMissing:
        raise HTTPException(404, "file not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    name = unquote(meta.get("name", "file"))
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in EXTS:
        raise HTTPException(422, f"analysis supports {', '.join(sorted(EXTS))} files")
    events = analyze(body.file_id, body.question, store=store, settings=st.settings, name=name, ext=ext, data=data)
    return StreamingResponse(_sse(events, st.settings.sse_ping_seconds), media_type="text/event-stream",
                             headers=HEADERS)


@router.get("/v1/artifacts/{artifact_id}")
async def artifact(artifact_id: str, request: Request):
    if (store := request.app.state.store) is None:
        raise HTTPException(503, "file storage unavailable")
    if not ID.fullmatch(artifact_id):
        raise HTTPException(404, "artifact not found")
    try:
        data, meta = await store.get(artifact_id)
    except ObjectMissing:
        raise HTTPException(404, "artifact not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    if meta["content_type"] not in ("image/png", "text/csv"):  # uploads share the bucket: serve only run outputs
        raise HTTPException(404, "artifact not found")
    disp = "inline" if meta["content_type"] == "image/png" else "attachment"
    return Response(data, media_type=meta["content_type"],
                    headers={"X-Content-Type-Options": "nosniff", "Content-Disposition": f'{disp}; filename="{unquote(meta.get("name", "artifact"))}"'})
