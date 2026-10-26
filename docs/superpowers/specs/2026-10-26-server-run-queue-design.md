# Server-side run queue for many users on many machines (no login)

Status: approved in chat 2026-10-26.

## Why
The app is moving from one person to many people on many machines, all using one server. There is no login, and that stays. Today:
- One global FIFO `RunGate` (4 research runs, 3 analyses). One machine can fill every slot.
- A run lives only as long as its HTTP stream. Closing a tab, locking a phone or losing Wi-Fi cancels the run, and the money spent so far is wasted.
- Only the browser writes the result into the shared store, so other machines see nothing until it is written.
- Two sync bugs delete shared data, and will happen much sooner with many users:
  - **D1:** the 51st turn wipes the session's history on the server.
  - **D2:** the 201st session deletes the office's oldest session.

## Goals
1. **Fair queue per machine.** Each browser has a random client id. The id is used only for fairness, never as identity or permission.
2. **Runs belong to the server.**
   - A submit returns at once.
   - The run continues after the tab closes.
   - Any tab or machine can re-attach and see live progress.
   - The server writes the turn into the shared store as the run progresses.
3. **Visible queue.** The user sees their queue position and an estimated wait, and can cancel. The sidebar shows how busy the server is.
4. **Restart honesty.** After a server restart, unfinished runs are marked interrupted, and the user can retry.
5. **Fix D1 and D2.**

## Non-goals
- Login or accounts.
- More than one backend process or server. Single uvicorn worker stays; already documented.
- Resuming a run automatically after a restart.
- LINE or push notifications.
- Making Hermes run inside compose (separate task).

## Anti-goals
These would count as failure even if the code works:
- **Losing a finished answer** because the browser was closed.
- **Starvation:** a client with one job waits behind another client's many jobs.
- **Using the client id as a permission for anything except cancel.** The client id may only stop runs that client submitted.
- **Breaking browser-only mode (no database).** It must keep working exactly as today.

## Design

### Client id
- The browser keeps a random UUID v4 in localStorage under `scientist-client-v1`.
- It is sent as the `X-Client-Id` header on run requests.
- The server validates the UUID format. A missing or invalid id on `/v1/runs` gets 400.
- Clearing storage gives a new id. Fairness still holds through the global caps.

### Data (migration `0004_runs`)
- **`runs` table:**
  - `id` uuid PK, `client_id` text not null, `session_id` uuid, `turn_id` uuid
  - `kind` text (`ask` | `analyze`), `mode` text, `request` jsonb
  - `status` text (`queued` | `running` | `done` | `refused` | `error` | `stopped` | `interrupted`)
  - `created_at`, `started_at`, `finished_at`, `error` text
  - Index on `(status)`. Index on `(client_id, status)`.
- **`run_events` table:** `run_id` uuid FK `runs` on delete cascade, `seq` int, `at` timestamptz, `event` jsonb. PK `(run_id, seq)`.
- **`turns.run_id`:** a new nullable uuid column. `TurnIn` gains `run_id`. The snapshot returns it.
- **Retention:** the existing hourly purge deletes runs (with their events) finished more than `RUN_RETENTION_DAYS` (default 7) ago.

### Fair queue (`scientist/runqueue.py`)
- **Pools.** Two pools: `research` (limit `MAX_CONCURRENT_RUNS`, default 4) for deep, quick and chat; `analysis` (limit `SANDBOX_MAX_CONCURRENT`, default 3).
- **Interface.**
  - `RunQueue.ticket(run_id, client_id, pool)` returns an object with the same `acquire()` / `release()` interface as `RunGate`. `pipeline.ask` and the analyze path take a ticket as their `gate` unchanged, so refusals still never queue.
  - `acquire()` yields the 1-based position whenever it changes. That position already reaches the client as the `waiting` event.
- **Who goes next.** When a slot frees, the queue picks the queued ticket with the earliest enqueue time whose client has fewer than `MAX_RUNNING_PER_CLIENT` (default 1) running tickets in any pool.
- **Position** is a ticket's place in that fair order within its pool.
- **ETA.**
  - `Waiting` gains an optional `eta_seconds`.
  - `eta_seconds = ceil(position / pool limit) × avg duration`.
  - The average is the mean of the last 20 finished runs of the same pool, measured in process. With no history it falls back to 180 s for research and 60 s for analysis.
