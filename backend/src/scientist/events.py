import re
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_serializer

# http(s) only, a real host (optional userinfo@ before it), no whitespace: the frontend renders url as a link.
# infra/hermes/native_bridge.py keeps an identical copy (a test checks they match).
HTTP_URL = re.compile(r"https?://(?:[^\s/?#@]+@)?[^\s/?#@]+[^\s]*", re.I)

ARXIV_ID = r"([0-9]{4}\.[0-9]{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/[0-9]{7})"  # ASCII digits only; \d would match Unicode
ARXIV_URL = re.compile(rf"(?i:https?://(?:www\.)?arxiv\.org)/(?:abs|pdf)/{ARXIV_ID}(?:v[0-9]+)?(?:\.pdf)?")


def arxiv_id(url: object) -> str | None:
    """arXiv id (no version) from an arxiv.org abs/pdf URL on exactly arxiv.org or www.arxiv.org, else None."""
    return m.group(1) if isinstance(url, str) and (m := ARXIV_URL.fullmatch(url.strip())) else None


DOI = re.compile(r"10\.\d{4,9}/\S+")
PMID = re.compile(r"[1-9]\d{0,8}")


def normalize_doi(v: object) -> str | None:
    """Bare lowercase DOI (doi.org / "doi:" / "DOI " prefix, whitespace and trailing punctuation removed), or None
    if it is not DOI-shaped: models write "N/A", "none", "-" for a missing DOI. Dot segments are rejected too: the URL
    layer would collapse them, so a lookup would ask about another DOI."""
    if not isinstance(v, str):
        return None
    d = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*|doi\s+)", "", v.strip(), flags=re.I).strip()
    if {".", ".."} & set(d.split("/")):
        return None
    d = d.rstrip(".,;:").lower()  # DOIs are case-insensitive
    return d if DOI.fullmatch(d) else None


def normalize_pmid(v: object) -> str | None:
    """PMID digits (an int or a "PMID: 123" string accepted), or None if it is not PMID-shaped."""
    if isinstance(v, bool) or not isinstance(v, (str, int)):
        return None
    p = re.sub(r"^pmid:?\s*", "", str(v).strip(), flags=re.I)
    return p if PMID.fullmatch(p) else None


def paper_key(doi: object = None, pmid: object = None, title: object = None, url: object = None) -> str | None:
    """Identity used to dedupe papers and match a rejected paper to its corrected retry: DOI, PMID, arXiv id, title, url.
    Placeholder identifiers ("N/A") are skipped, so they never merge two different papers."""
    def text(v):
        return str(v).strip() if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v).strip() else None
    if d := normalize_doi(doi):
        return "doi:" + d
    if p := normalize_pmid(pmid):
        return "pmid:" + p
    if a := arxiv_id(url):
        return "arxiv:" + a.lower()
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

    @field_validator("doi", mode="before")
    @classmethod
    def _doi(cls, v):
        return v if normalize_doi(v) else None  # valid DOIs kept as written; placeholders ("N/A", "none") -> None

    @field_validator("pmid", mode="before")
    @classmethod
    def _pmid(cls, v):
        return normalize_pmid(v)  # digits only; placeholders become None

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
    code: str | None = None


class Waiting(BaseModel):
    type: Literal["waiting"] = "waiting"
    position: int
    eta_seconds: int | None = None  # set by the run queue only; the old gate leaves it out of the JSON

    @model_serializer(mode="wrap")
    def _no_null_eta(self, handler):
        d = handler(self)
        if d.get("eta_seconds") is None:
            d.pop("eta_seconds", None)
        return d


class Strategy(BaseModel):
    type: Literal["strategy"] = "strategy"
    reasoning: str
    searches: list[Search]


class Sources(BaseModel):
    """One event per paper, as a branch reports it."""
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
    code: str | None = None  # set by the run service for its own endings ("stopped", "interrupted")

    @model_serializer(mode="wrap")
    def _no_null_code(self, handler):
        d = handler(self)
        if d.get("code") is None:
            d.pop("code", None)
        return d


class AnalysisStep(BaseModel):
    type: Literal["analysis_step"] = "analysis_step"
    step: Literal["profiling", "writing_script", "running", "repairing", "storing"]


class AnalysisScript(BaseModel):
    type: Literal["analysis_script"] = "analysis_script"
    code: str


class Artifact(BaseModel):
    id: str
    name: str
    kind: Literal["figure", "csv"]
    url: str


class AnalysisResult(BaseModel):
    type: Literal["analysis_result"] = "analysis_result"
    quality: dict
    tables: list[dict]
    findings: list[str]
    timings: dict
    artifacts: list[Artifact]


Event = Annotated[Refused | Waiting | Strategy | Sources | BranchAnswer | FinalAnswer | Complete | Error
                  | AnalysisStep | AnalysisScript | AnalysisResult,
                  Field(discriminator="type")]


def to_sse(event: Event) -> str:
    return f"data: {event.model_dump_json()}\n\n"
