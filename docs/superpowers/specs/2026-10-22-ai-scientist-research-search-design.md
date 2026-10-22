# AI Scientist: Research Search (design)

Date: 2026-10-22. Status: draft, awaiting approval.
Marked **[my call]** = decided by the assistant, not stated by the user. Marked **[unverified]** = not checked yet.

## Intent

Researchers at NECTEC (Thailand's national electronics and computer technology center; mostly AI/language, image/medical imaging, devices/sensors, IoT, microelectronics) need to answer questions like "what are the latest methods for X and how do they compare?" with a cited summary they can trust. Today this is manual literature review.

The product is a web app where a researcher asks a question in Thai or English and watches an agent plan searches, query scholarly sources, and write a comparative answer in which every claim carries a verifiable DOI/PMID.

This is the first slice of the TOR "AI Scientist platform" (`/Users/parksurakiat/Downloads/ขอบเขตของงาน (TOR) โครงการพัฒนาแพลตฟอร์ม AI Scientist.docx`). The slice is research search and literature review only.

## Goals

1. Ask a question, get a comparative cited answer, streamed live.
2. Show the agent's work live: the search plan (up to 5 queries) and the sources/papers found per query.
3. Every cited claim has a DOI or PMID that was checked to exist before display.
4. Only scientific-research questions are answered (guardrail).
5. 10-50 researchers can use it concurrently.
6. No login. Each person's history and saved results live in their own browser.
7. Modern, polished landing page, then the app UI. Look and color differ from open-notebook; feature set is the same in spirit (ask, search, save).

## Non-goals (this slice)

Deferred to later slices of the TOR: research planning, running Python/analysis code, PDF/DOCX report generation, the six specialist domain workflows, REST/MCP API for external callers, uploading own documents, podcasts, chat over uploaded sources, accounts/roles.

## Anti-goals (failure even if it "works")

- An answer containing a citation that does not exist or does not support the claim.
- Answering non-research questions (homework, coding help, general chat) on the project's token budget.
- One user's heavy query degrading everyone else.

## Constraints

- Fork of `lfnovo/open-notebook` (MIT): keep frontend and backend, replace the data and agent layers.
- Agent runtime: Hermes Agent (NousResearch/hermes-agent) **[unverified: assumed this is the Hermes meant]**, using skills from `k-dense-ai/scientific-agent-skills` (177 skills; this slice enables ~6-8).
- LLM: gpt6-luna through OpenRouter, configured only through `.env` (model id, API key). Prompt caching enabled.
- UI base: React with MUI as the component base, selective Uiverse snippets, Ionic as reference only. Motion and animation built later with the motion2code skill. Landing page built with the impeccable skill.
- Color theme: "customer support chat dashboard" Figma file the user linked **[unverified: the file could not be opened; user to supply screenshot or hex colors]**.

## Decisions

### Stack (kept from open-notebook, verified from its package files)
Frontend: Next.js 16, React 19, Tailwind 4, Zustand, TanStack Query, i18next. Backend: FastAPI, LangGraph.

### Removed
- Login: `api/auth.py`, `api/routers/auth.py`, `frontend/src/app/(auth)`, `components/auth`, `lib/auth-token.ts`, `lib/hooks/use-auth.ts`, `lib/stores/auth-store.ts`.
- SurrealDB and everything that depends on it (server-side notebooks, source ingestion, vector search over uploads, podcasts, embeddings). **[my call]** Nothing in this slice needs a database because search is over external scholarly APIs and state is in the browser. Builder must confirm no kept module still imports it.

### Kept and adapted: the "Ask" pipeline
Pattern from `open_notebook/graphs/ask.py`, streamed over SSE (`api/routers/search.py`):

1. Guardrail check on the question.
2. Strategy: model writes up to 5 search terms, each with instructions on what to extract. Emit `strategy` event.
3. Fan-out: one branch per term, run in parallel. In open-notebook each branch does a vector search; here each branch is a Hermes agent call that uses the research skills. Emit `sources` events as papers are found, then an `answer` event per branch.
4. Synthesis: one model call merges branch answers into a comparative answer. Emit `final_answer`.
5. Citation check: every DOI/PMID in the final answer is verified before display; unverifiable ones are removed or flagged. Emit `complete`.
6. Failures emit an `error` event with a plain user message.

Hermes sits under the fan-out branches, not above the whole pipeline **[my call]**, so round count, token use and guardrail placement stay controllable.

### Skills enabled for this slice **[my call]**
Paper Lookup (primary: 18 scholarly APIs including arXiv, OpenAlex, Crossref, Semantic Scholar, CORE, Unpaywall, OpenCitations, PubMed/PMC/Europe PMC), Literature Review, Citation Management, BGPT Paper Search, MarkItDown or LiteParse for reading PDFs. Web-search skills (Exa, Parallel Web, Research Lookup) are optional and likely need extra API keys **[unverified]**. Coverage of IEEE and ACL Anthology content is expected through OpenAlex, Semantic Scholar and arXiv rather than dedicated skills.

### Guardrail
- Scope: scientific research questions across the fields the enabled skills cover (life sciences, chemistry, medicine, ML/AI, physics, materials, engineering, geospatial). **[my call]** Thai and English input.
- Implemented as a cheap first check before any search runs **[my call]** (small model or rules). Out-of-scope gets a polite refusal, no agent call.
- Also constrain the agent so it only answers from retrieved papers, never from memory.

### Concurrency (10-50 users, no login) **[my call]**
Async FastAPI, per-request token and round caps, a global limit on simultaneous agent runs with a queue and visible "waiting" state, and a per-IP rate limit (no login means IP is the only handle). Assumes the app runs inside NECTEC's network or behind a gateway.

### Storage
Browser only (IndexedDB or localStorage): question history, saved answers and papers, per-device. Cleared if the browser is cleared; no cross-device sync. Backend is stateless.

### Config
`.env`: `OPENROUTER_API_KEY`, model id (gpt6-luna), caps, rate limits, enabled skills. No model names in code.

### UI **[my call on layout]**
Landing page, then the app: a chat-style research workspace with a live progress panel (plan, sources per query, then the answer with checkable references) and a saved-items view. Theme from the Figma reference once colors are supplied.

## Calls made after the builder check **[my call]**

- Frontend: rebuild the UI on MUI instead of restyling the existing Tailwind components; staying mergeable with upstream open-notebook is not a goal.
- Theme: ship a tokenized placeholder palette now, swap in the Figma colors when supplied. Thai font required (e.g. Noto Sans Thai or IBM Plex Sans Thai).
- Sources: default to keyless scholarly APIs (OpenAlex, Crossref, arXiv, PubMed, Europe PMC). Keyed sources (Semantic Scholar, Exa, Parallel, BGPT) are optional and switched on through `.env`.
- Model: `.env` holds a primary and a fallback model id. Global cap on simultaneous LLM calls so 5 branches x 50 users cannot all fire at once.
- Thai: keep a small Thai + English test set of questions for the guardrail and the answer language.
- Hermes: its README (checked 2026-10-22) describes a standalone agent (CLI, TUI, messaging gateway) with its own loop, memory and learning, MCP support, agentskills.io compatibility and OpenRouter as a provider. It shows no embedding API and no way to stream intermediate tool calls. Open question, see below.

## Answers from the user (2026-10-22)

- **Hermes integration:** the browser calls FastAPI, FastAPI calls Hermes Agent, same as the user's earlier repo `SurakiatP/AI-Job-Search-Agent-Platform-dem`. Read from that repo (`backend/src/job_search_platform/integrations/hermes_runtime.py`, `docs/engineering/hermes-proof.md`): Hermes is run as a pinned-revision subprocess in its own Python environment, started by the backend through a small bridge script (`native_bridge.py`) that speaks one JSON message per line over stdin/stdout. The bridge sends `progress`, `result` and `failed` events, and asks the backend for permission before each tool call (`tool_gate`). That earlier repo also sandboxes Hermes's terminal tools in Docker and verifies the pinned source by hash. **[my call]** Reuse the bridge pattern; start lighter (pinned revision, no Docker sandbox unless the chosen skills run code) since this slice only searches papers.
- **API shape:** every route is `/v1/<name>`; routes that run asynchronously are `/v1/async/<name>`. The ask pipeline (SSE stream) is therefore `/v1/async/<name>` **[my call on the name, e.g. `/v1/async/ask`]**.
- **Model:** `openai/gpt-6-luna` on OpenRouter, set in `.env`.
- **Where it runs:** localhost only for now. So no per-IP rate limit and no gateway/proxy work; keep the global cap on simultaneous agent runs. Public exposure is a later, separate decision.
- **Citation check:** existence only (DOI/PMID resolves). A failed check flags the claim visibly instead of removing it.
- **Git:** work on a new branch cut from `develop` of `https://github.com/SurakiatP/ai-scientist-agent` (the remote `develop` currently contains only `README.md`; the local repo has no commits and no remote yet). Branch name **[my call]**: `feature/research-search`. Nothing is pushed until the user says so.

## Left to the builder

- Exact way to call Hermes Agent from the FastAPI service and load only the chosen skills **[unverified]**.
- Whether gpt6-luna on OpenRouter supports prompt caching for the chosen provider route, and how to structure prompts so the shared prefix (system prompt + skill descriptions) is cacheable **[unverified]**.
- Which API keys the chosen skills need, and fallbacks when a source is down or rate-limited.
- Citation verification method and what counts as "supports the claim".
- The concurrency numbers (caps, queue length) after measuring real cost per question.
- Thai query handling: translate to English search terms before searching, answer language follows the question.
- Component choices and visual design within the constraints above.
