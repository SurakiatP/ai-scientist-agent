# Public Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Deep Research answer shows which public source each paper came from, and branches can also pull records from public scientific databases (UniProt, PubChem, ChEMBL, ClinicalTrials.gov, GEO, Materials Project, PDB, ...), so the platform demonstrably uses at least 10 public sources.

**Architecture:** The already-enabled `paper-lookup` skill reaches 18 scholarly APIs but `report_paper` never says which one, so the UI cannot show it. `report_paper` gains a `source` field (normalised against a fixed list; unknown → null, never a rejection). The vetted `database-lookup` skill is enabled, and the bridge gets a second reporting tool, `report_record`, for database records; a record is accepted only when its link is on that database's official host. Records stream like papers, are given to synthesis as context, and are shown under the answer.

**Tech Stack:** FastAPI + pydantic, the Hermes bridge (`infra/hermes/native_bridge.py`), Next.js 16 + MUI, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 2)

## Global Constraints

- One module owns the source lists: `backend/src/scientist/sources.py`. Paper sources = exactly the 18 of `paper-lookup` (pubmed, pmc, europepmc, biorxiv, medrxiv, arxiv, openalex, crossref, semanticscholar, core, unpaywall, opencitations, pubtator3, zenodo, figshare, ror, biostudies, doaj). Data sources = the scientific databases of `database-lookup` (no finance/economics/weather/patent/government-statistics entries), each with display name and official hosts taken from the skill's `references/<db>.md`.
- A paper is never rejected for a missing or unknown `source`; a record is rejected (counted, never silently dropped) when its database is unknown or its URL host is not one of that database's official hosts.
- Key-gated databases (e.g. Materials Project) are skipped when no key is configured; the bridge passes no API keys. The branch prompt says so.
- Records per branch capped (`MAX_RECORDS_PER_BRANCH`, default 20); extras counted in the final note like papers.
- Everything user-visible exists in Thai and English (`frontend/src/lib/strings.ts` parity test). No invented claims in copy.
- Frontend work follows /impeccable (invoke the `impeccable` skill before UI edits and follow its craft floor); match the existing research components' density and idiom.
- Never read or print `.env` or secrets. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. A model that reports `source: "PubMed Central"`, `"Europe PMC"`, `"S2"` or garbage: aliases map to the canonical id, garbage becomes null, the paper is still recorded.
2. A record whose URL is on a look-alike host (`uniprot.org.evil.com`, `http://` vs `https://`, subdomains) — only the official host or its subdomains pass.
3. Old turns stored before this change (no `source`, no `records`) still load and render in the UI and in exports.
4. An answer with records but no papers: today that ends with "No papers were found". Decide explicitly (Task 2) and test it.
5. Prompt-injection text inside a record title/summary reaches synthesis only inside the data block, length-capped, like paper data.

---

### Task 1: Source registry, `source` on papers, `report_record` in the bridge

**Files:** Create `backend/src/scientist/sources.py`; modify `backend/src/scientist/events.py` (Paper.source, new DataRecord, Records event), `infra/hermes/native_bridge.py` (report_paper schema + report_record tool, ALLOWED, emitted events), `backend/src/scientist/hermes.py` (parse `record` / `record_rejected` events into BranchItem); tests `backend/tests/test_sources.py` (new), `backend/tests/test_hermes.py`.

**Interfaces — produces:**
- `sources.PAPER_SOURCES: dict[str, str]` (id → display name), `sources.DATA_SOURCES: dict[str, DataSource]` (`DataSource(name: str, hosts: tuple[str, ...], needs_key: bool)`), `sources.normalize_source(v: object) -> str | None` (case/space/punctuation-insensitive aliases, e.g. "PubMed Central"→pmc, "Europe PMC"→europepmc, "S2"/"Semantic Scholar"→semanticscholar), `sources.record_host_ok(db: str, url: str) -> bool` (https only; host equals an official host or ends with "." + it).
- `events.Paper.source: str | None = None` (validator → normalize_source).
- `events.DataRecord(database: str, id: str, title: str, url: str, summary: str = "")` — `database` must be a DATA_SOURCES key, `url` must pass record_host_ok, `title` ≤ 300, `summary` ≤ 600, `id` ≤ 100 chars (validation errors → rejected record).
- `events.Records(type="records", term: str, records: list[DataRecord])`.
- Bridge stdout adds `{"event":"record","record":{...}}` and `{"event":"record_rejected","record":{database,id,url},"reason":str}`; `report_paper` schema gains optional `source` (string, description lists the 18 ids).
- `hermes.BranchItem` gains `DataRecord | InvalidRecord` (`InvalidRecord(term, key, reason)`, key = `database:id` or None).

