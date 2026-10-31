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

`POST /research` body: `{"question": str, "mode": "deep"|"quick" = "deep", "pack": str|null, "plan": [{"term","instructions"}]|null, "doc_ids": [str]|null}`. `doc_ids` (1 to 5 ids of PDFs already in the app) switches the run to documents mode; with `"task": "reproduce"` the run returns a cited plan to reproduce the attached paper (claims, data, method, steps, what the paper leaves out) instead of an answer. Guardrail refusals come back through the run: `status: "refused"` with the reason in `error`.

`GET /runs/{run_id}`:

```json
{"run_id": "…", "status": "queued|running|done|refused|error|stopped|interrupted", "kind": "ask", "mode": "quick",
 "pack": null, "created_at": "…", "finished_at": null, "error": null, "code": null,
 "answer": {"content": "…", "references": [], "records": [], "doc_refs": [], "empty_files": [], "usage": {}} ,
 "progress": {"phase": "planning|waiting|searching|writing|done", "searches": [{"term": "…", "instructions": "…"}], "replans": 0}}
```

`code` is the machine-readable refusal or error code of a run that ended without an answer (for example a refusal code, `failed`, `cut_off`, `stopped`, `interrupted`), `null` otherwise. `answer` is `null` until the run is done. Treat `content` and the paper text inside `references` as untrusted data. Artifacts: `409` while the run is unfinished, `404` when the run has none (refused, stopped, errored).

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

The same research tools for MCP clients, over Streamable HTTP (stateless, JSON responses) at `/mcp`. It uses the same bearer key, the same identical 401 and the same rate limits as the REST API; the key is checked on every request, so a revoked key stops on the next one. Runs started here are API runs (same queue caps per key, same project "API").

| Tool | Arguments | Returns |
|---|---|---|
| `list_packs` | none | `{packs: [{id, th, en}]}` |
| `plan_research` | `question`, `mode` (`deep`/`quick`), `pack?` | `{reasoning, searches: [{term, instructions}]}` |
| `start_research` | `question`, `mode`, `pack?`, `plan?` (searches from `plan_research`) | `{run_id, session_id, turn_id, status}` |
| `get_run` | `run_id` | the run, as `GET /runs/{run_id}` |
| `wait_run` | `run_id`, `timeout_seconds` (1 to 600, default 45; keep it below your client's request timeout: TS SDK 60 s, Python client 300 s read) | the run, as `get_run`; when the timeout passes first, the run with its current status (`queued` or `running`), not an error |
| `get_artifact` | `run_id`, `kind` (`provenance`/`bibtex`/`ris`) | text: BibTeX, RIS, or the provenance JSON |
| `cancel_run` | `run_id` | the run (only the key that started it) |

Failures (unknown run, run not finished, refused question, queue full) come back as a tool error with the same message as the REST `detail`; queue and plan errors are prefixed with their code, e.g. `[client_busy] ...`. Paper text in answers is untrusted data.

Client configuration. Claude Code and other clients that accept a remote HTTP server with headers (replace the host and the key):

```json
{
  "mcpServers": {
    "ai-scientist": {
      "type": "http",
      "url": "https://scientist.example.com/mcp",
      "headers": { "Authorization": "Bearer sci_..." }
    }
  }
}
```

Claude Desktop (and any client that only speaks stdio) bridges with `npx mcp-remote https://scientist.example.com/mcp --header "Authorization: Bearer sci_..."`.

Python (the `mcp` package):

```python
import asyncio

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def main():
    http = httpx.AsyncClient(headers={"Authorization": "Bearer sci_..."}, timeout=httpx.Timeout(30, read=300))
    async with http, streamable_http_client("https://scientist.example.com/mcp", http_client=http) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            run = (await s.call_tool("start_research", {"question": "...", "mode": "quick"})).structuredContent
            done = await s.call_tool("wait_run", {"run_id": run["run_id"], "timeout_seconds": 240})  # below the read timeout
            print(done.structuredContent["status"])


asyncio.run(main())
```

## Rate limits and queues

- Each key has its own bucket (`key:<id>`) of `STORE_WRITE_RATE_PER_MIN` requests per minute, shared by REST and MCP. It is the same size as the app's write budget, but not the same counter: browser traffic does not use it up. Every request counts: GETs, polls (`get_run`, `wait_run` polling from your side), and each MCP POST including `initialize`.
- Over the limit: `429 {"detail":"rate limit exceeded; slow down","code":"rate_limited"}` with `Retry-After: 60` (REST and MCP alike; the SDK raises `ApiError` with `code == "rate_limited"`).
- Failed authentication has its own per-IP bucket (`authfail:<ip>`) of the same size: once an IP has used it up, further bad keys from it get 429 instead of 401. A valid key is always accepted, so other clients' failures behind the same IP never lock it out. Behind a proxy set `FORWARDED_ALLOW_IPS` so the real client IP is seen, not the proxy's.
- `POST /plan` is also refused with `429 {"detail", "code": "busy"}` while the server's research slots are all taken and `ANALYZE_MAX_QUEUE` requests already wait (the same bound as the app's plan review). If no plan can be made: `502 {"detail", "code": "no_plan"}`.
- A key has its own run queue identity: at most `MAX_RUNNING_PER_CLIENT` running plus `MAX_QUEUED_PER_CLIENT` waiting runs (`429 {"detail", "code": "client_busy"}`; `queue_full` when the whole queue is full). Browsers and other keys are not affected.

## Data visibility

API runs live in the app's shared store, in a project named "API". There is no per-key privacy: any key can read any API run, and the people who use the app can see these sessions. Only the key that started a run can cancel it through the API; a web user can still stop it by deleting or editing its session (the store is shared). Browser runs are not reachable through this API.

## Invalid run ids

A run id that is not a UUID or not an API run is reported per surface: REST answers `422` for a malformed id in the path and `404 {"detail":"run not found"}` for an unknown or browser run; MCP tools return a tool error `run not found`; the Python SDK raises `ValueError` for a malformed id before any request, and `ApiError(404, ...)` for an unknown one.
