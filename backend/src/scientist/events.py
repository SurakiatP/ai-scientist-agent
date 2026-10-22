from typing import Annotated, Literal

from pydantic import BaseModel, Field


class Paper(BaseModel):
    title: str
    authors: list[str] = []
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    url: str


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