- [ ] Tests first (`test_sources.py`): alias table cases from Review Focus 1; `record_host_ok` cases from Review Focus 2 (official host, subdomain, look-alike suffix, http, IP literal, userinfo trick `https://uniprot.org@evil.com/`); every DATA_SOURCES entry has ≥1 host and a name; PAPER_SOURCES has exactly the 18 ids above.
- [ ] Bridge tests (extend `test_hermes.py` the way it already exercises the bridge/parse): a `record` line becomes DataRecord; a bad host becomes InvalidRecord with the reason; `report_paper` with `source` flows to Paper.source.
- [ ] Implement; fill DATA_SOURCES from `~/.cache/scientist/upstream/scientific-agent-skills/skills/database-lookup/references/*.md` at the pinned revision (record in a module comment how hosts were taken). Run `cd backend && uv run pytest -q`.
- [ ] Commit `feat(sources): source registry, paper source field, report_record tool in the Hermes bridge`.

### Task 2: Pipeline, prompts, persistence, skill enablement + vetting record

**Files:** modify `backend/src/scientist/pipeline.py`, `backend/src/scientist/prompts/branch.md`, `backend/src/scientist/prompts/synthesis.md`, `backend/src/scientist/config.py` (`max_records_per_branch: int = Field(20, ge=0)`), `backend/src/scientist/events.py` (FinalAnswer.records), store/runs code that persists the final answer on the turn (trace it: wherever `references` of a turn are written and read, `records` must follow), `.env.example`, `infra/deploy/app.env.example` (`ENABLED_SKILLS=["paper-lookup","database-lookup"]`); create `docs/skills/vetting.md`; tests `backend/tests/test_pipeline.py`, store/runs tests that cover turn persistence.

**Interfaces — consumes Task 1; produces:** `FinalAnswer.records: list[DataRecord] = []`; SSE `records` events during the run; persisted turn field `records` (absent on old turns = empty list).

- [ ] Tests first: records stream as `records` events and arrive deduplicated (by database+id) in `FinalAnswer.records`; per-branch cap + note; rejected records counted in the note; synthesis user message contains a records block with each record capped (title 300, summary 600) and marked as untrusted data like the papers block; **Review Focus 4 ruling:** records but zero papers → still "No papers were found …" error (the answer must cite literature; records are supporting data) — test it; old persisted turns without `records` load.
- [ ] Branch prompt: use `paper-lookup` for literature (report `source` with the API you used), `database-lookup` for database facts (report each with `report_record`, official link), skip key-gated databases, keep calls bounded. Synthesis prompt: records may be mentioned by database and ID, never as citations `[n]`.
- [ ] `docs/skills/vetting.md`: for `paper-lookup` and `database-lookup` at revision `593377bb048752abb0152deab9fbb1083a6087df`: file list, scripts and what they execute, hosts contacted (grep of the skill dir), install-time code (none expected — verify), credentials read (env vars named in the skill), decision and date. One section per skill. State that branch containers run with the egress filter from the sandbox runner.
- [ ] Run the whole backend suite. Commit `feat(research): database records from vetted database-lookup skill, sources on papers, skill vetting record`.

### Task 3: Frontend — source on references, records under the answer (use /impeccable)

**Files:** modify `frontend/src/lib/sse.ts` (Paper.source, DataRecord, records event, final_answer.records), the run/turn types and reducers that store `references` (trace `final_answer` handling in `lib/run.ts`/`lib/chat.ts`), `frontend/src/components/research/SourceInspector.tsx`, the reference list/chip components, `frontend/src/components/research/ProgressCard.tsx` (sources used so far), `frontend/src/lib/strings.ts` (th/en); a new `frontend/src/components/research/DataRecords.tsx` if the answer view needs it; tests next to the touched components.

**Interfaces — consumes Task 2's SSE + persisted shape.**

- [ ] Invoke the `impeccable` skill first (Skill tool) and follow its setup + craft floor for this refinement of an existing surface (Operate mode). Keep the existing visual language (DESIGN.md).
- [ ] Each reference shows its source's display name (e.g. "Europe PMC") where the chip/inspector shows provenance today; missing source shows nothing new (old turns unchanged).
- [ ] ProgressCard shows the distinct sources seen so far during a run (names, not a fabricated count of databases available).
- [ ] Under the answer: a compact "ข้อมูลจากฐานข้อมูล / Database records" list — database name, record id, title, external link (http(s) only, `rel="noopener noreferrer"`), summary truncated; hidden when there are none. Keyboard and screen-reader accessible; works in light/dark; narrow widths wrap without horizontal scroll.
- [ ] Tests (vitest): source label rendering incl. missing source; records list hidden when empty, shown with link attributes; th/en parity test still passes; old turn without records renders.
- [ ] `cd frontend && npm test && node node_modules/eslint/bin/eslint.js src && npx tsc --noEmit && npm run build`. Commit `feat(chat): show the source of each reference and database records under the answer`.

### Task 4: Live acceptance (controller-run, no subagent)

- [ ] Run this worktree's backend on 127.0.0.1:8100 and frontend on :3100 (never 8000/3000/8001), using the main checkout's `.env` via a symlink in the worktree root (never read or print it), `CORS_ORIGINS`/`ALLOWED_ORIGINS` for :3100.
- [ ] In Chrome: one Deep Research question that needs literature + a database (e.g. "What is known about the binding of imatinib to ABL1? Include UniProt and ChEMBL data."): references show sources, records list shows official-host links, ProgressCard lists sources. Count distinct sources across this and one more question; record in the ledger. Stop both servers by PID.
