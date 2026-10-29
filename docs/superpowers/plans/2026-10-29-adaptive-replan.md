# Adaptive Re-plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a search comes back thin (fewer than 2 usable papers, or it failed), the pipeline asks the strategy model for broader or alternative terms and runs one extra round, shown to the user as a plan change; "No papers were found" is reached only after that round is also empty (TOR §3 "ปรับแผนได้เมื่อผลระหว่างทางไม่เป็นไปตามที่คาด").

**Architecture:** `pipeline._run` becomes a loop over at most `1 + REPLAN_ROUNDS` rounds feeding the same queue consumer, so papers, records, answers, caps and notes accumulate across rounds exactly as today. Between rounds, `_replan()` makes one JSON-mode strategy call with the thin terms and what they returned, and a new `replan` SSE event announces the extra searches. Progress reducers (frontend `progress.ts` and its backend port `runs.reduce_progress`) append the new searches and keep a `replans` list for the UI.

**Tech Stack:** FastAPI + pydantic, OpenRouter via `scientist.llm`, Next.js 16 + MUI, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 3)

## Global Constraints

- Settings (config.py, pydantic, env-overridable): `replan_rounds: int = Field(1, ge=0, le=2)` (0 disables), `replan_min_papers: int = Field(2, ge=1)`, `replan_max_searches: int = Field(3, ge=1, le=5)`. Documented in `.env.example`, `infra/deploy/app.env.example` and the README settings table.
- Re-plan runs in `deep` mode only (never `quick`, `chat`, `plan_only`). It runs whether the plan came from the model or from the user's edited plan (the user approved the intent; the change is shown, not hidden).
- A search is thin when, after its branch finished, it contributed fewer than `replan_min_papers` papers that were newly accepted (duplicates of papers already found by another search do not count), or its branch failed.
- Extra searches: at most `replan_max_searches`, English only (drop terms with Thai characters, like `_strategy`), never equal (case-insensitive, whitespace-collapsed) to any term already searched in this run. If the re-plan call fails or yields nothing new, the run continues to synthesis/notes exactly as today — a re-plan failure never errors the run.
- The extra round uses the same gate slot, the same runner, the same per-branch caps and dedupe. Total searches in a run never exceed `max_branches + replan_rounds * replan_max_searches`.
- New event `Replan(type="replan", reasoning: str, thin: list[str], searches: list[Search])` emitted before the extra round's branches start. Old turns and run events without it load unchanged.
- Untrusted data rule: the re-plan prompt receives only the question, the thin terms and per-term counts — never paper titles/abstracts/summaries (they are untrusted and would let a page steer the plan).
- Every user-visible string in Thai and English (`frontend/src/lib/strings.ts` parity). Frontend work follows /impeccable: read `DESIGN.md` and `/Users/parksurakiat/.claude/skills/impeccable/reference/craft-floor.md` before editing (or invoke the skill) and keep the shipped visual language (tokens only, flat hairlines, status with text, honest counts).
- Never read or print `.env` or secrets. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. All first-round searches thin and the re-plan returns the same terms (or Thai terms, or garbage JSON): no extra round, no crash, notes as today.
2. A paper found in round 1 and again in round 2: counted once, does not make the round-2 search "not thin" by itself, no double reference.
3. The user stops the run during the re-plan call or during round 2: branches killed, run ends `stopped` like today.
4. A round-2 search fails: the "search failed" note names it like a round-1 failure.
5. Run replay (`/v1/runs/{id}/events`) and a reload mid-run show the plan change and the extra searches in the progress card.

---

### Task 1: Backend re-plan loop

**Files:** modify `backend/src/scientist/config.py`, `backend/src/scientist/events.py` (Replan, add to the Event union and wherever event types are enumerated), `backend/src/scientist/pipeline.py`, `.env.example`, `infra/deploy/app.env.example`, `README.md` (settings table); create `backend/src/scientist/prompts/replan.md`; tests `backend/tests/test_pipeline.py` (and `backend/tests/test_config.py` if settings defaults are tested there).

**Interfaces — produces:** `events.Replan`; `pipeline._replan(question: str, thin: list[tuple[str, int]], tried: list[str], settings: Settings, history) -> Replan | None`; SSE order: `strategy` → round-1 `sources`/`records` → `replan` → round-2 `sources`/`records` → all `answer`s → `final_answer` → `complete` (answers stay held back until every round is done, as today).

- [ ] Tests first (fake runner + patched `llm.complete`, following existing test_pipeline patterns): thin detection (0 papers, 1 paper, failed branch, duplicate-only search); replan event shape and position; round-2 papers reach final references and synthesis; Review Focus 1–4; `replan_rounds=0` → identical event sequence to today; `quick` mode never re-plans; total-search ceiling.
- [ ] `prompts/replan.md`: short; input = question + JSON list of `{term, papers_found}` for thin searches + list of terms already tried; output JSON `{"reasoning": "...", "searches": [{"term","instructions"}]}`; broader or alternative English terms (synonyms, broader concept, different field vocabulary), never a repeat; same untrusted-input sentence as strategy.md.
- [ ] Implement; full backend suite once. Commit `feat(research): re-plan thin searches with one extra round before giving up`.

### Task 2: Progress reducers + UI (use /impeccable)

**Files:** modify `backend/src/scientist/runs.py` (`reduce_progress` replan case) + `backend/tests/test_runs.py` parity test; `frontend/src/lib/sse.ts` (replan event type), `frontend/src/lib/progress.ts` (`replans?: {reasoning, thin, searches}[]`, append searches, phase stays "searching"), `frontend/src/components/research/ProgressCard.tsx` and `ProgressPanel.tsx` (show the plan change), `frontend/src/lib/strings.ts`, tests next to the touched files; any `isProgress`/clamp validation in `frontend/src/lib/chat.ts` that whitelists progress keys.

**Interfaces — consumes Task 1's `replan` event.**

- [ ] Read DESIGN.md + craft floor first (or invoke `impeccable`). Placement: in ProgressCard and ProgressPanel, at the point where the extra searches join the list, one quiet line "ปรับแผน: ผลจาก “<thin terms>” น้อย จึงค้นเพิ่ม <n> คำ" / "Plan adjusted: few results for “…”, searching <n> more terms" (exact copy may be refined but must state what was thin and that more searches were added); the extra search rows appear like the others and are marked as added (text, not colour alone). Finished turns keep the line. No new colours, no cards, no motion beyond what exists.
- [ ] Reducer parity: frontend and backend produce the same progress for the same event list including `replan` (extend the existing parity test fixture). Old progress without `replans` validates.
- [ ] Tests (vitest): reducer appends searches and records the replan; ProgressCard shows the line and the added searches; finished turn keeps it; th/en parity.
- [ ] `cd frontend && npm test && node node_modules/eslint/bin/eslint.js src && npx tsc --noEmit && npm run build`; backend suite. Commit `feat(chat): show plan changes and the extra searches in the progress card`.

### Task 3: Live acceptance (controller)

- [ ] Worktree stack on :8100/:3100 with its own database `scientist_wt` and Hermes home (never 8000/3000/8001; check no `scientist.branch` containers are running before start and stop). Ask one question likely to be thin for some terms (e.g. a niche Thai-language topic or a very recent method) and confirm in Chrome: the plan-change line appears, the extra searches run, the answer cites round-2 papers or ends with the honest note. Record branch outcomes in the ledger. Stop servers by PID.
