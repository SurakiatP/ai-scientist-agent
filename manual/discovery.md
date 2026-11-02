# Discovery

Evidence collected by `manual-kit discover` (deterministic; code is read, never run). Each item names the file it came from. This is the input for `manual-spec.md`; it is not the spec.

- Project: frontend
- Adapter: nextjs
- Counts: 2 documents, 11 routes, 0 roles, 0 permissions, 26 state sets, 0 form fields, 34 messages, 0 API routes, 0 flags, 3 environment names, 2149 UI strings

## Requirement and design documents

- **AGENTS.md** (agent-notes) `AGENTS.md`
- **Research Search frontend** (readme) `README.md`
  - Run

## Screens (routes)

| Route | Label | Source |
|---|---|---|
| / |  | `src/app/page.tsx` |
| /ask |  | `src/app/ask/page.tsx` |
| /chat |  | `src/app/chat/page.tsx` |
| /docs |  | `src/app/docs/page.tsx` |
| /faq |  | `src/app/faq/page.tsx` |
| /features/[slug] |  | `src/app/features/[slug]/page.tsx` |
| /files |  | `src/app/files/page.tsx` |
| /how-it-works |  | `src/app/how-it-works/page.tsx` |
| /saved |  | `src/app/saved/page.tsx` |
| /trash |  | `src/app/trash/page.tsx` |
| /usage |  | `src/app/usage/page.tsx` |

## In-page sections

(none found)

## Roles

(none found)

## Permissions

(none found)

## Workflow states and value sets

- **ACTIVE**: `queued` → `running` (`src/lib/runs.ts:37`)
- **ANALYZABLE**: `csv` → `xlsx` → `parquet` → `json` (`src/lib/files.ts:12`)
- **AnalysisStep**: `profiling` → `writing_script` → `running` → `repairing` → `storing` (`src/lib/sse.ts:55`)
- **AskMode**: `deep` → `quick` → `chat` → `docs` (`src/lib/sse.ts:27`)
- **DIM**: `#048090` → `#027C8F` (`src/components/research/ResearchScan.tsx:25`)
- **DOCS_ERR_CODES**: `docs_unreadable` → `docs_unreadable_permanent` → `docs_host` → `docs_not_found` → `docs_load_failed` (`src/lib/chat.ts:40`)
- **KEY_GATED**: `addgene` → `biogrid` → `brenda` → `cosmic` → `disgenet` → `drugbank` → `lincs-l1000` → `materials-project` → `omim` (`src/lib/sources.ts:91`)
- **Kind**: `session` → `project` → `file` (`src/components/trash/TrashPage.tsx:12`)
- **LINES**: `96%` → `90%` → `94%` → `72%` → `92%` → `88%` → `46%` → `86%` → `60%` (`src/components/research/PreviewPane.tsx:9`)
- **MODES**: `light` → `dark` → `system` (`src/components/landing/LandingHeader.tsx:36`)
- **OLD_KEYS**: `scientist-chat-v1` → `scientist-files-v1` → `scientist-history-v1` (`src/lib/importOld.ts:8`)
- **PACK_IDS**: `bio` → `chem` → `med` → `materials` → `ml` → `comm` (`src/lib/packs.ts:2`)
- **PAPER_TYPES**: `research` → `cs` → `review` → `thesis_th` → `proposal` (`src/lib/paperOutline.ts:5`)
- **PreviewStage**: `queued` → `preparing` → `layout` → `rendering` (`src/lib/sse.ts:220`)
- **REFUSAL_CODES**: `out_of_scope` → `injection` → `needs_search` → `use_research` → `empty_memory` → `too_long` → `unsafe_request` → `not_about_data` → `check_failed` (`src/lib/chat.ts:46`)
- **RowState**: `done` → `active` → `wait` → `skipped` (`src/components/research/PlanCard.tsx:18`)
- **STATEMENT_KINDS**: `ai` → `data` → `ethics` → `coi` (`src/lib/exportReport.ts:34`)
- **STATUS**: `queued` → `running` → `done` → `error` → `stopped` → `interrupted` (`src/lib/runs.ts:26`)
- **STATUSES**: `running` → `awaiting_plan` → `done` → `refused` → `error` → `stopped` → `interrupted` (`src/lib/chat.ts:56`)
- **STEPS**: `profiling` → `writing_script` → `running` → `repairing` → `storing` (`src/lib/chat.ts:104`)
- **SUPPORT**: `supported` → `partial` → `unsupported` → `no_quote` (`src/lib/refs.ts:54`)
- **SyncStatus**: `disabled` → `connecting` → `online` → `offline` → `conflict` (`src/lib/sync.ts:15`)
- **TABS**: `overview` → `tables` → `charts` → `findings` → `code` (`src/components/research/AnalysisArtifact.tsx:19`)
- **TABULAR**: `csv` → `json` (`src/components/files/FileDialogs.tsx:32`)
- **TEX_TEMPLATES**: `article` → `ieee` → `elsevier` → `springer` (`src/lib/exportReport.ts:18`)
- **WIDTHS**: `96%` → `88%` → `93%` → `72%` → `90%` → `46%` (`src/components/research/AnswerSkeleton.tsx:7`)

