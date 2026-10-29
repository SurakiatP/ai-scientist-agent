# Chat Over Uploaded Documents + Bibliography Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A researcher attaches one or more PDFs from "ไฟล์ของฉัน" to a question and gets an answer grounded only in those documents, with page-cited quotes; and any answer's references can be downloaded as BibTeX or RIS (TOR: "สรุปบทความวิชาการ…", "การสื่อสารงานวิจัย … บรรณานุกรม").

**Architecture:** PDF text is extracted inside the existing network-less analysis sandbox (`runner.py` gains an `extract` mode using the already-pinned `pypdf`), never in the backend process, because PDFs are untrusted input. Pages are split into chunks stored in a new `doc_chunks` table with a generated `tsvector`; retrieval uses Postgres full-text search (`websearch_to_tsquery` + `ts_rank_cd`, `simple` config) — a native feature, no vector extension or embedding provider. A new ask mode `docs` takes `doc_ids`, retrieves the top chunks, and answers with one model call whose data block holds the chunks; citations are `[n]` that point to document passages; quotes are verified as exact substrings of the cited chunk (same `_exact` rule as the reviewer). BibTeX/RIS export is pure frontend from `answer.references`.

**Tech Stack:** FastAPI + SQLAlchemy/Alembic + Postgres FTS, the analysis sandbox image, Next.js 16 + MUI, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 8). Deviation (ruled): the spec names pgvector; this plan uses Postgres full-text search — the dev and deploy Postgres images have no `vector` extension, there is no embedding provider configured, and FTS is a native feature that needs neither. Upgrade path: add an embedding column later without changing the API.

## Global Constraints

