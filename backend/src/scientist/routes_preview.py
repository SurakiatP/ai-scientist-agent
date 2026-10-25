"""POST /v1/async/reports/preview renders the draft as a PDF and streams its progress; GET /v1/reports/preview/{id}
returns the PDF inline. Same body and checks as /v1/reports/export, format forced to pdf."""
import asyncio
import re
from collections.abc import AsyncIterator
from contextlib import aclosing
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from scientist import report_render
from scientist.preview_store import ID_RE, PreviewStore
from scientist.routes_ask import HEADERS, _sse
from scientist.routes_reports import TIMEOUT_S, ExportRequest

router = APIRouter()
MAX_QUEUE = 10


class PreviewStatus(BaseModel):
    type: Literal["preview_status"] = "preview_status"
    stage: Literal["queued", "preparing", "rendering"]  # no "layout": the renderer cannot report it separately


class PreviewReady(BaseModel):
    type: Literal["preview_ready"] = "preview_ready"
    id: str
    pages: int
    bytes: int


class PreviewError(BaseModel):
    type: Literal["error"] = "error"
    message: str


async def _events(req: ExportRequest, gate, store: PreviewStore) -> AsyncIterator[BaseModel]:
    yield PreviewStatus(stage="queued")
    async with aclosing(gate.acquire()) as waits:  # ends holding a slot; closing early takes none
        async for _ in waits:
            pass
    task = None
    try:
        yield PreviewStatus(stage="preparing")
        data = req.model_copy(update={"format": "pdf"}).model_dump()
        yield PreviewStatus(stage="rendering")
        task = asyncio.ensure_future(asyncio.wait_for(asyncio.to_thread(report_render.render_pdf, data), TIMEOUT_S))
        try:
            pdf = await task
        except (TimeoutError, ImportError):
            yield PreviewError(message="preview unavailable")
            return
        if (key := store.put(pdf)) is None:
            yield PreviewError(message="preview is too large")
            return
        # fpdf2 writes each page as its own plain object; no page callback exists, so pages are counted after writing
        yield PreviewReady(id=key, pages=len(re.findall(rb"/Type\s*/Page\b", pdf)), bytes=len(pdf))
    finally:
        if task:
            task.cancel()  # client gone: stop waiting (the worker thread finishes on its own)
        gate.release()


@router.post("/v1/async/reports/preview")
async def preview(body: ExportRequest, request: Request) -> StreamingResponse:
    st = request.app.state
    if st.preview_gate.free == 0 and len(st.preview_gate.queue) >= MAX_QUEUE:
        raise HTTPException(429, "too many previews queued; try again shortly")
    return StreamingResponse(_sse(_events(body, st.preview_gate, st.previews), st.settings.sse_ping_seconds),
                             media_type="text/event-stream", headers=HEADERS)


@router.get("/v1/reports/preview/{key}")
async def preview_pdf(key: str, request: Request) -> Response:
    data = request.app.state.previews.get(key) if re.fullmatch(ID_RE, key) else None
    if data is None:
        raise HTTPException(404, "preview not found")
    return Response(data, media_type="application/pdf", headers={
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline"})
