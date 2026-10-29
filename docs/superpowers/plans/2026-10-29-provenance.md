# Provenance Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every finished research or analysis answer can be downloaded as one provenance file that says exactly how it was produced — models, prompt versions, pinned Hermes and skill revisions, sandbox images, the search terms of every round, the papers and database records with their identifiers and checks, analysis code, timings and cost — so a researcher can audit and repeat it (TOR: "ผลลัพธ์งานวิจัยทุกชิ้นมีการบันทึกที่มา (provenance) ทำซ้ำได้").

**Architecture:** The backend freezes the run's facts at the end of the pipeline into `FinalAnswer.provenance` (small JSON, no paper text), persisted with the turn answer like `usage` (runs are deleted after 7 days; turns are not). The frontend builds the downloadable file from the turn: `provenance` + question + answer + references (identifiers, source, status, checks) + records + analysis script; one JSON file, `ai-scientist-provenance-<date>-<turn id 8>.json`. No new route, no migration.

**Tech Stack:** FastAPI + pydantic, Next.js 16 + MUI, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 6)

## Global Constraints

- Backend `Provenance` (events.py), all fields required unless noted:
  `schema: Literal[1]`, `created_at: str` (UTC ISO-8601), `app_version: str | None` (env `APP_VERSION`, e.g. the image tag; None when unset),
  `models: {main: str, fallback: str}`,
  `prompts: {name: sha256-hex[:16]}` for every prompt file the run used (strategy, replan, branch as built incl. the database part, synthesis, review; analysis prompt for analysis runs),
  `hermes: {revision: str, skills_revision: str, enabled_skills: list[str], branch_image: str}` (research runs) — `branch_image` is `hermes.SANDBOX_IMAGE`,
  `sandbox_image: str | None` (analysis runs: `settings.sandbox_image`),
  `settings: {max_branches, branch_max_rounds, branch_token_cap, max_papers_per_branch, max_records_per_branch, replan_rounds, replan_min_papers, replan_max_searches, review_enabled}` (research) — values as used,
  `rounds: list[{round: int, searches: list[{term, instructions}], thin: list[str] | None}]` (round 1 = the strategy/approved plan, later rounds = re-plans with their thin terms),
  `phase_seconds: dict[str, float]`, `usage: RunUsage | None`.
  Never include secrets, API keys, URLs with credentials, paper abstracts, or the question text (the frontend adds the question from the turn).
- `FinalAnswer.provenance: Provenance | None = None` on every research FinalAnswer (both paths) and on the analysis final result event if analysis has one (follow the code; if analysis has no final event carrying an answer, put provenance on the analysis result object the turn stores). Persisted with the turn like `usage`; old turns without it load.
- Frontend download: a button in the finished answer's action row (same style as the existing copy / report buttons; icon from @mui/icons-material) labelled "ดาวน์โหลดที่มา" / "Download provenance", visible only when `answer.provenance` exists. File shape: `{format: "ai-scientist-provenance", version: 1, exported_at, turn: {id, question, mode, created_at}, answer: {content, references: [{id, title, authors, year, doi, pmid, url, source, status, checks}], records}, analysis: {script} | null, provenance}`. Uses a Blob + temporary link (no new dependency), `application/json`, UTF-8, pretty-printed. /impeccable: read DESIGN.md and `/Users/parksurakiat/.claude/skills/impeccable/reference/craft-floor.md` (or invoke the skill); th/en strings.
- Validation on read in the client (`lib/chat.ts` clean path): keep `provenance` only if it is an object with `schema === 1`; otherwise drop the field, never the turn. Size bound: drop if its JSON is over 50 KB.
- Never read or print `.env` or secrets. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. A user-edited plan (no strategy call) and a re-planned run: `rounds` lists exactly what was searched, in order.
2. Prompt hashes change when a prompt file changes and are stable otherwise (hash the exact text sent, incl. the branch prompt's database part).
3. No secret or credential can reach the file (settings dump is an allow-list, not `settings.model_dump()`).
4. Old turns: no button, no errors.
5. Stopped/failed runs: no FinalAnswer → no provenance; nothing half-written.

---

### Task 1: Backend provenance on the final answer

**Files:** `backend/src/scientist/events.py` (Provenance, FinalAnswer.provenance), `backend/src/scientist/pipeline.py` (collect rounds, build at both research FinalAnswer yields), `backend/src/scientist/hermes.py` (expose the built branch system prompt text and revisions it already knows), `backend/src/scientist/routes_analyze.py` / analysis path (provenance for analysis results — follow the code), `backend/src/scientist/config.py` (`app_version: str | None = None`), `backend/src/scientist/runs.py` + `store.py` only if `provenance` needs an explicit pass-through like `records`/`usage`, env examples + README row for `APP_VERSION`; create `backend/src/scientist/provenance.py` (builder + prompt hashing); tests `backend/tests/test_provenance.py` (new), `test_pipeline.py`, persistence tests as for `usage`.

- [ ] Tests first (Review Focus 1–3, 5; persistence round-trip; secrets absent: build with a Settings whose openrouter key is a sentinel string and assert the sentinel is nowhere in the JSON). Implement; full backend suite. Commit `feat(provenance): freeze how each answer was produced on the final answer`.

### Task 2: Download the provenance file (frontend, /impeccable)

**Files:** `frontend/src/lib/sse.ts` (Provenance type, final_answer.provenance), `frontend/src/lib/chat.ts` (+ `lib/run.ts` if needed) keep/validate, `frontend/src/lib/provenance.ts` (new: build the file object + filename; pure), `frontend/src/components/chat/AgentMessage.tsx` (button), `frontend/src/lib/strings.ts`; tests `frontend/src/lib/provenance.test.ts` + component test.

- [ ] Read DESIGN.md + craft floor; tests first (file shape, filename, abstracts absent from the file, old turn → no button, malformed provenance dropped); implement; `npm test`, eslint, tsc, build. Commit `feat(chat): download a provenance file for each answer`.

### Task 3: Live check (controller)

- [ ] Worktree stack on :8100/:3100 (own DB `scientist_wt`, own Hermes home). One deep question; download the file in Chrome (or read it via the page's Blob through javascript_tool); confirm models, prompt hashes, Hermes revisions, rounds, references with identifiers, records, usage are present and no abstract or key appears.