- Extraction: runner `extract` mode reads `/in/data.pdf`, uses `pypdf` (add the exact pin already in `backend/pyproject.toml`, `pypdf==<that version>`, to `backend/sandbox/Dockerfile` and the science constraints if needed), outputs JSON `{"pages": [{"page": n, "text": "..."}]}` (1-based page numbers), stops after 300 pages or 2,000,000 characters total (note `truncated: true`), never runs model code; same container flags and timeout as analysis (`sandbox_timeout_s`). Encrypted/corrupt PDFs → `{"error": "unreadable"}`.
- Indexing runs once per PDF, lazily on first use (no upload-time background job), guarded so two concurrent questions do not index twice (a row in `doc_index(file_id pk, status, pages, chunks, truncated, error, created_at)`; statuses `indexing|ready|failed`). Chunks: ~1,200 characters with 150 overlap, never across pages; `doc_chunks(id, file_id, page, idx, text, tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED)` with a GIN index on `tsv` and an index on `file_id`. Migration `0006_documents`. Deleting a file (permanent) deletes its index rows (FK `ON DELETE CASCADE` to whatever table owns files, or explicit delete in the same transaction — follow the code).
- Retrieval: `websearch_to_tsquery('simple', question)` OR-ed with each English search term the model would use? — no: keep it deterministic: query = the user's question; if it yields fewer than 3 chunks, fall back to the first chunks of each document (page order) so short or Thai questions still get context. Top 12 chunks total across the selected documents, at most 6 per document, each ≤ 1,200 chars.
- `mode: "docs"` on the ask/run request with `doc_ids: list[str]` (1–5 file ids, each must exist, be a PDF, not deleted); guardrail runs as for deep mode; no Hermes branches, no re-plan, no reviewer. One model call (`prompts/docs.md`): answer only from the passages, cite `[n]` right after each claim, say plainly when the documents do not cover the question; passages are untrusted data in an escaped `<data>` block. Output event: `FinalAnswer` with `references: []`, new `doc_refs: list[DocRef]`, `DocRef(id: str, file_id, file_name, page: int, text: str ≤ 1,200, quote: str | None ≤ 600)` — the model returns, per cited `[n]`, an optional exact quote; keep it only if `_exact` passes against that chunk. Provenance for docs answers: models, `docs` prompt hash, `doc_ids` + per-file sha256 (of the PDF bytes that were indexed), retrieval settings (top-k numbers), usage.
- UI (/impeccable — read DESIGN.md and `/Users/parksurakiat/.claude/skills/impeccable/reference/craft-floor.md` or invoke the skill): the composer's attach button accepts PDFs from "ไฟล์ของฉัน" (and the Files page gains an "ถามจากเอกสาร / Ask about this document" action next to "วิเคราะห์"); attached PDFs show as chips like the CSV chip (up to 5); the mode chip is replaced by a fixed "จากเอกสาร / From documents" label while PDFs are attached; the answer shows citation pills `[n]` that open the existing inspector panel with file name, "หน้า N / page N", the quote (block quote like the reviewer evidence) and the passage text; a sources line "เอกสาร: <names>". While indexing: progress text "กำลังอ่านเอกสาร… / Reading the documents…". Unreadable PDF: a clear error naming the file. th/en strings.
- Bibliography export (frontend only, `lib/bibliography.ts`, pure): from `answer.references` produce BibTeX (`@article{<firstauthorlastname><year><n>, title, author = {A and B}, year, doi, pmid as note, url}` with LaTeX-special characters escaped and Thai left as UTF-8) and RIS (`TY  - JOUR`, `TI`, `AU` per author, `PY`, `DO`, `UR`, `ER  -`); two buttons in the finished research answer's action row (next to provenance download), filenames `ai-scientist-references-<date>-<id8>.bib|.ris`. Not shown for answers without references.
- Never read or print `.env` or secrets. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. A PDF with an embedded JavaScript/launch action or a decompression bomb: extraction stays inside the sandbox limits; the backend never parses PDF bytes.
2. A question whose words appear in no chunk, a Thai question over an English PDF, an image-only (scanned) PDF with no text: the answer says the documents do not cover it / the file has no extractable text — no invented content.
3. Two questions on the same new PDF at once: indexed once; the second waits or reads the ready index.
4. A model citing `[7]` when only 5 passages exist, or quoting text not in the chunk: dropped.
5. BibTeX special characters (`{ } % & _ # $ \`), missing year/authors, duplicate keys; RIS line endings and one `ER  -` per record.

---

### Task 1: Sandbox text extraction + document index (backend)

**Files:** `backend/sandbox/runner.py` (extract mode), `backend/sandbox/Dockerfile` (+ science constraints if pypdf missing there), `backend/src/scientist/sandbox.py` (`extract_pdf(data, settings) -> ExtractResult`), create `backend/src/scientist/documents.py` (chunking, indexing with the `doc_index` guard, retrieval), `backend/src/scientist/models.py` + `backend/migrations/versions/0006_documents.py`, file delete path (cascade), tests `backend/tests/test_documents.py` (new; DB-backed like test_store) and runner tests.

- [ ] Tests first (chunking rules, page numbers, guard against double indexing, retrieval fallback, cascade on delete, extractor JSON contract with a fake runner). Live: build the base sandbox image locally, extract a small real PDF (generate one with fpdf2 in the test or scratch) through `extract_pdf`; remove the image after. Commit `feat(documents): extract PDF text in the sandbox and index it for full-text search`.

### Task 2: `docs` answers with page-cited passages (backend)

**Files:** `backend/src/scientist/routes_ask.py`/`routes_runs.py` (mode docs + doc_ids validation), `backend/src/scientist/pipeline.py` (or a new `docs_answer.py` called from it), `backend/src/scientist/prompts/docs.md`, `backend/src/scientist/events.py` (DocRef, FinalAnswer.doc_refs, progress event for indexing if needed), `backend/src/scientist/provenance.py`, runs/store persistence of `doc_refs` (follow `records`), tests.

- [ ] Tests first (Review Focus 2–4; provenance; persistence). Commit `feat(documents): answer from attached PDFs with page-cited, verified quotes`.

### Task 3: Ask about documents in the UI (frontend, /impeccable)

**Files:** `frontend/src/components/chat/Composer.tsx` (PDF chips, fixed label), `frontend/src/components/files/FileDialogs.tsx`/`FilesPage.tsx` (action), `frontend/src/lib/run.ts`/`sse.ts`/`runs.ts` (mode docs, doc_ids), `frontend/src/lib/chat.ts` (doc_refs validation), `frontend/src/components/chat/AgentMessage.tsx` + `components/research/SourceInspector.tsx` (doc citations), `frontend/src/lib/strings.ts`; tests.

- [ ] Read DESIGN.md + craft floor; tests first; `npm test`, eslint, tsc, build. Commit `feat(chat): ask questions about your PDFs with page citations`.

### Task 4: BibTeX and RIS export (frontend)

**Files:** create `frontend/src/lib/bibliography.ts` + test; `frontend/src/components/chat/AgentMessage.tsx` (two buttons); `frontend/src/lib/strings.ts`.

- [ ] Tests first (Review Focus 5). Commit `feat(chat): download references as BibTeX or RIS`.

### Task 5: Live check (controller)

- [ ] Worktree stack (:8100/:3100, own DB/bucket). Upload a real multi-page research PDF (generate one locally with fpdf2 containing known text, or use an open-access paper PDF only if already on disk — do not download files); ask a question it answers and one it does not; check page citations, quotes, the "not covered" answer, BibTeX/RIS files from a research answer.
