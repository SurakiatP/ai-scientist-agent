"""mode "docs": answer a question from the user's attached PDFs. Index each file once (sandbox extraction, documents.py),
pick passages with full-text search, one model call over the escaped passages, then keep only the [n] and quotes that
check out against the passages."""
import json
import logging
import re
from collections.abc import AsyncIterator
from contextlib import aclosing
from pathlib import Path

import sqlalchemy as sa

from scientist import documents, llm, provenance, sandbox, usage
from scientist import models as m
from scientist.config import Settings
from scientist.events import Complete, DocRef, DocsIndexing, EmptyFile, Error, Event, FinalAnswer, ProvDocFile, Refused, Waiting
from scientist.gate import RunGate
from scientist.guardrail import guard
from scientist.pipeline import _exact, _history_block, _squash

DOCS = (Path(__file__).parent / "prompts/docs.md").read_text()
MARK = re.compile(r"\[(\d+(?:\s*[,\u2013-]\s*\d+)*)\]")  # [2], [1, 2], [1-3]
LINK = re.compile(r"\[([^\]]*)\]\([^)\s]*[^)]*\)")  # [label](url)
PERMANENT = ("unreadable", "bad_output", "output_too_large")
FAIL = "Could not write the answer. Please try again."
NO_TEXT = "The attached documents have no extractable text (they may be scans), so there is nothing to answer from."
log = logging.getLogger(__name__)


def _block(files: dict[str, str], passages: list[dict]) -> str:
    data = {"documents": [{"name": n} for n in files.values()],
            "passages": [{"n": i, "document": files[p["file_id"]], "page": p["page"], "text": p["text"]} for i, p in enumerate(passages, 1)]}
    # as pipeline._data_block: JSON keeps the text a string; escaping "<" stops it from closing the block early
    return "<data>\n" + json.dumps(data, ensure_ascii=False, indent=1).replace("<", "\\u003c") + "\n</data>"


def _parse(text: str) -> tuple[str, dict]:
    """(answer, quotes) from the model's JSON; anything else is taken as a plain answer without quotes."""
    try:
        d = json.loads(text)
        quotes = d.get("quotes")
        return str(d["answer"]).strip(), {str(k): v for k, v in quotes.items() if isinstance(v, str)} if isinstance(quotes, dict) else {}
    except Exception:
        return text.strip(), {}


def _verify(answer: str, quotes: dict, passages: list[dict], files: dict[str, str]) -> tuple[str, list[DocRef]]:
    """Drop [n] that is not a sent passage, renumber the rest 1.. by first use, keep a quote only if _exact."""
    order: dict[int, DocRef] = {}

    def numbers(group: str) -> list[int]:
        out = []
        for part in group.split(","):
            lo, _, hi = re.split(r"\s*([\u2013-])\s*", part.strip(), maxsplit=1) if re.search(r"[\u2013-]", part) else (part.strip(), "", "")
            a, b = int(lo), int(hi or lo)
            out += range(a, min(b, a + len(passages)) + 1) if a <= b else []  # a range is capped: no huge loops
        return out

    def sub(mt: re.Match) -> str:
        kept = []
        for n in dict.fromkeys(numbers(mt[1])):
            if not 1 <= n <= len(passages):
                continue
            if n not in order:
                p = passages[n - 1]
                q = _squash(quotes[str(n)]) if str(n) in quotes else ""
                order[n] = DocRef(id=str(len(order) + 1), file_id=p["file_id"], file_name=files[p["file_id"]], page=p["page"],
                                  text=p["text"][:1200], quote=q if q and _exact(q, p["text"]) else None)
            kept.append(order[n].id)
        return "".join(f"[{k}]" for k in kept)
    return MARK.sub(sub, LINK.sub(r"\1", answer)), list(order.values())


def _fail(name: str, error: str | None) -> str:
    if error == "unreadable":
        return f'The file "{name}" could not be read as a PDF (it may be encrypted or damaged).'
    if error in PERMANENT:
        return f'The file "{name}" cannot be read.'
    return f'The file "{name}" could not be read right now. Please try again.'


async def answer_docs(question: str, doc_ids: list[str], *, db, store, settings: Settings, gate: RunGate,
                      history: list = ()) -> AsyncIterator[Event]:
    """Scope check (as deep mode), then, holding a gate slot of the sandbox pool: index, retrieve, answer."""
    verdict = await guard("deep", question, settings=settings)
    if not verdict.in_scope:
        yield Refused(reason=verdict.reason, code=verdict.code)  # refusals never queue or take a slot
        return
    async with aclosing(gate.acquire()) as waits:
        async for position in waits:
            yield Waiting(position=position, eta_seconds=getattr(gate, "eta", lambda _: None)(position))
    try:
        async with db.session() as s:
            rows = {r.id: r.name for r in await s.execute(sa.select(m.files.c.id, m.files.c.name).where(m.files.c.id.in_(doc_ids), m.files.c.deleted_at.is_(None)))}
            seen = {r.file_id: (r.status, r.error) for r in await s.execute(sa.select(m.doc_index.c.file_id, m.doc_index.c.status, m.doc_index.c.error)
                                                                  .where(m.doc_index.c.file_id.in_(doc_ids)))}
        if missing := [i for i in doc_ids if i not in rows]:
            yield Error(message=f"The document {missing[0]} was not found.")
            return
        files = {i: rows[i] for i in doc_ids}
        status: dict[str, dict] = {}
        for fid, name in files.items():
            st, err = seen.get(fid, (None, None))
            if st != "ready" and not (st == "failed" and err in PERMANENT):  # it will be extracted (new, being read, or a retried host failure)
                yield DocsIndexing(file_id=fid, file_name=name)

            async def load(fid=fid):
                return (await store.get(fid))[0]
            try:
                status[fid] = await documents.ensure_index(db, fid, load, settings, extract=sandbox.extract_pdf)
            except Exception:
                log.warning("docs: file %s could not be indexed", fid, exc_info=True)
                yield Error(message=f'The file "{name}" could not be loaded.')
                return
            if status[fid]["status"] != "ready":
                yield Error(message=_fail(name, status[fid]["error"]))
                return
        readable = [i for i in files if status[i]["chunks"]]
        empty = [EmptyFile(file_id=i, file_name=files[i]) for i in files if i not in readable]  # names never enter the text
        pf = [ProvDocFile(file_id=i, sha256=status[i].get("sha256")) for i in files]
        if not readable:
            yield FinalAnswer(content=NO_TEXT, references=[], empty_files=empty, usage=usage.snapshot(),
                              provenance=provenance.docs(settings, DOCS, pf, passages=0, cited=0, history_turns=len(history)))
            yield Complete()
            return
        passages = await documents.search(db, readable, question)
        user = _history_block(history) + _block(files, passages) + f"\n\nQuestion:\n{question}"
        try:
            r = await llm.complete(DOCS, user, max_tokens=settings.synthesis_max_tokens, json_mode=True, settings=settings)
        except Exception:
            log.warning("docs: model call failed", exc_info=True)
            yield Error(message=FAIL)
            return
        text, quotes = _parse(r.text)
        content, refs = _verify(text, quotes, passages, files)
        yield FinalAnswer(content=content, references=[], doc_refs=refs, empty_files=empty, usage=usage.snapshot(),
                          provenance=provenance.docs(settings, DOCS, pf, passages=len(passages), cited=len(refs), history_turns=len(history)))
        yield Complete()
    finally:
        gate.release()
