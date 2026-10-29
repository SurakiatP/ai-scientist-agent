import asyncio
import json
import uuid

import psycopg
import pytest
from alembic import command

from scientist import documents, sandbox
from scientist import db as dbmod
from scientist.config import get_settings
from test_db import _alembic, newdb, pg  # noqa: F401  (throwaway-Postgres fixtures)
from test_sandbox_runner import S

fid = lambda: uuid.uuid4().hex  # noqa: E731


def ok(*texts, truncated=False):
    return sandbox.ExtractResult(ok=True, pages=[{"page": i, "text": t} for i, t in enumerate(texts, 1)], truncated=truncated)


# --- chunking -----------------------------------------------------------------------------------------------------------
def test_chunks_never_cross_pages_and_carry_page_numbers():
    ch = documents.chunk_pages([{"page": 1, "text": "alpha " * 10}, {"page": 2, "text": ""}, {"page": 3, "text": "beta"}])
    assert [(c["page"], c["idx"]) for c in ch] == [(1, 0), (3, 1)]
    assert ch[1]["text"] == "beta"


def test_chunk_size_and_overlap():
    words = [f"w{i:04d}" for i in range(1000)]
    ch = documents.chunk_pages([{"page": 1, "text": " ".join(words)}])
    assert len(ch) > 3 and all(len(c["text"]) <= 1200 for c in ch)
    for a, b in zip(ch, ch[1:]):  # the next chunk starts inside the previous one (~150 chars)
        tail = a["text"][-150:].split()[-1]
        assert tail in b["text"] and b["text"].split()[0] in a["text"]
    assert {w for c in ch for w in c["text"].split()} == set(words)  # nothing lost
    assert [c["idx"] for c in ch] == list(range(len(ch)))


def test_chunk_unbroken_text_still_terminates():
    ch = documents.chunk_pages([{"page": 1, "text": "x" * 5000}])
    assert all(len(c["text"]) <= 1200 for c in ch) and sum(len(c["text"]) for c in ch) >= 5000


# --- extractor contract -----------------------------------------------------------------------------------------------
def test_validate_extract_shape():
    r = sandbox.validate_extract(json.dumps({"pages": [{"page": 1, "text": "hi"}], "truncated": True}).encode())
    assert r.ok and r.pages == [{"page": 1, "text": "hi"}] and r.truncated
    assert sandbox.validate_extract(b'{"error": "unreadable"}').error == "unreadable"
    for bad in (b"[]", b'{"pages": [{"page": "1", "text": "x"}]}', b'{"pages": [{"page": 1}]}', b"nope", b'{"pages": 3}'):
        assert sandbox.validate_extract(bad).error == "bad_output"


async def test_extract_pdf_runs_base_image_with_pdf_input(tmp_path, monkeypatch):
    seen = {}

    class Pipe:
        def __init__(self, data): self.data = data
        async def read(self, n):
            d, self.data = self.data, b""
            return d

    class P:
        returncode = 0
        def __init__(self): self.stdout, self.stderr = Pipe(b'{"pages": [{"page": 1, "text": "hello"}]}'), Pipe(b"")
        async def wait(self): return 0

    async def exec_(*cmd, **kw):
        seen["cmd"] = list(cmd)
        inp = cmd[cmd.index("-v") + 1].split(":")[0]
        seen["files"] = sorted(p.name for p in __import__("pathlib").Path(inp).iterdir())
        return P()
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_)
    r = await sandbox.extract_pdf(b"%PDF-", S(sandbox_work_dir=tmp_path))
    assert r.ok and r.pages[0]["text"] == "hello"
    assert seen["files"] == ["data.pdf"] and seen["cmd"][-1] == "scientist-sandbox:latest"
    assert "--network" in seen["cmd"] and "none" in seen["cmd"] and "--read-only" in seen["cmd"]


