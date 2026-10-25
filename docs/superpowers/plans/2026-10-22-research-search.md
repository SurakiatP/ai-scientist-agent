# Research Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A localhost web app where a NECTEC researcher asks a research question (Thai or English) and watches Hermes Agent plan searches, query scholarly sources, and stream back a comparative answer whose DOI/PMID citations were checked to exist.

**Architecture:** FastAPI backend exposes `/v1/...` routes (async/SSE routes are `/v1/async/...`). The ask pipeline is guardrail -> strategy (<=5 search terms) -> parallel branches, each run by a Hermes Agent subprocess using research skills -> synthesis -> citation existence check, streamed as SSE events. A Next.js + MUI frontend calls the backend directly and keeps history/saved items in the browser. No database, no login.

**Tech Stack:** Python 3.12, FastAPI, httpx, pydantic-settings, pytest + pytest-asyncio; Hermes Agent (pinned revision, own Python env, JSON-lines bridge as in `SurakiatP/AI-Job-Search-Agent-Platform-dem`); Next.js 16, React 19, MUI, Zustand; OpenRouter model `openai/gpt-6-luna`.

**Spec:** `docs/superpowers/specs/2026-10-22-ai-scientist-research-search-design.md`

## Global Constraints

- Branch `feature/research-search` (from `origin/develop` of `SurakiatP/ai-scientist-agent`). Never push without the user's say-so.
- Routes: `/v1/<name>`; async/streaming routes `/v1/async/<name>`. The ask stream is `POST /v1/async/ask`.
- Model id, fallback model id, API key, caps and enabled skills come from `.env` only. No model name in code. Default model value in `.env.example`: `openai/gpt-6-luna`.
- Prompt caching on: the shared prefix (system prompt + skill descriptions) goes first and is marked cacheable.
- Guardrail: scientific-research questions only; Thai and English input; refusal makes no agent call.
- Every cited DOI/PMID is checked to exist (existence only). A failed check is flagged visibly, never silently dropped.
- Answers come only from retrieved papers, never from model memory.
- No login, no database. History and saved items live in browser storage.
- Localhost only. Global cap on simultaneous agent runs; no per-IP limit.
- Enabled skills this slice: Paper Lookup, Literature Review, Citation Management, BGPT Paper Search, MarkItDown/LiteParse. Keyed sources are optional via `.env`.
- UI: MUI base, tokenized placeholder palette (swap in Figma colors later), Thai font (Noto Sans Thai). Landing page built with the `impeccable` skill; motion with `motion2code`, in the last task.
- Do not commit `.venv/` or `.python-version`.

## Review Focus

Inputs and conditions the spec implies but does not spell out. Each has a pinning test in the named task.

1. Empty, whitespace-only or very long question -> rejected with a clear error before any model call (Task 2, 6).
2. Thai question -> search terms are English, answer language follows the question (Task 4).
3. Off-topic question (homework, coding help, chit-chat) -> `refused` event, zero Hermes calls (Task 2, 6).
4. Model returns blank or non-JSON strategy -> error event, not a silent empty answer (Task 4).
5. A scholarly source is down or rate-limited -> that branch reports it and the rest continue (Task 4).
6. Fabricated or malformed DOI/PMID -> flagged `unverified`; the verification service being down is `unknown`, not `unverified` (Task 5).
7. Same paper found by several branches -> cited once, one reference entry (Task 4, 5).
8. Client disconnects mid-stream -> Hermes subprocesses are killed, the run slot is released (Task 6).
9. More simultaneous questions than the cap -> extra ones get `waiting` events with queue position and then run (Task 6).
10. Paper text containing instructions ("ignore previous instructions") -> treated as data, never obeyed (Task 4).
11. SSE survives browser-to-backend directly (CORS for the localhost frontend origin) (Task 6, 8).

---

### Task 1: Backend scaffold, settings, health route

**Files:**
- Create: `backend/pyproject.toml`, `backend/src/scientist/__init__.py`, `backend/src/scientist/config.py`, `backend/src/scientist/main.py`, `backend/tests/test_config.py`, `.env.example`, `.gitignore`

