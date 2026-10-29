# Multi-Process Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The backend runs as several processes (uvicorn `--workers N` or several containers) against one Postgres with the same behaviour as one process: fair queue and global caps, live run events and store sync reach every browser whichever process it is connected to, cancel works from any process, and a run whose process died is resumed by another (roadmap plan 10).

**Architecture:** Postgres is the coordinator; no new service. (1) **Queue:** `runs` rows are the queue. Submit inserts a `queued` row (the request body is already stored in `runs.request`) and `NOTIFY runs`. Every process runs a scheduler loop that wakes on `NOTIFY runs` or every 2 s, takes `pg_advisory_xact_lock(<pool key>)`, counts `running` rows per pool and per client, picks the next ticket in the same fair order as today (least recently served client, then oldest; per-client running cap), and claims it with `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)` setting `status=running, worker=<process id>, lease_until=now()+30s`. The claiming process executes the run exactly as today. (2) **Leases:** each process renews `lease_until` for its runs every 10 s; a sweep (any process, every 10 s) re-queues `running` rows whose lease expired (`attempt < 2` → `queued`, `attempt+1`, event `{"type":"restarted"}`; otherwise `interrupted` like today). (3) **Events:** `_emit` keeps writing `run_events`, then `NOTIFY run_events, '<run id>:<seq>'`; `events()` replays from the table and follows by waiting on that notification (any process), falling back to a 2 s poll. (4) **Cancel:** sets `runs.cancel_requested = true` + `NOTIFY run_cancel, '<run id>'`; the owning process cancels its task. (5) **Store change feed:** `Store._changed` publishes through `NOTIFY store_changes` (payload = the change JSON, or a row reference when over 7,000 bytes, fetched by listeners); every process's listener fans out to its own SSE subscribers. One dedicated LISTEN connection per process (a plain `psycopg.AsyncConnection` in autocommit mode, `conn.notifies()`; the app's driver is psycopg 3), reconnecting with backoff.