- **Caps, checked at submit time (HTTP 429 with JSON `{"detail": "...", "code": ...}`):**
  - `code: "client_busy"` when the client already has `MAX_QUEUED_PER_CLIENT` (default 2) runs queued plus `MAX_RUNNING_PER_CLIENT` running.
  - `code: "queue_full"` when `RUN_QUEUE_MAX` (default 20) runs are already queued across all clients.
- **Status.** `RunQueue.status()` returns `{research: {running, limit, queued}, analysis: {...}}`.

### Run service and routes (`scientist/runs.py`, `scientist/routes_runs.py`)
All routes below require the database. Without a database they return 503 `runs need the shared store`.

- **`POST /v1/runs`** returns 202 `{run, turn}`.
  - Body: `{session_id, turn_id, kind: "ask" | "analyze", question, mode?, history?, memory?, plan?, file_id?, file_name?}`. Fields are validated by the existing `AskRequest` / `AnalyzeRequest` rules; reuse them. `plan_only` is not allowed here, because plan review keeps using the old direct route, which is short.
  - **Turn creation.** In one transaction under the session row lock:
    - If the turn does not exist, the server creates it at `idx = max(idx)+1` with `status running`, empty progress, `run_id`, question, mode (`analysis` for analyze) and, for analyze, `analysis: {fileId, fileName, steps: []}`.
    - If the turn exists with status `awaiting_plan` (an approved plan), the server sets it to `running` with the plan and `run_id`.
    - In any other existing state the request gets 409.
  - **Start.** Then it inserts the `runs` row, starts the run task, and broadcasts the store change.
- **Run task.**
  - Wraps the existing generators: `ask(...)` with a ticket, or the analyze `_slot(...)` path with a ticket.
  - Keeps the existing `usage.track`, now also passing `session_id` and `turn_id`.
  - Appends every event to `run_events` with an incrementing `seq` and publishes it to in-memory subscribers.
  - Folds events into the turn using a Python port of `frontend/src/lib/progress.ts` `reduce`, plus the analysis reducer from `run.ts` (`reduceAnalysis`). The turn JSON stays exactly what the frontend writes today.
  - Writes the turn at most once per second while running, and always on the terminal event: `done` with answer, `refused` with reason and `_code` in progress, `error` with the message, `stopped` on cancel.
  - Sets `runs.status`, `started_at` (on getting the slot) and `finished_at`.
  - Server turn writes go through a store method that skips the client version check and bumps the version, so the broadcast reaches every machine.
- **`GET /v1/runs/{id}/events`** is an SSE stream.
  - It replays persisted events with `seq > after`, where `after` comes from `?after=` or the `Last-Event-ID` header. Each SSE message carries `id: <seq>`.
  - It then follows live events until the run ends, then closes.
  - While queued, it sends the current `waiting` (position, eta) first.
  - Pings work as today.
  - **Disconnecting never cancels the run.**
- **`POST /v1/runs/{id}/cancel`** works only when `X-Client-Id` equals the submitter; otherwise 403. It cancels the task, the turn becomes `stopped`, and the call is idempotent.
- **`GET /v1/runs/status`** returns the pool status above.
- **Startup.** Every run left `queued` or `running` becomes `interrupted`, and its turn's status becomes `interrupted` with the existing interrupted copy.
- **Shutdown.** Cancel the run tasks and mark them `interrupted`. The finally blocks already kill bridges.
- **Old routes.** When the database is configured, the old direct `POST /v1/async/ask` (except `plan_only: true`) and `POST /v1/async/analyze` return 409 `{"code": "use_runs"}`. Without a database they work exactly as today, so browser-only mode is unchanged and the existing tests keep passing.

