# Branch Cost Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every research run records the tokens and cost of its Hermes branches (today only the guardrail/strategy/re-plan/synthesis calls are counted), and the finished answer shows the run's total cost and token count, as the TOR's run page asks ("ค่าใช้จ่ายสะสม").

**Architecture:** When a branch ends (answer, failure or interrupt), the bridge emits one `{"event":"usage", ...}` line built from the pinned Hermes agent's own session counters (`session_prompt_tokens`, `session_completion_tokens`, `session_estimated_cost_usd`, `session_cost_status`, `session_api_calls`). `hermes.py` turns it into a `BranchUsage` item; the pipeline adds it to the run's usage accumulator (`scientist.usage.note`) and keeps a per-run total that the final answer carries as `usage: {prompt_tokens, completion_tokens, cost_usd, estimated}`. The frontend shows it under the answer.

**Tech Stack:** FastAPI + pydantic, the Hermes bridge, Next.js 16 + MUI, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 7)

## Global Constraints

- Usage line shape (bridge stdout): `{"event":"usage","prompt_tokens":int,"completion_tokens":int,"cost_usd":float|null,"cost_status":str,"api_calls":int}`. Emitted exactly once per bridge run, last, also after `failed` and after an interrupt (finally). Non-numeric/negative counters → 0; cost null when Hermes reports no amount.
- Branch usage is added with the existing `scientist.usage.note(prompt, completion, cost)` so `usage_events` rows and `/v1/usage/summary` include it; a branch with cost null leaves the run cost as "partly estimated" (`estimated: true`) — never invent a number.
- `FinalAnswer.usage: RunUsage | None = None` with `prompt_tokens`, `completion_tokens`, `cost_usd: float | None`, `estimated: bool` (true when any part's cost was unknown or Hermes marked it estimated). It covers the whole run so far (model calls + branches). Persisted with the turn answer like `records`; old turns without it load.
- UI: one quiet caption line in the finished answer's meta (next to "Sources used"): "ค่าใช้จ่าย ~$0.042 · 61,230 โทเค็น" / "Cost ~$0.042 · 61,230 tokens"; "~" only when estimated; hidden when usage is absent. Tabular numerals, `text.secondary`, theme tokens only (DESIGN.md + /impeccable craft floor: read them, or invoke the skill). th/en strings.
- Never read or print `.env` or secrets; never send the API key anywhere new. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. A branch killed by the user (stop) still reports what it spent before dying, or the run is marked estimated — the total never silently drops it.
2. Many branches in parallel (5 + 3 re-plan): totals add up exactly once each.
3. Hermes counters missing or renamed in a future pin: bridge emits zeros + `cost_status:"unknown"`, never crashes.
4. Old turns and run replays without `usage` render unchanged.

---

### Task 1: Bridge usage event → pipeline → final answer (backend)

**Files:** `infra/hermes/native_bridge.py`, `backend/src/scientist/hermes.py` (BranchUsage parse + BranchItem), `backend/src/scientist/pipeline.py` (accumulate, RunUsage on both FinalAnswer yields), `backend/src/scientist/events.py` (RunUsage, FinalAnswer.usage), `backend/src/scientist/usage.py` (expose the run accumulator's current totals if needed), store/runs persistence of `answer.usage` (follow how `records` is persisted), `infra/hermes/setup.md` (wire protocol line); tests `backend/tests/test_hermes.py`, `test_pipeline.py`, `test_store.py`/`test_runs.py` where `records` persistence is tested.

- [ ] Tests first; implement; full backend suite. Commit `feat(usage): meter Hermes branch tokens and cost; total on the final answer`.

### Task 2: Show the run cost under the answer (frontend, /impeccable)

**Files:** `frontend/src/lib/sse.ts`, the client answer clamp/merge in `frontend/src/lib/chat.ts` and `lib/run.ts` (keep `usage` exactly like `records`), `frontend/src/components/chat/AgentMessage.tsx` (meta line), `frontend/src/lib/strings.ts`; tests next to them.

- [ ] Read DESIGN.md + craft floor; tests first; `npm test`, eslint, tsc, build. Commit `feat(chat): show the run's cost and tokens under the answer`.