**Interfaces:**
- Produces: `Settings` (pydantic-settings, reads `.env`) with fields `openrouter_api_key: str`, `model: str`, `fallback_model: str`, `max_branches: int = 5`, `max_concurrent_runs: int = 4`, `branch_token_cap: int`, `branch_max_rounds: int`, `max_question_chars: int = 2000`, `hermes_source_path: Path`, `hermes_revision: str`, `enabled_skills: list[str]`, `cors_origins: list[str]`; `get_settings() -> Settings` (cached); `create_app() -> FastAPI` in `main.py` with `GET /v1/health -> {"status": "ok"}`.

- [ ] **Step 1: Write failing tests** in `backend/tests/test_config.py`: `test_settings_read_model_from_env` (set `MODEL=openai/gpt-6-luna`, assert `get_settings().model`), `test_missing_api_key_raises`, `test_health_route_returns_ok` (httpx `ASGITransport`).
- [ ] **Step 2: Run** `cd backend && uv run pytest tests/test_config.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the files above. `.gitignore` covers `.venv/`, `.python-version`, `.env`, `node_modules/`, `.next/`. `.env.example` lists every field with safe defaults and no secret.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: backend scaffold, settings and health route`.

### Task 2: Scope guardrail

**Files:**
- Create: `backend/src/scientist/guardrail.py`, `backend/tests/test_guardrail.py`, `backend/tests/data/scope_cases.json`

**Interfaces:**
- Depends on Task 3: do Task 3 first.
- Consumes: `Settings`; `llm.complete` from Task 3 (only for the inconclusive-case model call).
- Produces: `class ScopeVerdict(BaseModel): in_scope: bool; reason: str`; `async def check_scope(question: str, *, settings: Settings) -> ScopeVerdict`.

