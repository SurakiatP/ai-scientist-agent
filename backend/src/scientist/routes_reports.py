"""POST /v1/reports/export: a report draft in, a PDF or DOCX file out. No network, no server paths, plain text only."""
import asyncio
import re
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator

from scientist import report_render

router = APIRouter()
TIMEOUT_S, MAX_CHARS, MAX_BYTES = 20, 200_000, 10 << 20
TYPES = {"pdf": "application/pdf",
         "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


class Section(BaseModel):
    heading: str = Field(max_length=200)
    paragraphs: list[str] = Field(max_length=60)

    @model_validator(mode="after")
    def _len(self):
        if any(len(p) > 5000 for p in self.paragraphs):
            raise ValueError("paragraph longer than 5000 characters")
        return self


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
        n = len(self.title) + sum(len(s.heading) + sum(map(len, s.paragraphs)) for s in self.sections)
        if n > MAX_CHARS:
            raise ValueError(f"document is longer than {MAX_CHARS} characters")
        return self


def filename(title: str) -> str:
    s = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|;%​]+', " ", title)
    return re.sub(r"\s+", "_", s.strip())[:80].strip("_.") or "report"


@router.post("/v1/reports/export")
async def export(req: ExportRequest):
    render = report_render.render_pdf if req.format == "pdf" else report_render.render_docx
    try:
        data = await asyncio.wait_for(asyncio.to_thread(render, req.model_dump()), TIMEOUT_S)
    except (TimeoutError, ImportError):
        raise HTTPException(503, "report renderer unavailable")
    if len(data) > MAX_BYTES:
        raise HTTPException(422, "report is too large")
    name = quote(f"{filename(req.title)}.{req.format}")
    return Response(data, media_type=TYPES[req.format], headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{name}", "X-Content-Type-Options": "nosniff"})