async def test_extract_pdf_failures_map_to_errors(tmp_path, monkeypatch):
    async def boom(*a, **k): raise OSError
    monkeypatch.setattr(asyncio, "create_subprocess_exec", boom)
    r = await sandbox.extract_pdf(b"x", S(sandbox_work_dir=tmp_path))
    assert not r.ok and r.error == "docker_unavailable"


# --- index + retrieval (real Postgres) --------------------------------------------------------------------------------
def sql(db, q, *a):
    with psycopg.connect(host="127.0.0.1", port=db["port"], user="app", password=db["password"], dbname=db["name"], autocommit=True) as c:
        cur = c.execute(q, a)
        return cur.fetchall() if cur.description else None


@pytest.fixture
async def d(newdb):
    command.upgrade(_alembic(), "head")
    db = dbmod.open_database(get_settings())
    db.raw = newdb
    yield db
    await db.close()


def mkfile(d, name="a.pdf"):
    f = fid()
    sql(d.raw, "insert into files (id, name, size, kind) values (%s, %s, 1, 'pdf')", f, name)
    return f


def loader(data=b"%PDF"):
    async def load(): return data
    return load


def counting(result):
    calls = []

    async def extract(data, settings):
        calls.append(data)
        await asyncio.sleep(0.05)
        return result
    extract.calls = calls
    return extract


async def test_index_ready_with_pages_and_chunks(d):
    f, ex = mkfile(d), counting(ok("first page about enzymes", "second page about ribosomes", truncated=True))
    st = await documents.ensure_index(d, f, loader(), S(), ex)
    assert st == {"file_id": f, "status": "ready", "pages": 2, "chunks": 2, "truncated": True, "error": None}
    assert sql(d.raw, "select page, idx from doc_chunks where file_id=%s order by idx", f) == [(1, 0), (2, 1)]
    assert await documents.ensure_index(d, f, loader(), S(), ex) == st and len(ex.calls) == 1  # lazily once


async def test_concurrent_questions_index_once(d):
    f, ex = mkfile(d), counting(ok("enzymes " * 20))
    a, b = await asyncio.gather(documents.ensure_index(d, f, loader(), S(), ex), documents.ensure_index(d, f, loader(), S(), ex))
    assert a["status"] == b["status"] == "ready" and len(ex.calls) == 1
    assert sql(d.raw, "select count(*) from doc_chunks where file_id=%s", f)[0][0] == a["chunks"]


async def test_unreadable_is_remembered_but_transient_failure_retries(d):
    f = mkfile(d)
    bad = counting(sandbox.ExtractResult(ok=False, error="unreadable"))
    st = await documents.ensure_index(d, f, loader(), S(), bad)
    assert st["status"] == "failed" and st["error"] == "unreadable"
    await documents.ensure_index(d, f, loader(), S(), bad)
    assert len(bad.calls) == 1
    g = mkfile(d)
    flaky = counting(sandbox.ExtractResult(ok=False, error="timeout"))
    assert (await documents.ensure_index(d, g, loader(), S(), flaky))["status"] == "failed"
    assert sql(d.raw, "select count(*) from doc_index where file_id=%s", g)[0][0] == 0  # nothing stuck: next question retries
    good = counting(ok("fine now"))
    assert (await documents.ensure_index(d, g, loader(), S(), good))["status"] == "ready"


async def test_stale_indexing_row_is_taken_over(d):
    f = mkfile(d)
    sql(d.raw, "insert into doc_index (file_id, status, created_at) values (%s, 'indexing', now() - interval '1 hour')", f)
    assert (await documents.ensure_index(d, f, loader(), S(), counting(ok("x y z"))))["status"] == "ready"


async def test_image_only_pdf_is_ready_with_zero_chunks(d):
    f = mkfile(d)
    st = await documents.ensure_index(d, f, loader(), S(), counting(ok("", "  ")))
    assert st["status"] == "ready" and st["chunks"] == 0 and st["pages"] == 2
    assert await documents.search(d, [f], "anything") == []