- [ ] **Step 1: Write failing tests**: `scope_cases.json` holds >=10 Thai and >=10 English cases, each `{"q": ..., "in_scope": bool}`, covering the Review Focus items 1 and 3 plus the NECTEC examples from the spec (e.g. "Thai low-resource LLM continual pretraining benchmarks" in scope; "write my homework essay", "เขียนโค้ด React ให้หน่อย" out of scope). Tests: parametrized over the file; `test_empty_question_out_of_scope`; `test_overlong_question_out_of_scope` (> `max_question_chars`).
- [ ] **Step 2: Run** `uv run pytest tests/test_guardrail.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `check_scope`. Cheap length/empty rules first (no network). Then a keyword/rule pass; only if that is inconclusive, one small-model call (`settings.fallback_model`, tiny `max_tokens`) returning JSON. Tests inject a fake model callable so they never hit the network; add a flag-gated live test (`LIVE=1`).
- [ ] **Step 4: Run** the same command. Expected: PASS; if the Thai cases fail with rules only, record which and keep the model pass for them.
- [ ] **Step 5: Commit** `feat: scope guardrail with Thai and English cases`.

### Task 3: OpenRouter client with prompt caching

**Files:**
- Create: `backend/src/scientist/llm.py`, `backend/tests/test_llm.py`

**Interfaces:**
- Consumes: `Settings`.
- Produces: `async def complete(system: str, user: str, *, model: str | None = None, max_tokens: int, json_mode: bool = False, settings: Settings | None = None) -> LlmResult`; `class LlmResult(BaseModel): text: str; prompt_tokens: int; completion_tokens: int; cached_tokens: int`. On a blank `text`, raise `LlmEmptyError`. On primary-model failure, retry once on `settings.fallback_model`.

- [ ] **Step 1: Write failing tests** with `httpx.MockTransport`: request body places `system` first with a cache marker (the exact marker comes from the OpenRouter docs: check them and pin the field name in the test); blank completion raises `LlmEmptyError`; primary 5xx falls back to the fallback model; `cached_tokens` is read from the response usage block.
- [ ] **Step 2: Run** `uv run pytest tests/test_llm.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** with httpx against `https://openrouter.ai/api/v1/chat/completions`. Whether `openai/gpt-6-luna` honors caching on OpenRouter is unverified; the live test (`LIVE=1`) sends the same long prefix twice and prints `cached_tokens` so we learn it for real.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: openrouter client with prompt caching and fallback`.

### Task 4: Hermes branch runner and ask pipeline

This task has a spike first, because the spec marks the Hermes call mechanism as unverified.

**Files:**
- Create: `backend/src/scientist/events.py`, `backend/src/scientist/hermes.py`, `backend/src/scientist/pipeline.py`, `infra/hermes/setup.md`, `infra/hermes/native_bridge.py`, `backend/tests/test_pipeline.py`, `backend/tests/test_hermes.py`, `backend/tests/fake_bridge.py`

**Interfaces:**
- Consumes: `Settings`, `check_scope`, `complete`.
- Produces:
  - `events.py`: pydantic models `Refused(reason)`, `Waiting(position)`, `Strategy(reasoning, searches: list[Search])`, `Search(term, instructions)`, `Sources(term, papers: list[Paper])`, `Paper(title, authors, year, doi: str|None, pmid: str|None, url)`, `BranchAnswer(term, content)`, `FinalAnswer(content, references: list[Reference])`, `Reference(id, paper: Paper, status: Literal["verified","unverified","unknown"])`, `Complete()`, `Error(message)`; `Event` = union; `to_sse(event) -> str` (`data: <json>\n\n`, with a `type` field).
  - `hermes.py`: `class BranchRunner(Protocol): def run(self, term: str, instructions: str) -> AsyncIterator[BranchItem]` where `BranchItem` is `Paper | BranchAnswer | BranchFailed`; `class HermesRuntime(BranchRunner)` that starts the pinned Hermes in its own env and talks to `native_bridge.py` over stdin/stdout JSON lines (pattern from the reference repo's `integrations/hermes_runtime.py`); `async def close()` kills subprocesses.
  - `pipeline.py`: `async def ask(question: str, runner: BranchRunner, *, settings: Settings) -> AsyncIterator[Event]`.

- [ ] **Step 1: Spike (no product code).** Read `infra/hermes/native_bridge.py` in `SurakiatP/AI-Job-Search-Agent-Platform-dem` and the Hermes docs. Answer in `infra/hermes/setup.md`: how to pin and install Hermes, how to load only the enabled skills, how tool calls and results are surfaced, and whether `Paper` records can be emitted while a branch runs. **If Hermes cannot be driven this way, stop and ask the user. Do not silently replace it with another runtime.**
- [ ] **Step 2: Write failing tests** against a fake runner (`fake_bridge.py` replays scripted JSON lines) in `test_pipeline.py`: event order is `strategy, sources*, answer*, final_answer, complete`; strategy returns 1-5 searches (more are truncated, blank terms dropped, none left -> `Error`); Thai question yields English `term` values; a failing branch does not stop the others and its failure is mentioned; duplicate DOIs across branches become one `Reference`; model returning blank strategy -> `Error`; a paper abstract containing "ignore previous instructions" does not change the output structure (prompt carries paper text inside a data block, tested with a recording fake `complete`). In `test_hermes.py`: bridge process death mid-run -> `BranchFailed`, no hang.
- [ ] **Step 3: Run** `uv run pytest tests/test_pipeline.py tests/test_hermes.py -v`. Expected: FAIL.
- [ ] **Step 4: Implement** the files. Pipeline uses `asyncio.gather` over branches feeding one queue (no LangGraph: one fixed graph does not need it). Prompts live in `backend/src/scientist/prompts/` as plain files; stable text first, question last. Per-branch caps come from `branch_token_cap` and `branch_max_rounds`.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat: hermes runtime and ask pipeline`.

### Task 5: Citation existence check

**Files:**
- Create: `backend/src/scientist/citations.py`, `backend/tests/test_citations.py`