**Tech Stack:** FastAPI, SQLAlchemy async + psycopg 3 (already used), Alembic, pytest with the throwaway Postgres fixture.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 10). Rulings: an advisory lock per pool serialises the scheduler so the global caps hold exactly, and `FOR UPDATE SKIP LOCKED` claims the row (the spec names SKIP LOCKED; the lock is what makes the cap count race-free); "resumed" means restarted from the beginning once (a run's half-done Hermes branches cannot be continued) — cost: a resumed run pays its model calls again, bounded by `attempt < 2`; the per-IP/per-key rate limits and the sync `RunGate` for non-run paths (`/v1/async/ask` plan_only) stay per process — documented as "limits are per process; with N workers the effective budget is N×".

## Global Constraints

- Migration `0009_multi_process`: `runs` gains `worker text`, `lease_until timestamptz`, `attempt int not null default 1`, `cancel_requested bool not null default false`, `pool text` (backfilled: `analysis` for kind analyze or mode docs, else `research`), `served_at timestamptz` (when it was claimed; drives "least recently served"); index on `(status, pool)`. Downgrade drops them.
- Process id: `f"{hostname}:{pid}:{uuid4().hex[:6]}"`, fixed at startup.
- Settings (documented in `.env.example`, `infra/deploy/app.env.example`, README): `run_lease_seconds: int = 30`, `run_max_attempts: int = 2`, `scheduler_poll_seconds: float = 2.0`. Existing `max_concurrent_runs`, `sandbox_max_concurrent`, `max_running_per_client`, `max_queued_per_client`, `run_queue_max` keep their meaning, now global across processes.
- Admission (`admit`) counts in Postgres (one query) inside the submit transaction; same codes `client_busy` / `queue_full`, same messages.
- Position/ETA: computed from the queued rows in fair order (same `_order` algorithm, now over rows); ETA average from the last 20 finished runs per pool in the DB (`finished_at - started_at`, done/error only, ≥ 5 s), default 180/60 s as today.
- Startup no longer marks every queued/running run interrupted; only runs whose lease has expired are handled by the sweep. A single-process restart therefore resumes its own interrupted runs (attempt 2).
- `restarted` event: frontend `lib/run.ts` progress reducer and Python `runs.reduce_progress` reset progress to the empty state (keep `_docs`); the progress card shows one quiet line "เริ่มใหม่หลังระบบขัดข้อง / Restarted after an interruption" (/impeccable: read DESIGN.md and the craft floor; th/en strings).
- NOTIFY payloads never carry secrets or request bodies (ids, seq, and store change JSON only — the store change JSON is what SSE clients receive anyway).
- Single-process behaviour, all existing tests and the browser/REST/MCP API shapes stay identical. `infra/compose.yaml` backend command gets `--workers ${BACKEND_WORKERS:-2}`; `docs/deploy.md` documents it and removes the "one worker" note; remove the `ponytail: one process only` comment in store.py.
- Never read or print `.env` or secrets. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. Two processes, `max_concurrent_runs=1`, three submits at once: exactly one runs at a time globally; order follows the fair rule.
2. Kill the process that owns a running run (no shutdown): within lease + sweep time another process restarts it once; a second death marks it interrupted; viewers on the other process see `restarted` then the new events.
3. A browser on process A follows a run executing on process B: every event arrives in order, none duplicated, resume with Last-Event-ID works.
4. Cancel sent to process A for a run on process B: the run stops and its final write lands; the cancel response reflects it (wait up to 10 s for the row to leave running, then answer with the current row).
5. LISTEN connection drops (Postgres restart): listeners reconnect; events and store changes missed during the gap are recovered (events by replay from the table; store changes by sending each SSE client a `resync` hint that makes the frontend do its normal full sync).

---

### Task 1: Schema, settings, Postgres notification bus
**Files:** `backend/migrations/versions/0009_multi_process.py`, `backend/src/scientist/models.py`, `backend/src/scientist/config.py`, create `backend/src/scientist/pgbus.py` (`PgBus` — `store.Bus` already exists and stays the per-process fan-out: one LISTEN connection, `subscribe(channel) -> async iterator`, `notify(channel, payload)` helper used inside or outside a transaction, reconnect with backoff, a `gap` signal on reconnect), `backend/src/scientist/main.py` (start/stop the bus in the lifespan), env examples/README; tests `backend/tests/test_pgbus.py` (two PgBus instances on one DB: notify reaches both; reconnect after `pg_terminate_backend` yields a gap signal then resumes).
- [ ] Tests first. Commit `feat(backend): Postgres notification bus and run lease columns`.

### Task 2: Store change feed across processes
**Files:** `backend/src/scientist/store.py` (`_changed` → bus; listener fan-out to the existing per-process SSE subscribers; oversize payload by reference; `resync` on gap), `backend/src/scientist/routes_store.py` (SSE emits `resync`), `frontend/src/lib/sync.ts` (+ test: `resync` triggers the existing full sync); tests `backend/tests/test_store.py` (two Store instances = two processes: a write on one reaches the other's subscriber; oversize; gap → resync).
- [ ] Tests first. Commit `feat(store): change feed over LISTEN/NOTIFY so every process sees every write`.

### Task 3: Postgres run queue, leases, cross-process events and cancel, resume
**Files:** `backend/src/scientist/runqueue.py` (DB-backed admission, fair claim under advisory lock + SKIP LOCKED, position/ETA from rows, scheduler loop), `backend/src/scientist/runs.py` (submit inserts queued + notify; scheduler claims and executes; lease renewal; sweep with attempt/restarted; `_emit` notify; `events()` follows via bus with poll fallback; cancel_requested + notify; startup/shutdown changes), `routes_runs.py`/`routes_api.py`/`mcp_server.py` only if call signatures change; tests `backend/tests/test_runs.py`, `test_runqueue.py`, new `backend/tests/test_multi_process.py` (two RunService instances on one DB with fake pipelines = two processes: Review Focus 1–4).
- [ ] Tests first. Commit `feat(runs): Postgres run queue with leases; events, cancel and resume across processes`.

### Task 4: Restarted runs in the UI, deploy with workers
**Files:** `frontend/src/lib/run.ts` (+ test), `frontend/src/components/research/ProgressCard.tsx` (line), `frontend/src/lib/strings.ts`, `backend/src/scientist/runs.py` (`reduce_progress` restarted) + test, `infra/compose.yaml` (`--workers`), `backend/Dockerfile` if the CMD carries it, `docs/deploy.md`, store.py comment removal.
- [ ] Read DESIGN.md + craft floor; tests first; `npm test`, eslint, tsc, build; backend suite. Commit `feat(runs): show restarted runs; deploy two backend workers`.

### Task 5: Live check (controller)
- [ ] Worktree stack with the backend on :8100 as `--workers 2` (migrated to head). Three concurrent quick questions from two browser tabs + one API key with `MAX_CONCURRENT_RUNS=1`: one at a time, events live in both tabs. Kill one worker process (SIGKILL) during a run: it restarts once on the other worker, the card shows the restarted line, the answer arrives. Cancel from a tab connected to the other worker. Store edits (rename a session) show in the other tab.