### Frontend
- **Mode.** The runs API is used only in shared mode (sync not `disabled`). Browser-only mode keeps today's direct streams.
- **`lib/runs.ts`.** Client id helper, `submitRun`, `attachRun(runId, after)` (an async generator over SSE with resume from the last seq; reuse the SSE parser in `sse.ts`), `cancelRun`, `queueStatus`.
- **`run.ts`.**
  - In shared mode, `startRun` (non-review), `approvePlan` and `startAnalysis` submit a run, then attach.
  - Stop calls `cancelRun`.
  - Closing or reloading the tab does not cancel.
  - The per-tab single-run lock stays.
  - On load (`sync` ready), and when a session with a `running` turn that has a `runId` is opened, the app attaches to its stream. That works in any tab on any machine and renders live progress.
  - Stop shows only in the tab whose client id submitted the run; other viewers see progress without Stop.
  - The old "running turn without a live run is interrupted" logic applies only to turns without a `runId`.
- **`Turn.runId`.** A new optional field, validated as a UUID in `isTurn`, mapped from `run_id`.
- **`sync.ts`.**
  - Never enqueues turn **puts** for turns that have a `runId`, because the server owns them.
  - Truncate and delete still work.
  - Remote copies of server-owned turns always replace local ones, except while this tab is attached and holds newer events.
- **D1 and D2 fixes.**
  - In shared mode, local caps (`MAX_TURNS` slice in `addTurn`, `capSessions` in new sessions) must never be mirrored as deletes. Pick one:
    - skip the caps in shared mode, since the server pages; or
    - have `mirror()` ignore evictions that the caps caused (a drop of the oldest turns or sessions, with no edit).
  - Regression tests for both.
- **UI.** Follow /impeccable, /hallmark and /motion2code principles.
  - The progress card waiting row shows `คิวที่ {n} · รอประมาณ {m} นาที` / `Queue {n} · about {m} min`, with an existing Stop or Cancel.
  - The 429 errors map to Thai and English copy:
    - `client_busy`: "คุณมีงานรออยู่ครบแล้ว รอให้งานเดิมเสร็จก่อน"
    - `queue_full`: "คิวเต็ม ลองใหม่อีกครู่"
  - The sidebar footer shows a compact server-load line from `GET /v1/runs/status`, polled every 15 s while the page is visible: `กำลังทำ {running}/{limit} · รอ {queued}` / `Running {running}/{limit} · {queued} waiting`.
  - Strings go in both `th` and `en`.

### Config (`.env.example`, `config.py`)
`MAX_RUNNING_PER_CLIENT=1`, `MAX_QUEUED_PER_CLIENT=2`, `RUN_QUEUE_MAX=20`, `RUN_RETENTION_DAYS=7`. Existing: `MAX_CONCURRENT_RUNS`, `SANDBOX_MAX_CONCURRENT`.

## Tests that must exist
- **Fairness.**
  - Client A submits 3, then client B submits 1 → B starts before A's 2nd and 3rd.
  - Per-client running limit.
  - Positions and ETA.
  - `client_busy` and `queue_full`.
- **Run lifecycle.**
  - A disconnected SSE does not cancel.
  - Re-attach with `after` replays only the newer events.
  - The server writes the turn with progress identical to what the frontend reducer would produce (fixture events).
  - Cancel by another client gives 403; cancel by the owner sets the turn to `stopped`.
  - Restart marks runs and turns interrupted.
  - Old routes return 409 with a database and work without one.
- **Frontend.**
  - Client id persists.
  - Shared mode uses the runs API; browser-only mode uses the old streams.
  - Re-attach on load.
  - Sync skips puts for server-owned turns.
  - D1 and D2 regressions.
  - Queue copy for 429 codes.
- **Live check.** Run two client ids against the dev server with `MAX_CONCURRENT_RUNS=1` in chat mode (cheap): the second waits with position 1, closing the first client's stream does not stop its run, and the turn appears on another tab.

## Rulings made by the controller (cheap to change)
- Per-client limits are 1 running and 2 queued.
- The global queue holds 20.
- The ETA comes from an in-process average, so it resets on restart.
- Pools are separate, but the per-client running limit counts across both pools.
- Plan-only stays on the direct route.
- No new turn status (`queued` is shown from the `waiting` event).
