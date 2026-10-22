# ai-scientist-agent

Ask a research question (Thai or English). The backend plans a few searches, runs each in a sandboxed
Hermes agent that looks up papers with the `paper-lookup` skill, checks that every cited paper exists, and
streams a cited answer.

- `backend/`: FastAPI, one streaming endpoint.
- `frontend/`: Next.js 16 + MUI. Pages `/`, `/ask`, `/saved`.
- `infra/hermes/`: bridge that runs Hermes in its own Python env. Pinned install and findings: `infra/hermes/setup.md`.

## Setup

Needs `uv`, Node >= 20 with npm, and a running Docker.

1. Pin and install Hermes, the skills checkout and the sandbox image under `~/.cache/scientist/`:
   follow section 1 of `infra/hermes/setup.md`.
2. `cp .env.example .env` and set `OPENROUTER_API_KEY`. `.env` is read by pydantic-settings as plain
   `KEY=VALUE` lines; list values are JSON (`ENABLED_SKILLS=["paper-lookup"]`). Other defaults work as is.
3. `cd backend && uv sync` and `cd frontend && npm install`.

## Run

```sh
scripts/dev.sh
```

Checks prerequisites (uv, node >= 20, npm, docker running, `.env`, non-empty `OPENROUTER_API_KEY`, free ports),
starts the backend on :8000 and the frontend on :3000, waits for `/v1/health`, and stops both on Ctrl+C.
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
- Not verified: a live OpenRouter run with `openai/gpt-6-luna`, and its prompt-cache behaviour.
  Everything was run against a local scripted fake model.

## Live smoke

With a real key in `.env` and the backend running, the curl commands in `infra/hermes/setup.md`
("Smoke test of `POST /v1/async/ask`") exercise English, Thai and off-topic questions. Not run yet.

## Status

Frontend colors are a placeholder palette in `frontend/src/theme.ts`, to be replaced with the Figma palette.
