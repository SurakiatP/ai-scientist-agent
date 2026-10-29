# Domain Skill Packs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The researcher picks one of six domain packs in the composer (bioinformatics, cheminformatics, medicine, materials, machine learning, research communication) or leaves "General". A pack steers Deep Research toward that field's sources and databases, and lets data analysis use that field's libraries (scanpy, RDKit, PyMC, pymatgen, lifelines, scikit-learn, SHAP) in a second, pinned analysis image (TOR §3 "ขีดความสามารถเฉพาะทาง 6 ด้าน").

**Architecture:** `scientist/packs.py` is the single registry. The run request carries `pack: str | None`. Research: the pack adds a short, fixed hint to the strategy prompt and to every branch's extraction instructions (preferred paper sources and databases from the existing registries) — no new tools, no new skills inside branches. Analysis: a pack with libraries switches the sandbox to `settings.sandbox_science_image`, widens the AST import allow-list to that pack's libraries only, and tells the analysis model which libraries exist. The turn stores `pack`; provenance records it.

**Tech Stack:** FastAPI + pydantic, Docker (new pinned image), GitHub Actions, Next.js 16 + MUI, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-29-production-roadmap.md` (plan 5)

## Global Constraints

- Pack ids (exact): `bio`, `chem`, `med`, `materials`, `ml`, `comm`. Absent/None = General (today's behaviour, byte-identical prompts). Unknown id → 422.
- Each pack: `name_th`, `name_en`, `paper_sources: list[str]` (ids from `sources.PAPER_SOURCES`), `databases: list[str]` (ids from `sources.KEYLESS_SOURCES` only), `libs: list[str]` (analysis import roots; may be empty), `hint: str` (English, ≤ 400 chars, no instructions that override safety rules). Exact contents:
  - bio: sources pubmed, europepmc, biorxiv; databases uniprot, ncbi-gene, geo, ensembl, string, reactome (keep only ids that exist in KEYLESS_SOURCES); libs scanpy, anndata.
  - chem: sources pubmed, europepmc, chemrxiv-if-present-else-omit, crossref; databases pubchem, chembl, chebi, bindingdb, zinc (keyless only); libs rdkit.
  - med: sources pubmed, europepmc, medrxiv; databases clinicaltrials, clinvar, dailymed, fda, who (keyless only); libs lifelines, scipy.
  - materials: sources arxiv, crossref, openalex; databases cod, nist (keyless only; materials-project is key-gated and must not appear); libs pymatgen.
  - ml: sources arxiv, semanticscholar, openalex; databases none; libs sklearn, shap, scipy.
  - comm: sources crossref, openalex, semanticscholar, doaj; databases none; libs none.
  A test asserts every listed source/database id exists in the registries and every database is keyless.
- Analysis science image `backend/sandbox/Dockerfile.science`: base = the same pinned python image as `backend/sandbox/Dockerfile` (digest-pinned), exact pinned versions of pandas, numpy, matplotlib, openpyxl, pyarrow (same as the base image) + scanpy, anndata, rdkit, pymc, pymatgen, lifelines, scikit-learn, shap, scipy; same runner.py, same non-root user, same entrypoint. CI publishes it as `ghcr.io/<repo>/sandbox-science` with the same tag rules (images.yml include entry). `settings.sandbox_science_image: str = "scientist-sandbox-science:latest"`; compose wires `SANDBOX_SCIENCE_IMAGE` like `SANDBOX_IMAGE`; `sandbox-init.sh` pulls it (pull, fallback inspect) and the smoke script checks it imports rdkit (one line). `scripts/dev.sh` builds it locally only when missing (it is large; print a one-line notice).
- Analysis with a pack whose `libs` is non-empty: image = science image; ALLOWED_IMPORTS for that run = base set ∪ pack libs (and their submodules); no other change to the AST rules or sandbox flags (network none, read-only, limits). The analyze prompt gets one line listing the extra libraries. Pack with empty libs → base image and base imports.
- Research with a pack: the strategy user message and each branch's instructions get one appended line: `Field focus (<name_en>): prefer <paper sources> for literature and <databases> for database facts.` (databases part omitted when empty, and omitted when database-lookup is not enabled). No other prompt change.
- UI (/impeccable — read DESIGN.md and `/Users/parksurakiat/.claude/skills/impeccable/reference/craft-floor.md` or invoke the skill): a compact pack picker in the composer next to the existing mode chip (same chip/menu pattern, MUI icons, 44px targets), default "ทั่วไป / General"; the chosen pack is remembered per session (prefs or session field — follow the existing mode pattern); the turn shows its pack as quiet caption text in the answer meta ("สาขา: เคมีสารสนเทศ" / "Field: Cheminformatics"). th/en strings; no new colours.
- Persistence: `pack` on the turn (server turn JSON + client validation: unknown values dropped, never the turn); provenance gains `pack: str | None`.
- Never read or print `.env` or secrets. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; stage explicit paths.

## Review Focus

1. A pack's libraries never widen imports for a General run, and a General run never uses the science image.
2. `from rdkit.Chem import Descriptors` and `import sklearn.ensemble` are allowed under their packs; `import os`, `subprocess`, `importlib` stay banned under every pack.
3. The science image is pinned (digest base + exact versions) and runs as the same non-root user with no network.
4. A pack's hint never names a key-gated database.
5. Old turns / old clients without `pack` behave exactly as today.

---

### Task 1: Pack registry, request field, research hints, persistence (backend)

**Files:** create `backend/src/scientist/packs.py`; modify `routes_ask.py`/`routes_runs.py` request model (`pack`), `runs.py` (carry to turn + pipeline), `pipeline.py` (strategy + branch hint), `provenance.py`/`events.py` (`pack`), store turn model if it whitelists fields; tests `backend/tests/test_packs.py` (new), `test_pipeline.py`, `test_runs.py`, `test_provenance.py`.

- [ ] Tests first (registry integrity incl. keyless; 422 on unknown; General prompts byte-identical; hint text exact; provenance.pack). Implement; full suite. Commit `feat(packs): six domain packs steer research sources and databases`.

### Task 2: Science analysis image and pack-aware analysis (backend + infra)

**Files:** create `backend/sandbox/Dockerfile.science`; modify `backend/src/scientist/sandbox.py` (per-run allow-list + image), `routes_analyze.py`/analysis run path (pack → image/libs/prompt line), `config.py`, `prompts/analyze.md` (placeholder line), `.github/workflows/images.yml`, `infra/compose.yaml` (env), `infra/deploy/sandbox-init.sh`, `infra/deploy/sandbox-smoke.sh`, `scripts/dev.sh`, `docs/deploy.md`, env examples; tests `backend/tests/test_analyze.py`, `test_sandbox_runner.py` (or a new test file).

- [ ] Tests first (Review Focus 1–2 with the AST checker; image choice per pack). Build the science image locally once (`docker build -f backend/sandbox/Dockerfile.science backend/sandbox`), run one profile-only analysis through `run_analysis` with it plus one script importing rdkit and sklearn, then remove the test image. Pin every version you install (record resolved versions). Commit `feat(packs): science analysis image with field libraries, pack-aware imports`.

### Task 3: Pack picker in the composer (frontend, /impeccable)

**Files:** `frontend/src/lib/sse.ts`/request builders (send `pack`), `frontend/src/lib/prefs.ts` or session store (remember choice like mode), `frontend/src/components/chat/Composer.tsx` (picker), `frontend/src/components/chat/AgentMessage.tsx` (field caption), `frontend/src/lib/chat.ts` (turn.pack validation), `frontend/src/lib/packs.ts` (ids + th/en names; a test asserts the ids match `backend/src/scientist/packs.py`), `frontend/src/lib/strings.ts`; tests next to them.

- [ ] Read DESIGN.md + craft floor; tests first; `npm test`, eslint, tsc, build. Commit `feat(chat): choose a field pack in the composer`.

### Task 4: Live check (controller)

- [ ] Worktree stack on :8100/:3100. Deep question with the `chem` pack (records from PubChem/ChEMBL expected); an analysis of a small CSV with the `ml` pack that uses scikit-learn. Confirm the field caption, the sources, and that the analysis ran in the science image.
