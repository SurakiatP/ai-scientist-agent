import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

# http(s) only, a real host (optional userinfo@ before it), no whitespace: the frontend renders url as a link.
# infra/hermes/native_bridge.py keeps an identical copy (a test checks they match).
HTTP_URL = re.compile(r"https?://(?:[^\s/?#@]+@)?[^\s/?#@]+[^\s]*", re.I)


def paper_key(doi: object = None, pmid: object = None, title: object = None, url: object = None) -> str | None:
    """Identity used to dedupe papers and match a rejected paper to its corrected retry: DOI, PMID, title, url."""
    def text(v):
        return str(v).strip() if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v).strip() else None
    if d := text(doi):
        return "doi:" + re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*|doi\s+)", "", d.lower())
    if p := text(pmid):
        return "pmid:" + p
    if t := text(title):
        return "title:" + t.lower()
    return "url:" + u if (u := text(url)) else None


class Paper(BaseModel):
    title: str = Field(min_length=1)
    authors: list[str] = []
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    url: str

    @field_validator("authors", mode="before")
    @classmethod
    def _authors(cls, v):
        return [] if v is None else v

    @field_validator("pmid", mode="before")
    @classmethod
    def _pmid(cls, v):
        return str(v) if isinstance(v, int) and not isinstance(v, bool) else v

    @field_validator("url", mode="before")
    @classmethod
    def _url(cls, v):
        v = v.strip() if isinstance(v, str) else v
        if not isinstance(v, str) or not HTTP_URL.fullmatch(v):
            raise ValueError("url must be an http(s) link")
        return v


class Reference(BaseModel):
    id: str
    paper: Paper
    status: Literal["verified", "unverified", "unknown"]


class Search(BaseModel):
    term: str
    instructions: str


class Refused(BaseModel):
    type: Literal["refused"] = "refused"
    reason: str


class Waiting(BaseModel):
    type: Literal["waiting"] = "waiting"
    position: int


class Strategy(BaseModel):
    type: Literal["strategy"] = "strategy"
    reasoning: str
    searches: list[Search]


class Sources(BaseModel):
    type: Literal["sources"] = "sources"
    term: str
    papers: list[Paper]


class BranchAnswer(BaseModel):
    type: Literal["answer"] = "answer"
    term: str
    content: str


class FinalAnswer(BaseModel):
    type: Literal["final_answer"] = "final_answer"
    content: str
    references: list[Reference]


class Complete(BaseModel):
    type: Literal["complete"] = "complete"


class Error(BaseModel):
    type: Literal["error"] = "error"
    message: str


Event = Annotated[Refused | Waiting | Strategy | Sources | BranchAnswer | FinalAnswer | Complete | Error,
                  Field(discriminator="type")]


def to_sse(event: Event) -> str:
    return f"data: {event.model_dump_json()}\n\n"
