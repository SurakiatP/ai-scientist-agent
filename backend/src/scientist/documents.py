"""PDF text index: extract once in the sandbox (lazily, on first use), store page-bound chunks, retrieve with Postgres
full-text search. Nothing here parses PDF bytes; `extract` (sandbox.extract_pdf) does that inside the container."""
import asyncio
import hashlib
import re
from collections.abc import Awaitable, Callable

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

from scientist import models as m
from scientist import sandbox
from scientist.config import Settings
from scientist.db import Database

CHUNK, OVERLAP = 1200, 150
PER_DOC, TOP_K, MIN_HITS = 6, 12, 3  # at most 6 passages per document, 12 in total; fewer than 3 hits -> first chunks
HOST_ERRORS = ("oom_or_crash", "timeout", "no_result")  # about the host, not the file: a failed row with one of these expires
FAILED_TTL_S = 3600  # (unreadable, output_too_large, bad_output stay: the same bytes would fail the same way)
_CTRL = re.compile("[\x00-\x08\x0e-\x1f\x7f]")  # NUL breaks the insert; the others are noise ( \t \n \r \v \f collapse as whitespace)


def chunk_pages(pages: list[dict]) -> list[dict]:
    """[{page, idx, text}]: ~1,200 characters with 150 overlap, split at whitespace, never across pages. Whitespace is
    collapsed, so a stored chunk is a plain string a quote can be checked against."""
    out: list[dict] = []
    for p in pages:
        text = " ".join(_CTRL.sub("", p["text"]).split())
        start = 0
        while start < len(text):
            end = min(start + CHUNK, len(text))
            if end < len(text) and (cut := text.rfind(" ", start + CHUNK - 200, end)) > start:
                end = cut
            out.append({"page": p["page"], "idx": len(out), "text": text[start:end].strip()})
            if end >= len(text):
                break
            start = max(end - OVERLAP, start + 1)
            if (sp := text.find(" ", start)) != -1 and sp < end:  # begin on a word boundary
                start = sp + 1
    return out


def _status(file_id: str, r) -> dict:
    return {"file_id": file_id, "status": r.status, "pages": r.pages, "chunks": r.chunks, "truncated": r.truncated, "error": r.error, "sha256": r.sha256}


async def ensure_index(db: Database, file_id: str, load: Callable[[], Awaitable[bytes]], settings: Settings,
                       extract=sandbox.extract_pdf) -> dict:
    """The index status for a file ({file_id, status: ready|failed, pages, chunks, truncated, error}), indexing it first if
    nobody has. The doc_index primary key is the guard: the one caller that inserts the row indexes, the others poll it.
    A row stuck in 'indexing' (crashed worker) is taken over after twice the sandbox timeout."""
    t, stale = m.doc_index, settings.sandbox_timeout_s * 2 + 60
    while True:
        async with db.session() as s, s.begin():
            await s.execute(sa.delete(t).where(t.c.file_id == file_id, t.c.status == "failed", t.c.error.in_(HOST_ERRORS),
                                               t.c.created_at < sa.func.now() - sa.func.make_interval(0, 0, 0, 0, 0, 0, FAILED_TTL_S)))
            claimed = (await s.execute(pg_insert(t).values(file_id=file_id, status="indexing").on_conflict_do_nothing()
                                       .returning(t.c.created_at))).first()
            if not claimed:
                claimed = (await s.execute(sa.update(t).where(
                    t.c.file_id == file_id, t.c.status == "indexing",
                    t.c.created_at < sa.func.now() - sa.func.make_interval(0, 0, 0, 0, 0, 0, stale)).values(created_at=sa.func.now())
                    .returning(t.c.created_at))).first()
            row = None if claimed else (await s.execute(sa.select(t).where(t.c.file_id == file_id))).first()
        if claimed:
            if (res := await _index(db, file_id, claimed.created_at, load, settings, extract)) is not None:
                return res
            await asyncio.sleep(0.2)  # taken over by another worker: wait for its result, never return a half-done row
            continue
        if row is not None and row.status != "indexing":
            return _status(file_id, row)
        await asyncio.sleep(0.2)  # row vanished (retry after a transient failure) or still indexing: look again


