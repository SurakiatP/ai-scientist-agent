# Hermes runtime: setup and spike findings

Checked 2026-10-22 against `NousResearch/hermes-agent` at
`c8301ea6c9b797184df16a9c5dd462400b264ff4` (the revision the reference repo
`SurakiatP/AI-Job-Search-Agent-Platform-dem` already proved) and
`K-Dense-AI/scientific-agent-skills` at `593377bb048752abb0152deab9fbb1083a6087df`.

Answer to the spike: **yes, Hermes can be driven this way.** The backend starts one
bridge process per search branch (`infra/hermes/native_bridge.py`) in Hermes's own
Python environment. It sends one request line on stdin and reads JSON lines back on
stdout.

## 1. Pin and install (outside the repo)

Nothing from upstream is committed. Everything lives under `~/.cache/scientist/`.

```sh
C=~/.cache/scientist/upstream
fetch() {  # fetch <dir> <url> <rev>: shallow, detached, exact revision
  mkdir -p "$1" && git -C "$1" init -q && git -C "$1" remote add origin "$2" 2>/dev/null
  git -C "$1" fetch -q --depth 1 origin "$3" && git -C "$1" checkout -q --detach FETCH_HEAD
}
fetch $C/hermes https://github.com/NousResearch/hermes-agent.git c8301ea6c9b797184df16a9c5dd462400b264ff4
fetch $C/scientific-agent-skills https://github.com/K-Dense-AI/scientific-agent-skills.git 593377bb048752abb0152deab9fbb1083a6087df

# Hermes core deps from its own uv.lock, into a separate env; the source tree stays clean
UV_PROJECT_ENVIRONMENT=~/.cache/scientist/hermes-env \
  uv sync --locked --no-dev --no-install-project --project $C/hermes

# sandbox image for the terminal tool (python 3.13 + curl, both needed by paper-lookup)
docker pull ghcr.io/astral-sh/uv:0.11.6-python3.13-trixie@sha256:b3c543b6c4f23a5f2df22866bd7857e5d304b67a564f4feab6ac22044dde719b
```

`.env`: `HERMES_SOURCE_PATH=~/.cache/scientist/upstream/hermes` and
`HERMES_REVISION=c8301ea6c9b797184df16a9c5dd462400b264ff4`. On first use
`HermesRuntime` refuses to start when either checkout's `HEAD` is not the pinned
revision or the tree is dirty. The skills revision is pinned in code
(`scientist.hermes.SKILLS_REVISION`).

## 2. Load only the enabled skills

Hermes finds skills under `$HERMES_HOME/skills/<name>/SKILL.md` (agentskills.io
format, which the k-dense skills use). Bundled Hermes skills are only copied in by
the CLI (`sync_skills`), never by `AIAgent`, so a fresh `HERMES_HOME` holds exactly
what we put there.

`HermesRuntime` builds `~/.cache/scientist/hermes-home/` on first use: it copies
each name in `ENABLED_SKILLS` (e.g. `["paper-lookup","literature-review","citation-management"]`)
from the pinned skills checkout, and writes `config.yaml` with
`tools.tool_search.enabled: "off"`. Copies, not symlinks: Hermes warns about skill
files that resolve outside `HERMES_HOME`. Tool search must be off, otherwise Hermes
hides our `report_paper` tool behind its `tool_search`/`tool_call` bridge.

Verified: `skills_list()` returned only the copied skills; `skill_view("paper-lookup")`
loaded it.

## 3. How tool calls and results surface

- The bridge registers its own tool, `report_paper(title, authors, year, doi, pmid, url)`,
  through `tools.registry.registry.register`. Hermes calls the handler during the
  loop, and the handler writes `{"event":"paper","paper":{...}}` to stdout straight away.
  The handler validates first (`clean_paper`: title, an http(s) url, typed optional
  fields, and an int pmid becomes a string). A bad call returns an error to the model,
  so the model can fix it and retry. It also emits `{"event":"rejected","paper":{doi,pmid,title,url},"reason"}`.
  The backend turns that line, and any paper line that still fails validation, into an
  `InvalidPaper` keyed like the dedupe (DOI, then PMID, then title, then url). A key that
  is later accepted does not count. The pipeline reports the keys that were never accepted.