## Form fields

(none found)

## Messages users can meet (errors, validation, notices)

| Message |  | Source |
|---|---|---|
| ) ? a.split( |  | `src/lib/bibliography.ts:11` |
| A title is required |  | `ui:A title is required` |
| AbortError |  | `ui:AbortError` |
| Clear expired items |  | `ui:Clear expired items` |
| Copy failed |  | `ui:Copy failed` |
| Could not read the file for a preview; the data format is invalid |  | `ui:Could not read the file for a preview; the data format is invalid` |
| DOIs, PMIDs and arXiv IDs are checked against Crossref, PubMed and arXiv. Anything unconfirmed carries a warning. |  | `ui:DOIs, PMIDs and arXiv IDs are checked against Crossref, PubMed and arXiv. Anything unconfirmed carries a warning.` |
| Expired items cleared |  | `ui:Expired items cleared` |
| Fix the errors in the form to see a preview |  | `ui:Fix the errors in the form to see a preview` |
| Import failed. Try again; items already imported are not duplicated. |  | `ui:Import failed. Try again; items already imported are not duplicated.` |
| References that cannot be confirmed carry a warning. |  | `ui:References that cannot be confirmed carry a warning.` |
| References with a DOI, PMID or arXiv ID are checked that the identifier exists. Any that cannot be confirmed carry a warning. |  | `ui:References with a DOI, PMID or arXiv ID are checked that the identifier exists. Any that cannot be confirmed carry a warning.` |
| Request failed |  | `ui:Request failed` |
| Something went wrong |  | `src/lib/strings.ts:874` |
| The answer arrives with references. Those with a DOI, PMID or arXiv ID are checked against Crossref, PubMed or arXiv, and any that cannot be confirmed carry a warning. |  | `ui:The answer arrives with references. Those with a DOI, PMID or arXiv ID are checked against Crossref, PubMed or arXiv, and any that cannot be confirmed carry a warning.` |
| The content is invalid or over a limit. Check the title, sections and paragraphs |  | `ui:The content is invalid or over a limit. Check the title, sections and paragraphs` |
| The link expired. Try again |  | `ui:The link expired. Try again` |
| The run failed. You can retry. |  | `ui:The run failed. You can retry.` |
| This page failed to render. Try again; your chats stored in this browser are not affected. |  | `ui:This page failed to render. Try again; your chats stored in this browser are not affected.` |
| Warning label |  | `ui:Warning label` |
| color-mix(in srgb, var(--mui-palette-error-main) 6%, transparent) |  | `ui:color-mix(in srgb, var(--mui-palette-error-main) 6%, transparent)` |
| copyFailed |  | `ui:copyFailed` |
| empty plan |  | `src/lib/run.ts:371` |
| error |  | `ui:error` |
| error.main |  | `ui:error.main` |
| fail |  | `ui:fail` |
| failed |  | `ui:failed` |
| no file |  | `src/lib/run.ts:428` |
| no such session |  | `src/lib/run.ts:297` |
| no such turn |  | `src/lib/run.ts:375` |
| not awaiting |  | `src/lib/run.ts:376` |
| refusedCheckFailed |  | `ui:refusedCheckFailed` |
| warning |  | `ui:warning` |
| เกิดข้อผิดพลาด |  | `src/lib/strings.ts:261` |

## API routes

(none found)

## Feature flags

(none found)

## Integrations

(none found)

## Environment names (values are never read)

`NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SITE_URL`, `NODE_ENV`

## Running it locally

- `dev`: `next dev`
- `build`: `next build`
- `start`: `next start`
- `lint`: `eslint`
- `test`: `vitest run`
- file: `.env.example`
- file: `Dockerfile`

## Seed / demo data

(none found: the manual needs invented test data)

## UI strings (sample)

"/chat", "use client", "disabled", "lg", "running", "chat", "docs", "awaiting_plan", "flex", "column", "auto", "max(12px, env(safe-area-inset-bottom))", "100dvh", "grid", "center", "none", "flex-start", "10px", "primary.main", "primary.contrastText", "1.5rem", "text.secondary", "wrap", "system-ui, sans-serif", "light dark", "AI Scientist", "เกิดข้อผิดพลาดบางอย่าง / Something went wrong", "ลองอีกครั้ง ข้อมูลแชตในเบราว์เซอร์ไม่ได้รับผลกระทบ / Try again; your chats in this browser are not affected.", "ลองอีกครั้ง / Retry", "0 20px", "inherit", "thai", "latin", "swap", "ตั้งคำถามวิจัยเป็นภาษาไทยหรืออังกฤษ ได้คำตอบจากงานวิชาการพร้อมอ้างอิง อ้างอิงที่มี DOI, PMID หรือ arXiv ID จะถูกตรวจว่าเลขนั้นมีอยู่จริง", "AI Scientist · ผู้ช่วยค้นคว้างานวิชาการ", "th_TH", "en_US", "website", "/og", "cover", "(prefers-color-scheme: light)", "(prefers-color-scheme: dark)", "background.default", "#E8EDF4", "#0E1A2C", "#1C4E8F", "1px solid var(--mui-palette-divider)", "24px", "color-mix(in srgb, var(--mui-palette-divider) 60%, transparent)", "background.paper", "0.75rem", "0.08em", "uppercase", "2rem", "2.75rem", "-0.015em", "balance", "0.9375rem", "pretty", "text.primary", "0.8125rem", "tabular-nums", "nowrap", "0.875rem", "divider", "absolute", "14px", "surface.aiSoft", "surface.ai", "& svg", "0.6875rem", "relative", "@media (prefers-reduced-motion: no-preference)", "& .fig-line", "left", "calc(250ms + var(--i) * 110ms)", "& .fig-cite", "calc(500ms + var(--i) * 110ms)", "& .fig-note", "1.3s", "& .fig-note + .fig-note", "1.55s", "@keyframes fig-write", "scaleX(0.04)", "@keyframes fig-land", "translateY(-6px) scale(0.6)", "@keyframes fig-slide", "translateX(12px)", "blur(3px)", "0 40px 80px -40px rgb(28 78 143 / 0.45), 0 4px 14px -6px rgb(14 26 44 / 0.12)", "space-between", "--i", "0.625rem", "16px", "DOI", "PMID", "arXiv", "inline-flex", "evidence.verified", "th", "clip", "&::before", "0 0 auto 0", "radial-gradient(55% 60% at 80% 18%, rgb(var(--mui-palette-primary-mainChannel) / 0.16), transparent 70%), radial-gradient(40% 45% at 8% 70%, rgb(255 255 255 / 0.5), transparent 70%)", "[data-dark] &", "radial-gradient(55% 60% at 80% 18%, rgb(var(--mui-palette-primary-mainChannel) / 0.14), transparent 70%)", "minmax(0,1fr)", "minmax(0,1.1fr) minmax(0,0.9fr)", "2.375rem", "3rem", "3.75rem", "-0.02em", "anywhere", "block", "36rem", "1rem", "1.0625rem", "&:hover", "rgb(var(--mui-palette-primary-mainChannel) / 0.06)"
