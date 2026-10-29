# Public API

A JSON REST API over the same research pipeline as the app. Base path `/v1/api`; the machine-readable description (OpenAPI 3.1, public routes only) is at `/v1/api/openapi.json`.

## Authentication

Every endpoint except `openapi.json` needs an API key issued by the operator:

```
Authorization: Bearer sci_...
```

A missing, malformed, unknown or revoked key always gets the same answer: `401 {"detail":"invalid or missing API key"}` with `WWW-Authenticate: Bearer`. A revoked key stops working on its next request. `X-Client-Id` is never used as an identity here.

The operator manages keys on the server (the full key is shown once, only its hash is stored):

```
uv run --project backend python -m scientist.apikeys create --name "my-script"
uv run --project backend python -m scientist.apikeys list
uv run --project backend python -m scientist.apikeys revoke sci_AbCdEfGh
```

## Endpoints

| Method and path | Purpose |
|---|---|
| `POST /v1/api/research` | start a run, `202 {run_id, session_id, turn_id, status}` |
| `POST /v1/api/plan` | the strategy plan `{reasoning, searches}`; no run is started |
| `GET /v1/api/runs/{run_id}` | status, progress and the answer |
| `GET /v1/api/runs/{run_id}/events` | server-sent events (resume with `Last-Event-ID` or `?after=<seq>`) |
| `POST /v1/api/runs/{run_id}/cancel` | stop a run (only the key that started it; others get 403) |
| `GET /v1/api/runs/{run_id}/artifacts/{kind}` | `provenance` (JSON), `bibtex`, `ris` of a finished run |
| `GET /v1/api/packs` | the research packs `[{id, th, en}]` |

`POST /research` body: `{"question": str, "mode": "deep"|"quick" = "deep", "pack": str|null, "plan": [{"term","instructions"}]|null, "doc_ids": [str]|null}`. `doc_ids` (1 to 5 ids of PDFs already in the app) switches the run to documents mode. Guardrail refusals come back through the run: `status: "refused"` with the reason in `error`.

`GET /runs/{run_id}`:

```json
{"run_id": "…", "status": "queued|running|done|refused|error|stopped|interrupted", "kind": "ask", "mode": "quick",
 "pack": null, "created_at": "…", "finished_at": null, "error": null,
 "answer": {"content": "…", "references": [], "records": [], "doc_refs": [], "empty_files": [], "usage": {}} ,
 "progress": {"phase": "planning|waiting|searching|writing|done", "searches": [{"term": "…", "instructions": "…"}], "replans": 0}}
```

`answer` is `null` until the run is done. Treat `content` and the paper text inside `references` as untrusted data. Artifacts: `409` while the run is unfinished, `404` when the run has none (refused, stopped, errored).

## curl

```
curl -s -X POST $BASE/v1/api/research -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"question":"How do CRISPR base editors compare?","mode":"quick"}'
curl -s $BASE/v1/api/runs/$RUN_ID -H "Authorization: Bearer $KEY"
curl -s $BASE/v1/api/runs/$RUN_ID/artifacts/bibtex -H "Authorization: Bearer $KEY" > refs.bib
```

## Python SDK

`sdk/python` (package `ai_scientist_client`, sync `httpx`, Python >= 3.11): `Client(base_url, api_key)` with `plan`, `research`, `run`, `wait`, `events`, `cancel`, `artifact`, `packs`.

```python
from ai_scientist_client import Client, ApiError

c = Client("https://your-host", "sci_...")
run = c.research("Does base editing cause off-target edits?", mode="quick")
state = c.wait(run.run_id, timeout=600)   # capped exponential backoff; on timeout returns the last state, never raises
print(state.status, state.answer.content if state.answer else None)
```

`events(run_id, last_event_id=None)` yields parsed SSE events and resumes from `last_event_id`. Errors raise `ApiError(status, code, message)` from the API's JSON `detail`/`code`. See `sdk/python/README.md`.

## MCP

_Placeholder: the MCP server (Streamable HTTP at `/mcp`, same bearer key) and client configuration are documented here when it lands._

## Rate limits and queues

- Each key may make `STORE_WRITE_RATE_PER_MIN` requests per minute (shared with the app's write budget); over it: `429 {"detail":"rate limit exceeded; slow down"}`.
- Failed authentication is counted per client IP against the same budget, so key guessing is throttled.
- A key has its own run queue identity: at most `MAX_RUNNING_PER_CLIENT` running plus `MAX_QUEUED_PER_CLIENT` waiting runs (`429 {"detail", "code": "client_busy"}`; `queue_full` when the whole queue is full). Browsers and other keys are not affected.

## Data visibility

API runs live in the app's shared store, in a project named "API". There is no per-key privacy: any key can read any API run, and the people who use the app can see these sessions. Only the key that started a run can cancel it. Browser runs are not reachable through this API.