- `AIAgent(tool_start_callback=..., tool_complete_callback=(call_id, name, args, result))`
  also exposes every tool call and its result. The bridge does not forward them: raw
  tool output is untrusted third-party text.
- The model sees only `terminal`, `skills_list`, `skill_view` and `report_paper`.
  `skill_manage` and `process_manage` are removed, and registry dispatch rejects
  every other name (the same approach as the reference bridge).
- The skills run shell and Python (curl, bundled scripts). Following the spec ("no
  Docker sandbox unless the chosen skills run code"), the terminal therefore runs
  in Docker: `TERMINAL_ENV=docker`, the image above pinned by digest, a non-persistent
  container per branch, `--cap-drop=ALL`, `no-new-privileges`, a pids limit, and
  1 CPU / 512 MB. Network stays on because the scholarly APIs need it. Hermes
  mounts `$HERMES_HOME/skills` into the container read-only at `/root/.hermes/skills`.
  Docker Desktop must share the path, and `~/.cache` (under `/Users`) is shared.
- The API key goes to the bridge on stdin, never in env or argv. It is not in the
  container's environment.
- Caps: `max_iterations=BRANCH_MAX_ROUNDS` and `max_tokens=BRANCH_TOKEN_CAP` (per
  model call, so a branch's output is bounded by rounds x cap), plus
  `run_budget_seconds` and a wall-clock timeout in the backend.

## 4. Can `Paper` records stream while a branch is still running?

Yes. The `report_paper` handler runs inside the agent loop, before the final
response. Each call reaches the backend as soon as it is made.

## Wire protocol (`native_bridge.py`)

stdin, one line: `{"term","instructions","system","model","api_key","base_url","max_iterations","max_tokens"}`.
stdout, JSON lines: `{"event":"paper","paper":{...}}` and `{"event":"rejected",...}` (zero or more), then exactly one of
`{"event":"answer","content":str}` or `{"event":"failed","code":str}`. Then the process exits.
SIGTERM stops the agent and removes the branch's container. If the process exits
without a terminal line, the backend turns that into `BranchFailed`.

The agent runs on a worker thread while the main thread waits in short joins.
Without that, SIGTERM waits until a blocking tool call returns: a `sleep 60`
terminal call delayed exit by 58 s, the backend's 15 s kill fired first, and
the container was orphaned. With it, exit takes about 1 s and the container is
removed.

## Which skills to enable

`ENABLED_SKILLS=["paper-lookup"]` is the default. Its scripts use only the standard
library, and it was run inside the sandbox. `literature-review` and
`citation-management` need the Python `requests` package, which the sandbox image
lacks. Enabling them means building an image that adds it. BGPT needs a remote
MCP server and a key. MarkItDown and LiteParse need extra packages. All of these
are left off for now.

## What was verified, and how

Verified in this spike against the real pinned Hermes (in-process, with a local
scripted OpenAI-compatible server in place of the model and no real key):
`AIAgent` constructor fields; `report_paper` exposed, called mid-loop, and the
handler output delivered before the final answer; tool start and complete
callbacks; `max_tokens` reaching the request; a real `terminal` call running in
the Docker sandbox; the skills mount being read-only; and paper-lookup's bundled
script running inside the container. The committed `native_bridge.py` was then run
through `HermesRuntime` against the same fake server: a `Paper` streamed and then the
answer, only the four allowed tools were offered, and `close()` during a running
sandbox command left no container behind.

Not verified: a live OpenRouter run (no key in this environment); the prompt-caching
behaviour of the chosen model route; and Hermes's own `fallback_model` (not wired:
Hermes expects credentials for fallback providers from its env or config, and the
backend's `llm.complete` fallback covers strategy and synthesis only).

## Running the backend

```sh
cd backend && uv run uvicorn --factory scientist.main:create_app --host 127.0.0.1 --port 8000
```

Run exactly one process (no `--workers`). At startup the app builds one `HermesRuntime`,
which rebuilds the shared `~/.cache/scientist/hermes-home`, and the cap on simultaneous
runs (`MAX_CONCURRENT_RUNS`) is per process. A second process would clobber the first's
Hermes home and double the cap. Startup and shutdown also remove any Docker container
labelled `scientist.branch=1`, which a crashed earlier run may have left behind. This
assumes no other backend shares the Docker host.

## Smoke test of `POST /v1/async/ask`

### Live run: NOT done yet (no OpenRouter key in the build environment)

With `.env` holding a real `OPENROUTER_API_KEY` and the server started as above:

```sh
curl -N -X POST localhost:8000/v1/async/ask -H 'content-type: application/json' \
  -d '{"question":"What are the latest CRISPR base editing methods and how do they compare?"}'
curl -N -X POST localhost:8000/v1/async/ask -H 'content-type: application/json' \
  -d '{"question":"การตัดต่อพันธุกรรมด้วย CRISPR base editing ล่าสุดมีวิธีใดบ้าง และต่างกันอย่างไร"}'
curl -N -X POST localhost:8000/v1/async/ask -H 'content-type: application/json' \
  -d '{"question":"Give me a recipe for pad thai"}'
```

You should see:

- The first two questions stream `data: {"type":"strategy",...}`, then one or more
  `sources` events while the branches run (`: ping` lines in between are heartbeats).
  Then come the `answer` events, one `final_answer` whose `references` each have a
  `status` (`verified`, `unverified` or `unknown`), and finally `complete`. If any
  reference is `unverified` or `unknown`, the final answer text ends with a warning or
  note naming it. The Thai question's search terms in `strategy` are English, and its
  answer is in Thai.
- The third question returns a single `{"type":"refused",...}` event and starts no
  bridge process.
- A second question sent while `MAX_CONCURRENT_RUNS` runs are busy first gets
  `{"type":"waiting","position":1}`.
- Pressing Ctrl-C on a running `curl` stops the run. Within a few seconds
  `pgrep -f native_bridge` shows nothing, and `docker ps --filter label=scientist.branch=1`
  is empty.

Record the following here: both event streams (trimmed), whether the model called
`report_paper` with real papers, and the token usage and `cached_tokens` from the
OpenRouter activity page or from the `LIVE=1 uv run pytest tests/test_llm.py -s`
output. That run is the first real evidence that Hermes works with the configured model.

### Local run against a fake model (done 2026-10-23)

This ran the real app (`create_app()`, real `HermesRuntime`, real `native_bridge.py`
on the pinned Hermes, real Crossref) with both model URLs (`hermes.OPENROUTER_URL`,
`llm.URL`) pointed at a scripted OpenAI-compatible server. `MAX_CONCURRENT_RUNS=1`
and `SSE_PING_SECONDS=2` were set. Results:

- English and Thai questions both produced `strategy`, `: ping`, `sources` x2,
  `answer` x2, `final_answer` and `complete`. The response headers were
  `cache-control: no-cache`, `x-accel-buffering: no` and
  `content-type: text/event-stream; charset=utf-8`.
- Hermes streamed its model calls (`stream: true`). Each branch called `report_paper`
  and then answered.
- The real DOI `10.1038/nature17946` came back `verified` from Crossref. The made-up
  `10.9999/made-up-doi-xyz` came back `unverified`, and the final answer ended with
  "Warning: reference(s) [2] could not be confirmed to exist ...".
- A second request sent while the first was running got `waiting` (position 1), then
  pings. It started as soon as the first run finished.
- `curl --max-time 3` cut a run mid-branch. Both bridge processes were gone within
  3 s, no labelled container remained, and the next request got a slot straight away.
- Ctrl-C on uvicorn shut it down cleanly ("Application shutdown complete").
- Hermes also sends `POST /api/show` to the base URL (a model-metadata probe). The fake
  server answered 404, and nothing broke.
