# Production roadmap: sandbox runner, TOR research capabilities, platform access

Status: approved by the user on 2026-10-29 ("เริ่มจาก sandbox runner ก่อนเลย และทำระยะ 2 + ระยะ 3").
Executed plan by plan, in the order below, each on its own `feature/*` branch off `develop`. Each plan is written
after the previous one lands, against the code as it then is.

Source of scope: TOR (`ขอบเขตของงาน (TOR) โครงการพัฒนาแพลตฟอร์ม AI Scientist.docx` §3 and
`TOR_AI_Scientist_Agent_Platform_v1.0.docx` §5.1), PRODUCT.md, and the codebase analysis of 2026-10-29.

## Standing constraints (every plan)

- No login and no user accounts in the web app (user decision). Machine access in plan 9 uses API keys issued by an
  operator CLI, never a sign-up page.
- Hermes stays the agent backend; no LangChain.
- Thai and English for every user-visible string (`frontend/src/lib/strings.ts` th/en parity test).
- No invented metrics or claims in copy. Features not shipped stay labelled as in development.
- Every container image pinned by digest; every new third-party dependency pinned (uv.lock / package-lock).
- The backend container never gets the host Docker socket and no service in `infra/compose.yaml` runs `privileged`.
- Secrets never in images, the repo, URLs or logs.
- One uvicorn worker until plan 10 lands.

## Plans, in order

1. **Sandbox runner** (`2026-10-29-sandbox-runner.md`). A Docker-in-Docker daemon under the sysbox runtime, reachable
   only by the backend over mutual TLS, sharing one volume path with the backend so bind mounts resolve. Unblocks Deep
   Research branches and data analysis in the Compose deployment.
2. **Public data sources (≥10)**. Branches can query at least 10 public scientific sources: PubMed, arXiv, Crossref,
   OpenAlex, Europe PMC, Semantic Scholar, UniProt, PubChem, ChEMBL, ClinicalTrials.gov, NCBI GEO, Materials Project
   (key-gated: skipped with a note when no key is configured). Delivered by enabling vetted K-Dense skills at the pinned
   revision; a skill is enabled only after a recorded review (pinned revision, file list, network hosts it contacts, no
   install-time code). Citation verification extends to OpenAlex/Europe PMC identifiers.
3. **Adaptive re-plan**. When a branch returns fewer than a threshold of usable papers, the pipeline asks the strategy
   model for broader or alternative terms and runs up to one extra round, shown in the progress card as a plan change.
   "No papers found" is reached only after the extra round also comes back empty.
4. **Reviewer pass and quoted evidence**. Before the answer is delivered, a reviewer call checks each cited claim
   against the paper's abstract/snippet and flags unsupported claims; each reference carries the quoted passage it was
   cited for. Shown in SourceInspector.
5. **Domain skill packs (6 domains)**. Composer lets the user pick a pack: bioinformatics, cheminformatics, medicine,
   materials, machine learning, research communication. A pack selects the enabled skills for branches and the
   analysis image variant. A second analysis image adds scanpy, RDKit, PyMC, pymatgen, lifelines, scikit-learn, SHAP.
6. **Provenance manifest**. Every finished run stores a manifest (model ids, prompt versions, search terms per round,
   skill revisions, sandbox image digests, analysis code, paper list with identifiers, timings, cost) downloadable as a
   JSON + files bundle from the answer.
7. **Hermes branch cost metering**. Branch LLM usage is reported by the bridge and recorded with the run, so the
   manifest and usage page carry the full cost. (Prerequisite moved forward from the enterprise phase because plan 6
   needs it.)
8. **Chat over uploaded documents + bibliography export**. PDFs uploaded to the library are chunked and embedded
   (Postgres + pgvector); a session can be grounded in selected documents with page-cited answers. References export as
   BibTeX and RIS.
9. **REST API + API keys + OpenAPI + Python SDK, then MCP server**. API keys (hashed, created and revoked by an operator
   CLI) authorize `/v1/runs` and artifact routes for machine clients; OpenAPI published; a small Python SDK package.
   An MCP server (FastMCP, Streamable HTTP, same API keys) exposes `start_research`, `get_run`, `wait_run`,
   `get_artifact`, `approve`. A2A is out of scope.
10. **Multi-process backend**. Run queue in Postgres (`FOR UPDATE SKIP LOCKED`), store change feed via
    `LISTEN/NOTIFY`, in-process caches moved or made per-process safe, and interrupted runs resumed after a restart.

## Out of scope for this roadmap

Login/OIDC, Labs and roles, Kubernetes, A2A, Modal/Daytona, budgets per lab, podcasts.
