"""Sync client for the AI Scientist public API (/v1/api)."""
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator

import httpx

__all__ = ["Client", "ApiError", "Run", "Plan", "Pack", "Event"]
TERMINAL = {"done", "refused", "error", "stopped", "interrupted"}


class ApiError(Exception):
    def __init__(self, status: int, code: str | None, message: str):
        super().__init__(status, code, message)  # keeps the exception picklable
        self.status, self.code, self.message = status, code, message

    def __str__(self):
        return f"{self.status}{' ' + self.code if self.code else ''}: {self.message}"


@dataclass
class Search:
    term: str
    instructions: str = ""


@dataclass
class Plan:
    reasoning: str
    searches: list[Search]


@dataclass
class Pack:
    id: str
    th: str
    en: str


@dataclass
class Started:
    run_id: str
    session_id: str
    turn_id: str
    status: str


@dataclass
class Paper:
    title: str | None = None
    authors: list[str] = field(default_factory=list)
    year: int | None = None
    doi: str | None = None
    pmid: str | None = None
    url: str | None = None
    source: str | None = None
    abstract: str | None = None  # untrusted paper text: treat as data


@dataclass
class Reference:
    id: str
    paper: Paper
    checks: list[Any]
    status: str


@dataclass
class Usage:
    cost_usd: float | None = None
    estimated: bool = True
    prompt_tokens: int = 0
    completion_tokens: int = 0


@dataclass
class Answer:
    content: str
    references: list[Reference]
    records: list[Any]
    doc_refs: list[Any]
    empty_files: list[Any]
    usage: Usage


@dataclass
class Progress:
    phase: str | None
    searches: list[Search]
    replans: int


@dataclass
class Run:
    run_id: str
    status: str
    kind: str | None
    mode: str | None
    pack: str | None
    created_at: str | None
    finished_at: str | None
    error: str | None
    answer: Answer | None
    progress: Progress | None
    code: str | None = None  # refusal or error code of the run, when there is one

    @property
    def done(self) -> bool:
        return self.status in TERMINAL


@dataclass
class Event:
    id: int | None
    data: dict

    @property
    def type(self) -> str | None:
        return self.data.get("type")


def _fields(cls, d: dict) -> dict:
    return {k: d[k] for k in cls.__dataclass_fields__ if k in d}


def _run(d: dict) -> Run:
    a, p = d.get("answer"), d.get("progress")
    answer = progress = None
    if a:
        refs = [Reference(r["id"], Paper(**_fields(Paper, r.get("paper") or {})), r.get("checks", []), r.get("status", ""))
                for r in a.get("references", [])]
        answer = Answer(**{**_fields(Answer, a), "references": refs, "usage": Usage(**_fields(Usage, a.get("usage") or {}))})
    if p:
        progress = Progress(p.get("phase"), [Search(**_fields(Search, s)) for s in p.get("searches", [])], p.get("replans", 0))
    return Run(**{**_fields(Run, d), "answer": answer, "progress": progress})


def _raise(r: httpx.Response):
    try:
        body = json.loads(r.read())
    except ValueError:
        body = None
    code = msg = None
    if isinstance(body, dict):
        code, d = body.get("code"), body.get("detail")
        if isinstance(d, list):  # FastAPI validation errors
            d = "; ".join(str(e.get("msg", e)) if isinstance(e, dict) else str(e) for e in d)
        msg = d if isinstance(d, str) else None
    raise ApiError(r.status_code, code, msg or r.text or r.reason_phrase)