async def test_search_ranks_matches_and_caps(d):
    f = mkfile(d)
    pages = [f"filler text page {i} " * 3 for i in range(1, 9)]
    pages[4] = "mitochondria produce ATP through oxidative phosphorylation"
    await documents.ensure_index(d, f, loader(), S(), counting(ok(*pages)))
    hits = await documents.search(d, [f], "how do mitochondria make ATP?")
    assert hits[0]["page"] == 5 and hits[0]["file_id"] == f and len(hits) <= 6


async def test_search_falls_back_to_first_chunks_per_document(d):
    a, b = mkfile(d, "a.pdf"), mkfile(d, "b.pdf")
    await documents.ensure_index(d, a, loader(), S(), counting(ok(*[f"alpha page {i}" for i in range(1, 10)])))
    await documents.ensure_index(d, b, loader(), S(), counting(ok(*[f"beta page {i}" for i in range(1, 10)])))
    hits = await documents.search(d, [a, b], "การสังเคราะห์แสงคืออะไร")  # Thai question, no match
    assert len(hits) == 12 and {h["file_id"] for h in hits} == {a, b}
    assert [h["page"] for h in hits if h["file_id"] == a] == sorted(h["page"] for h in hits if h["file_id"] == a)
    assert sum(h["file_id"] == a for h in hits) == 6 and min(h["page"] for h in hits) == 1


async def test_search_caps_six_per_document_twelve_total(d):
    ids = [mkfile(d, f"{i}.pdf") for i in range(3)]
    for f in ids:
        await documents.ensure_index(d, f, loader(), S(), counting(ok(*[f"cell membrane page {i}" for i in range(1, 11)])))
    hits = await documents.search(d, ids, "cell membrane")
    assert len(hits) == 12 and all(sum(h["file_id"] == f for h in hits) <= 6 for f in ids)
    assert all(len(h["text"]) <= 1200 for h in hits)


async def test_permanent_delete_and_purge_cascade_to_index(d):
    f = mkfile(d)
    await documents.ensure_index(d, f, loader(), S(), counting(ok("one", "two")))
    sql(d.raw, "delete from files where id=%s", f)
    assert sql(d.raw, "select (select count(*) from doc_chunks), (select count(*) from doc_index)") == [(0, 0)]


# --- runner extract mode ------------------------------------------------------------------------------------------------
def test_runner_extract_installs_hook_before_parsing_and_runs_no_model_code():
    from pathlib import Path
    src = (Path(sandbox.__file__).parents[2] / "sandbox/runner.py").read_text()
    body = src[src.index("def extract("):src.index("def main(")]
    assert body.index("import pypdf") < body.index("block_fork_exec()") < body.index("sys.addaudithook(audit_block)") < body.index("PdfReader(")
    assert "exec(code" not in body and "script.py" not in body
    assert 'if path.suffix == ".pdf"' in src and "pypdf==" in (Path(sandbox.__file__).parents[2] / "sandbox/Dockerfile").read_text()


def _make_pdf(pages: int) -> bytes:
    from fpdf import FPDF
    pdf = FPDF()
    for i in range(1, pages + 1):
        pdf.add_page()
        pdf.set_font("Helvetica", size=12)
        pdf.multi_cell(0, 8, f"Page {i}. Mitochondria produce ATP through oxidative phosphorylation. marker-{i}")
    return bytes(pdf.output())


@pytest.mark.skipif(not __import__("shutil").which("docker") or __import__("subprocess").run(
    ["docker", "image", "inspect", "scientist-sandbox:latest"], capture_output=True).returncode, reason="base sandbox image not built")
async def test_live_extract_real_pdf_and_garbage():
    s = S()  # default work dir under $HOME: Docker Desktop shares it
    r = await sandbox.extract_pdf(_make_pdf(3), s)
    assert r.ok and [p["page"] for p in r.pages] == [1, 2, 3] and "marker-2" in r.pages[1]["text"] and not r.truncated
    bad = await sandbox.extract_pdf(b"%PDF-1.4 this is not a pdf", s)
    assert not bad.ok and bad.error == "unreadable"