async def _index(db, file_id, token, load, settings, extract) -> dict | None:
    """token = our claim's created_at: every write is guarded by it, so an owner that was taken over cannot clobber the new one."""
    t = m.doc_index
    mine = sa.and_(t.c.file_id == file_id, t.c.status == "indexing", t.c.created_at == token)

    async def release():
        async with db.session() as s, s.begin():
            await s.execute(sa.delete(t).where(mine))  # not stuck: the next question retries

    def failed(err):
        return {"file_id": file_id, "status": "failed", "pages": 0, "chunks": 0, "truncated": False, "error": err, "sha256": None}
    try:
        data = await load()
        r = await extract(data, settings)
        if not r.ok and r.error == "docker_unavailable":  # the host's problem, not the file's: try again later
            await release()
            return failed(r.error)
        chunks = chunk_pages(r.pages) if r.ok else []
        async with db.session() as s, s.begin():
            sha = hashlib.sha256(data).hexdigest()  # of the bytes that were extracted (provenance of docs answers)
            vals = dict(status="ready", pages=len(r.pages), chunks=len(chunks), truncated=r.truncated, error=None, sha256=sha) if r.ok \
                else dict(status="failed", error=r.error, sha256=sha)  # remembered: the same bytes are not re-run on every question
            row = (await s.execute(sa.update(t).where(mine).values(**vals).returning(t))).first()
            if row is None:  # taken over meanwhile: the caller goes back to polling for the new owner's result
                return None
            if chunks:
                await s.execute(sa.delete(m.doc_chunks).where(m.doc_chunks.c.file_id == file_id))
                await s.execute(sa.insert(m.doc_chunks), [{"file_id": file_id, **c} for c in chunks])
        return _status(file_id, row)
    except BaseException:
        await asyncio.shield(release())
        raise


_SEARCH = sa.text("""
with q as (select to_tsquery('simple', :tsq) as q)
select file_id, page, idx, text from (
  select c.file_id, c.page, c.idx, c.text, ts_rank_cd(c.tsv, q.q) as rank,
         row_number() over (partition by c.file_id order by ts_rank_cd(c.tsv, q.q) desc, c.idx) as rn
  from doc_chunks c, q where c.file_id in :ids and c.tsv @@ q.q) t
where rn <= :per order by rank desc, file_id, idx limit :k""").bindparams(sa.bindparam("ids", expanding=True))
_CONTENT = sa.text("select t from unnest(cast(:ts as text[])) with ordinality as x(t, o) where to_tsvector('english', t) <> ''::tsvector order by o")
_FIRST = sa.text("""
select file_id, page, idx, text from (
  select file_id, page, idx, text, row_number() over (partition by file_id order by idx) as rn
  from doc_chunks where file_id in :ids) t where rn <= :per order by file_id, idx""").bindparams(sa.bindparam("ids", expanding=True))


async def search(db: Database, file_ids: list[str], question: str) -> list[dict]:
    """Up to 12 passages [{file_id, page, idx, text}] over the (already indexed) files, at most 6 per file. The question is
    a websearch query with its terms OR-ed (English stopwords left out), ranked by ts_rank_cd; fewer than 3 hits (no shared words, Thai over an English
    PDF) adds each file's first chunks in page order, taken round-robin so every file is represented (hits stay first)."""
    if not file_ids:
        return []
    args = {"ids": list(file_ids), "per": PER_DOC}
    async with db.session() as s:
        parsed = (await s.execute(sa.text("select websearch_to_tsquery('simple', :q)::text"), {"q": question[:1000]})).scalar()
        words = [t for neg, t in re.findall(r"(!?)'((?:[^']|'')*)'", parsed) if not neg]  # OR the terms, drop negated ones
        if words:  # English stopwords ("what", "was", "the") match nearly every chunk: leave them out, unless nothing else is left
            kept = (await s.execute(_CONTENT, {"ts": words})).scalars().all()
            words = kept or words
        terms = [f"'{t}'" for t in words]
        hits = [dict(r._mapping) for r in await s.execute(_SEARCH, {**args, "tsq": " | ".join(terms), "k": TOP_K})] if terms else []
        if len(hits) >= MIN_HITS:
            return hits
        first = [dict(r._mapping) for r in await s.execute(_FIRST, args)]
    by_file = [[h for h in first if h["file_id"] == f] for f in file_ids]
    seen = {(h["file_id"], h["idx"]) for h in hits}
    room = {f: PER_DOC - sum(h["file_id"] == f for h in hits) for f in file_ids}  # the per-document cap counts real hits too
    out = list(hits)  # the few real matches stay first; first chunks fill up to the caps
    for i in range(PER_DOC):
        for g in by_file:
            if i < len(g) and (g[i]["file_id"], g[i]["idx"]) not in seen and room[g[i]["file_id"]] > 0:
                out.append(g[i])
                room[g[i]["file_id"]] -= 1
    return out[:TOP_K]