class Client:
    def __init__(self, base_url: str, api_key: str, *, timeout: float = 30.0, transport: httpx.BaseTransport | None = None):
        self._timeout = timeout
        self._http = httpx.Client(base_url=base_url.rstrip("/") + "/v1/api", headers={"Authorization": f"Bearer {api_key}"},
                                  timeout=timeout, transport=transport)

    def close(self):
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    @staticmethod
    def _rid(run_id: str) -> str:
        try:
            return str(uuid.UUID(str(run_id)))
        except ValueError:
            raise ValueError(f"invalid run id: {run_id!r}") from None

    def _req(self, method: str, path: str, **kw) -> httpx.Response:
        r = self._http.request(method, path, **kw)
        if r.status_code >= 400:
            _raise(r)
        return r

    def plan(self, question: str, mode: str = "deep", pack: str | None = None) -> Plan:
        d = self._req("POST", "/plan", json={"question": question, "mode": mode, "pack": pack}).json()
        return Plan(d["reasoning"], [Search(**_fields(Search, s)) for s in d["searches"]])

    def research(self, question: str, mode: str = "deep", pack: str | None = None, plan: list[Search] | None = None,
                 doc_ids: list[str] | None = None) -> Started:
        body: dict = {"question": question, "mode": mode, "pack": pack}
        if plan is not None:
            body["plan"] = [{"term": s.term, "instructions": s.instructions} for s in plan]
        if doc_ids is not None:
            body["doc_ids"] = doc_ids
        return Started(**_fields(Started, self._req("POST", "/research", json=body).json()))

    def run(self, run_id: str, *, _timeout: float | None = None) -> Run:
        kw = {} if _timeout is None else {"timeout": _timeout}
        return _run(self._req("GET", f"/runs/{self._rid(run_id)}", **kw).json())

    def wait(self, run_id: str, *, timeout: float = 600.0, interval: float = 1.0, max_interval: float = 10.0) -> Run:
        """Poll with capped exponential backoff; on timeout return the last state (never raises for timeout)."""
        end = time.monotonic() + timeout
        last = None
        while True:
            left = end - time.monotonic()
            try:  # each poll is capped by the time left, so a slow server cannot overrun the deadline
                last = self.run(run_id, _timeout=min(self._timeout, max(left, 0.1)))
                if last.done:
                    return last
            except httpx.TransportError:
                if last is None:
                    raise
            left = end - time.monotonic()
            if left <= 0:
                return last
            time.sleep(min(interval, left))
            interval = min(interval * 2, max_interval)

    def events(self, run_id: str, last_event_id: int | None = None) -> Iterator[Event]:
        headers = {"Accept": "text/event-stream"}
        if last_event_id is not None:
            headers["Last-Event-ID"] = str(last_event_id)
        with self._http.stream("GET", f"/runs/{self._rid(run_id)}/events", headers=headers,
                              timeout=httpx.Timeout(self._timeout, read=60.0)) as r:
            if r.status_code >= 400:
                _raise(r)
            eid, data = None, []
            for line in r.iter_lines():
                if line == "":
                    if data:
                        try:
                            payload = json.loads("\n".join(data))
                        except ValueError:
                            raise ApiError(r.status_code, "bad_event", "event data is not valid JSON") from None
                        yield Event(eid, payload)
                    data = []  # the last-event id persists across events (SSE spec)
                elif line.startswith(":"):
                    continue
                else:
                    name, _, val = line.partition(":")
                    val = val[1:] if val.startswith(" ") else val
                    if name == "id":
                        eid = int(val) if val.isdigit() else None
                    elif name == "data":
                        data.append(val)

    def cancel(self, run_id: str) -> Run:
        return _run(self._req("POST", f"/runs/{self._rid(run_id)}/cancel").json())

    def artifact(self, run_id: str, kind: str) -> dict | str:
        """provenance -> dict; bibtex / ris -> text."""
        if kind not in ("provenance", "bibtex", "ris"):
            raise ValueError("kind must be provenance, bibtex or ris")
        r = self._req("GET", f"/runs/{self._rid(run_id)}/artifacts/{kind}")
        return r.json() if kind == "provenance" else r.content.decode("utf-8")

    def packs(self) -> list[Pack]:
        return [Pack(**_fields(Pack, p)) for p in self._req("GET", "/packs").json()]