**Interfaces:**
- Consumes: `Paper`, `Reference` from Task 4.
- Produces: `async def verify_references(papers: list[Paper], *, client: httpx.AsyncClient) -> list[Reference]` returning `status` `verified` (DOI resolves via Crossref, PMID via NCBI esummary), `unverified` (definitively absent or malformed), `unknown` (service error or timeout). Deduplicates by normalized DOI (lowercase, strip `https://doi.org/`) or PMID.

- [ ] **Step 1: Write failing tests** with `MockTransport`: real-looking DOI 200 -> `verified`; 404 -> `unverified`; malformed string -> `unverified` without a request; timeout/5xx -> `unknown`; two papers with the same DOI in different forms -> one reference; paper with neither DOI nor PMID -> `unverified`.
- [ ] **Step 2: Run** `uv run pytest tests/test_citations.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** Bounded concurrency (e.g. 8) and a short timeout.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: citation existence check`.

### Task 6: SSE route, run gate, wiring

**Files:**
- Create: `backend/src/scientist/gate.py`, `backend/src/scientist/routes_ask.py`, `backend/tests/test_gate.py`, `backend/tests/test_routes_ask.py`
- Modify: `backend/src/scientist/main.py` (CORS from `cors_origins`, register route, create `HermesRuntime` at startup, close at shutdown), `backend/src/scientist/pipeline.py` (call `verify_references` before `FinalAnswer`)

**Interfaces:**
- Consumes: `ask`, `check_scope`, `verify_references`, `to_sse`.
- Produces: `class RunGate: def __init__(self, limit: int)`; `async def acquire() -> AsyncIterator[int]` (yields queue positions while waiting, then returns holding a slot); `release()`. `POST /v1/async/ask` with body `{"question": str}` -> `text/event-stream`; sends `X-Accel-Buffering: no`.

- [ ] **Step 1: Write failing tests**: `test_gate.py` — limit 2 with 4 callers gives 2 immediate, 2 waiting with positions 1 and 2, and release admits in order. `test_routes_ask.py` — empty/overlong question -> 422 before any model call; off-topic -> a single `refused` event and the fake runner is never called; happy path event order ends in `complete`; client disconnect cancels the run, calls `runner.close` for that run and frees the slot; CORS header present for the configured origin.
- [ ] **Step 2: Run** `uv run pytest tests/test_gate.py tests/test_routes_ask.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** Order inside the stream: validate -> guardrail -> gate (emit `waiting`) -> pipeline -> verification -> complete. Use `try/finally` to release the slot.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Manual smoke** with fakes off and the real key: `curl -N -X POST localhost:8000/v1/async/ask -H 'content-type: application/json' -d '{"question":"..."}'` with one English and one Thai NECTEC question. Record the event stream, token usage and `cached_tokens` in `infra/hermes/setup.md`. This is the first real evidence that Hermes + gpt-6-luna work.
- [ ] **Step 6: Commit** `feat: /v1/async/ask streaming route with run gate`.

### Task 7: Frontend scaffold, MUI theme

**Files:**
- Create: `frontend/` (Next.js 16 app), `frontend/src/theme.ts`, `frontend/src/lib/config.ts`, `frontend/src/app/layout.tsx`, `frontend/src/theme.test.ts`

**Interfaces:**
- Produces: `theme` (MUI `createTheme`) built from one `palette` token object so the Figma colors replace values in one place; Noto Sans Thai loaded; `API_BASE` from `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`).

- [ ] **Step 1: Write failing test** `theme.test.ts`: font family contains "Noto Sans Thai"; every palette token is a valid hex colour.
- [ ] **Step 2: Run** `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the scaffold and theme. Pull component ideas from MUI; Uiverse snippets only for small things (buttons, loaders) restyled to the tokens; Ionic is reference only.
- [ ] **Step 4: Run** `npm test && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: frontend scaffold and mui theme`.

### Task 8: Ask page with live progress

