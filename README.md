# ai-scientist-agent

Ask a research question (Thai or English) and get a streamed answer with references whose existence was checked.

## Architecture

1. The browser posts the question to FastAPI (`POST /v1/async/ask`).
2. A guardrail (keyword rules, then a small model call) refuses off-topic questions; no agent starts.
3. A strategy call turns the question into a few English search terms.
4. Each term runs as a parallel Hermes branch in a Docker sandbox, using the `paper-lookup` skill.
5. Branch papers and summaries stream back as they finish.
6. A synthesis call writes the final cited answer from the branch results.
7. A citation check confirms each reference exists (Crossref, PubMed, arXiv); unconfirmed ones are flagged.
8. Everything travels back as server-sent events; history and saved answers live only in the browser.

- `backend/`: FastAPI, one streaming endpoint.
- `frontend/`: Next.js 16 + MUI. Pages `/`, `/ask`, `/saved`.
- `infra/hermes/`: bridge that runs Hermes in its own Python env. Pinned install and findings: `infra/hermes/setup.md`.

## Setup

Needs `uv`, Node >= 20 with npm, and a running Docker.

1. Pin and install Hermes, the skills checkout and the sandbox image under `~/.cache/scientist/`:
   follow section 1 of `infra/hermes/setup.md`.
2. `cp .env.example .env` and set `OPENROUTER_API_KEY`. `.env` is read by pydantic-settings as plain
   `KEY=VALUE` lines; list values must be JSON (`ENABLED_SKILLS=["paper-lookup"]`). Settings are in
   `backend/src/scientist/config.py`; `.env.example` shows the starting values. A real environment variable
   overrides `.env`.
3. `cd backend && uv sync` and `cd frontend && npm install`.

## Settings

| Variable | Default in code | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | none, required (non-empty) | OpenRouter key |
| `MODEL` | none, required | main model (`.env.example`: `openai/gpt-6-luna`) |
| `FALLBACK_MODEL` | none, required | model used for the scope check and as fallback (`.env.example`: `openai/gpt-6-luna`) |
| `MAX_BRANCHES` | 5 | search branches per question |
| `MAX_CONCURRENT_RUNS` | 4 | simultaneous questions; extra ones queue (per process) |
| `BRANCH_TOKEN_CAP` | 4000 | `max_tokens` per model call in a branch |
| `BRANCH_MAX_ROUNDS` | 8 | max agent iterations per branch |
| `MAX_QUESTION_CHARS` | 2000 | longer questions get 422 |
| `HERMES_SOURCE_PATH` | none, required | pinned Hermes checkout (`.env.example`: `~/.cache/scientist/upstream/hermes`) |
| `HERMES_REVISION` | none, required | commit the checkout must be at |
| `ENABLED_SKILLS` | `[]` | JSON list of skills copied into Hermes (`.env.example`: `["paper-lookup"]`) |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | JSON list of allowed browser origins |
| `SSE_PING_SECONDS` | 15 | heartbeat interval while a run waits |

## Run

```sh
scripts/dev.sh
```

Checks prerequisites (uv, node >= 20, npm, docker answering within 10 s, `.env`, non-empty `OPENROUTER_API_KEY`
from `.env` or the environment, free ports 8000 and 3000; it never kills an existing listener), starts the backend on :8000 and the frontend on :3000, waits for `/v1/health`, and stops both on Ctrl+C. `WAIT_SECONDS` (default 60) bounds each startup wait.
Open http://localhost:3000. Set `NEXT_PUBLIC_API_BASE` (see `frontend/.env.example`) for another backend URL.

Backend alone (run from the repo root so `.env` is found):

```sh
uv run --project backend uvicorn --factory scientist.main:create_app --host 127.0.0.1 --port 8000
```

## Tests

```sh
cd backend && uv run pytest -q
cd frontend && npm test && npm run lint && npm run build
```

## API

| Route | |
|---|---|
| `GET /v1/health` | `{"status":"ok"}` |
| `POST /v1/async/ask` | body `{"question": "..."}`; replies with a server-sent event stream (`data: <json>` lines, `: ping` heartbeats). Empty or over-long question: 422. |

Events (`backend/src/scientist/events.py`), in typical order:

| `type` | fields |
|---|---|
| `refused` | `reason` (off-topic; no agent is started) |
| `waiting` | `position` (queued behind `MAX_CONCURRENT_RUNS`) |
| `strategy` | `reasoning`, `searches[{term, instructions}]` |
| `sources` | `term`, `papers[{title, authors, year, doi, pmid, url}]` (one per branch, as it finishes) |
| `answer` | `term`, `content` (per-branch summary) |
| `final_answer` | `content`, `references[{id, paper, status}]`; `status` is `verified`, `unverified` or `unknown` |
| `complete` | none |
| `error` | `message` |

## Privacy

The question goes from the backend to OpenRouter (and paper lookups go to scholarly APIs). History and saved
answers stay in the browser (localStorage). The app binds to localhost and has no login.

## Known limits

- Run exactly one backend process (no `--workers`): it owns the shared Hermes home and the run cap.
- Docker is required: each branch's terminal runs in a sandbox container.
- Citation check is existence only (Crossref, PubMed, arXiv). It does not check that a paper supports the claim.
- Only `paper-lookup` is enabled by default: it needs just the standard library, which the sandbox image has.
  The other skills need extra packages or keys.
- No per-IP rate limit; the app is meant for localhost only.
- `unknown` on a reference means the lookup service did not answer (Crossref or doi.org rate limit, 5xx or
  timeout), not that the paper is fake. A made-up DOI is `unverified` when the service answers and `unknown`
  when it does not, so `unknown` will appear occasionally.
- Not verified: a live OpenRouter run with `openai/gpt-6-luna`, and its prompt-cache behaviour.
  Everything was run against a local scripted fake model.

## Verification status

Run here: `scripts/dev.sh` start, health checks and stop (no stray listeners, processes or labelled containers);
the empty-key and port-in-use refusals; `uv run pytest` (176 passed, 2 skipped); `npm test`, `npm run lint`,
`npm run build`; an end-to-end run in Chrome (English, Thai, off-topic questions, save and reload) against a
local fake model with the real backend, pinned Hermes and Docker.

Not run: a live OpenRouter run, prompt-cache behaviour, an arXiv-only reference in the browser, the
frontend startup-timeout path of `dev.sh`.

## Live smoke

With a real key in `.env` and the backend running, the curl commands in `infra/hermes/setup.md`
("Smoke test of `POST /v1/async/ask`") exercise English, Thai and off-topic questions. Not run yet.

## Status

Frontend colors are a placeholder palette in `frontend/src/theme.ts`, to be replaced with the Figma palette.