**Files:**
- Create: `frontend/src/lib/sse.ts`, `frontend/src/lib/sse.test.ts`, `frontend/src/app/ask/page.tsx`, `frontend/src/components/ProgressPanel.tsx`, `frontend/src/components/AnswerView.tsx`, `frontend/src/components/ReferenceList.tsx`

**Interfaces:**
- Consumes: event shapes from Task 4 (`type` field values: `refused`, `waiting`, `strategy`, `sources`, `answer`, `final_answer`, `complete`, `error`).
- Produces: `streamAsk(question: string, signal: AbortSignal): AsyncGenerator<AskEvent>` using `fetch` + `ReadableStream` (POST, so not `EventSource`); `AskEvent` TypeScript union mirroring the backend events.

- [ ] **Step 1: Write failing tests** `sse.test.ts`: parses events split across chunk boundaries; ignores comment/blank lines; abort stops the generator; a malformed JSON line yields an `error` event instead of throwing.
- [ ] **Step 2: Run** `npm test -- sse`. Expected: FAIL.
- [ ] **Step 3: Implement** `sse.ts`, then the page: input, a progress panel (waiting position, search plan, sources per term as they arrive), then the answer with a reference list where `unverified` and `unknown` references show a visible warning chip and DOI/PMID links open the paper. Refused shows the reason politely. A stop button aborts the stream.
- [ ] **Step 4: Run** `npm test && npm run build`. Expected: PASS. Then run backend + frontend and ask one real question in the browser; confirm the plan and sources appear before the final answer (use the claude-in-chrome tools to check).
- [ ] **Step 5: Commit** `feat: ask page with live progress and references`.

### Task 9: Browser-side history and saved items

**Files:**
- Create: `frontend/src/lib/history.ts`, `frontend/src/lib/history.test.ts`, `frontend/src/app/saved/page.tsx`
- Modify: `frontend/src/app/ask/page.tsx`

**Interfaces:**
- Produces: `useHistoryStore` (Zustand + `persist`, key `scientist-history-v1`) with `items: HistoryItem[]`, `add(item)`, `toggleSaved(id)`, `remove(id)`, `clear()`; `HistoryItem = {id, question, answer, references, savedAt?, createdAt}`. Cap at 200 items, oldest unsaved dropped first.

- [ ] **Step 1: Write failing tests**: add/toggle/remove; cap drops oldest unsaved, never a saved one; persisted state survives a store re-creation; corrupted storage JSON starts empty instead of crashing.
- [ ] **Step 2: Run** `npm test -- history`. Expected: FAIL.
- [ ] **Step 3: Implement** the store and the saved/history view; add a "save" action on finished answers.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: browser-side history and saved answers`.

### Task 10: Landing page and motion

**Files:**
- Create: `frontend/src/app/page.tsx` and components it needs
- Modify: `frontend/src/theme.ts` if the Figma palette has been supplied by now

- [ ] **Step 1: Invoke the `impeccable` skill** for the landing page: modern, polished, NECTEC researchers as audience, links into `/ask`. Thai and English copy.
- [ ] **Step 2: Invoke the `motion2code` skill** for motion/animation, with `prefers-reduced-motion` respected.
- [ ] **Step 3: Run** `npm run build`, open `/` in the browser at desktop and mobile widths and check it.
- [ ] **Step 4: Commit** `feat: landing page and motion`.

### Task 11: Run instructions and end-to-end check

**Files:**
- Create: `README.md` (replace the stub), `scripts/dev.sh`

- [ ] **Step 1:** `scripts/dev.sh` starts backend and frontend; the README gives setup (uv, Hermes pinned install from `infra/hermes/setup.md`, `.env` from `.env.example`), how to run tests, and the route list.
- [ ] **Step 2: Run** `cd backend && uv run pytest -v` and `cd frontend && npm test && npm run build`. Expected: all PASS.
- [ ] **Step 3: End-to-end** in the browser with 3 questions (English NECTEC-style, Thai, off-topic). Confirm refusal makes no Hermes call and that references are flagged correctly. Report token use per question.
- [ ] **Step 4: Commit** `docs: run instructions`. Do not push.
