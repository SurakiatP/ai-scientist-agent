# Chat-first Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/ask` + `/saved` frontend with the chat-first AI Scientist workspace in `docs/design/ai-scientist-chat-redesign/images/01–19` (Obsidian / Arctic Teal, Light/Dark/System, Thai/English), wired only to what the backend really does.

**Architecture:** Next.js App Router client app. Landing at `/`; one chat workspace at `/chat`. Projects, sessions and turns live in a persisted zustand store (browser only, like today's history). A run controller module drives `streamAsk` (`POST /v1/async/ask` SSE) and writes real events into the store. The backend is unchanged.

**Tech Stack:** Next.js 16.4 (read `frontend/node_modules/next/dist/docs/` before using any API; `frontend/AGENTS.md`), React 19, MUI 9 (`cssVariables` + `colorSchemes`), zustand 5 persist, react-markdown, gsap (landing only), vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-10-24-ai-scientist-chat-redesign.md`; design contract: `docs/design/ai-scientist-chat-redesign/{README,CLAUDE-HANDOFF,THEME-OPTIONS}.md` and images 01–19 (visual reference only: all papers, DOIs, counts, charts in them are fake).

## Global Constraints

- Every shell command starts with `rtk` (`/Users/parksurakiat/.codex/RTK.md`). Never push, merge, reset, clean, stash or checkout over files. Working tree has uncommitted work: touch only your task's files, `git add` explicit paths only.
- Brand is "AI Scientist" only. No NECTEC mark. No LangChain. No new backend routes. No images/illustrations on the landing page.
- Theme A tokens (starting points, verify WCAG AA after build): dark shell `#0D151B`, surface `#182B34`, text `#ECF4F4`, primary `#69D8D1`; light = warm white ground, deep blue-black text, deeper teal primary (≥4.5:1 on its surface). Semantic tokens only; no per-component hex.
- Theme: Light / Dark / System, persisted, no flash on first paint, System follows OS live. Language th/en persisted; switching keeps sessions and theme.
- Honesty: show only real backend data. No fake progress, sources, counts, plan steps, charts, DOI/PMID. Identifier chip wording stays "identifier exists" (existence only, never "supports the claim"). Unsupported features are visibly disabled with a one-line reason, or omitted.
- Guardrail is the backend's: render the `refused` event's `reason` as a plain assistant message in the thread (no red bar, no popup); never answer off-topic text client-side.
- Accessibility: 44px targets, visible 2px focus ring, `prefers-reduced-motion` honoured, 360px width without horizontal scroll, keyboard reachable sidebar/inspector, live region for run status.
- Copy: Thai and English written by hand per control; never OCR the mockups. Max question length stays `MAX_QUESTION = 2000`.
- Code style: match surrounding files (terse, `ponytail:` comments for known ceilings). Test runner: `rtk npm --prefix frontend test`; lint `rtk npm --prefix frontend run lint`; build `rtk npm --prefix frontend run build`.

## Backend gaps (reported, not faked)

No server sessions/projects; `ask` takes only `{question}` so a follow-up run does not see earlier turns; the `strategy` event is informational so the research plan is read-only (no edit/approve); no file upload; no analysis/chart artifacts; no PDF/DOCX export; no per-citation quoted passage; no server-side "quick chat" mode (only the Deep Research pipeline exists). Stop works (client abort cancels the run).

## Review Focus

- Reload mid-run: persisted turn must not stay "running" forever → shown as interrupted with Retry (T2 test).
- Corrupt/oversized/foreign localStorage values must never crash the app (T2 test, as `history.ts` does).
- Second run started in another session while one runs is blocked with a reason, never silently dropped (T2 test).
- Thai IME composition: Enter must not submit while composing (T4 test).
- Deleting the active session/project falls back to a valid empty chat, no blank screen (T6 test).
- Very long Thai titles/URLs/tables in answers don't overflow at 360px (T8 browser check).

---

### Task 1: Foundation: theme, preferences, strings

**Files:**
- Modify: `frontend/src/theme.ts`, `frontend/src/theme.test.ts`, `frontend/src/app/layout.tsx`, `frontend/src/lib/strings.ts`
- Create: `frontend/src/lib/prefs.ts`, `frontend/src/lib/prefs.test.ts`, `frontend/src/components/Providers.tsx`

**Interfaces:**
- Produces:
  - `theme` (MUI theme, `cssVariables: { colorSchemeSelector: "data" }`, `colorSchemes: { light, dark }`, default `"system"`), plus `<InitColorSchemeScript>` in the root layout for flash-free first paint. Semantic extras via module augmentation: `theme.vars.palette.evidence.{verified,unverified,unknown}` and `surface.{shell,raised}`.
  - `usePrefs(): { lang: Lang; setLang(l: Lang): void }` (zustand persist, key `scientist-prefs-v1`, uses `safeStorage` from `lib/history.ts`; unknown values fall back to `"th"`); theme mode is MUI's `useColorScheme()` (`mode`, `setMode`).
  - `useT(): Strings` returns `strings[lang]` after hydration (`useHydrated`), Thai during SSR; sets `document.documentElement.lang`.
  - `strings.{th,en}` gain every key later tasks name; add keys as tasks need them, th and en always together (type `Strings` enforces parity).
- Consumes: `safeStorage`, `useHydrated` (`lib/history.ts`), `Lang`/`strings` (`lib/strings.ts`).

- [ ] **Step 1:** Write failing tests: `prefs.test.ts` (default `th`; `setLang("en")` persists to `scientist-prefs-v1`; garbage stored value reads as `th`), `theme.test.ts` (dark and light `primary.main` vs their `background.paper` ≥ 4.5:1 and body text vs background ≥ 7:1, computed with a small contrast helper in the test; `evidence` tokens exist in both schemes).
- [ ] **Step 2:** Run `rtk npm --prefix frontend test -- prefs theme`, expect FAIL.
- [ ] **Step 3:** Implement `theme.ts` (Noto Sans Thai kept via `next/font` in layout; radius 10 default, 14 for composer/sheets; no shadows except composer focus ring; keep `palette` export only if still imported, otherwise delete it and fix importers), `prefs.ts`, `Providers.tsx` (`AppRouterCacheProvider` + `ThemeProvider` + `CssBaseline`), and `layout.tsx` (remove the old `Nav` shell; render `InitColorSchemeScript attribute="data"`, skip link, `{children}`). Old `Nav` is deleted in T3, so until then `layout` keeps rendering `children` only and old pages are redirected in T3 (they may look unstyled in between; the suite must still pass, delete or update tests of removed shell pieces).
- [ ] **Step 4:** Run full `rtk npm --prefix frontend test` and `run lint`, expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): arctic teal theme, light/dark/system, language prefs`.

### Task 2: Chat store and run controller

**Files:**
- Create: `frontend/src/lib/chat.ts`, `frontend/src/lib/chat.test.ts`, `frontend/src/lib/run.ts`, `frontend/src/lib/run.test.ts`, `frontend/src/lib/progress.ts` (move `Progress`, `emptyProgress`, `reduce` out of `ProgressPanel.tsx`, keep behaviour and its existing tests)
- Modify: `frontend/src/lib/history.ts` (export unchanged; add nothing)

**Interfaces:**
- Produces (`lib/chat.ts`), persisted key `scientist-chat-v1`, version 1, same validate-or-drop discipline and size bounds as `history.ts`:
  ```ts
  type Turn = { id: string; question: string; createdAt: number;
    status: "running" | "done" | "refused" | "error" | "stopped" | "interrupted";
    progress: Progress; answer?: { content: string; references: Reference[] };
    refused?: string; error?: string };
  type Session = { id: string; projectId: string; title: string; createdAt: number; updatedAt: number; turns: Turn[] };
  type Project = { id: string; name: string; createdAt: number };  // id "personal" is built in, name "" = localized default
  useChatStore: { projects; sessions; activeId: string | null; activeProjectId: string;
    newSession(projectId?: string): string; setActive(id: string | null); renameSession(id, title); deleteSession(id);
    moveSession(id, projectId); addProject(name): string; renameProject(id, name); deleteProject(id) /* sessions move to "personal" */;
    patchTurn(sessionId, turnId, patch: Partial<Turn>); addTurn(sessionId, turn: Turn); clearAll(); }
  ```
  Session `title` = first question trimmed to 60 chars. Caps: 200 sessions (oldest unsaved-by-activity dropped), 50 turns/session, 30 projects. On rehydrate every `running` turn becomes `interrupted`. `importLegacyHistory()` runs once (flag in the same store) converting `scientist-history-v1` items into done sessions under "personal".
- Produces (`lib/run.ts`): `startRun(sessionId: string, question: string): Promise<void>` creates the turn, streams `streamAsk`, reduces progress with `reduce`, patches the turn per event (final_answer → `answer`; refused; error mapped to `error` text keys from `Strings`; abort → `stopped`; stream ended without terminal event → `error` "cut off"). `stopRun()`, `useRunState(): { sessionId: string | null; turnId: string | null }`, `canStart(): { ok: true } | { ok: false; reason: "busy" }` (only one run at a time). Run state is module-level (survives navigation inside the app); not persisted.
- Consumes: `streamAsk`, `AskEvent` (`lib/sse.ts`), `safeStorage`, `newId`.

- [ ] **Step 1:** Write failing tests. `chat.test.ts`: new/rename/delete/move session; deleting a project moves its sessions to `personal`; title derived and capped; rehydrate turns `running`→`interrupted`; garbage/oversized persisted JSON ignored; legacy import happens once and maps question/answer/references. `run.test.ts` (mock `streamAsk` with an async generator): done run stores answer + references and ends `done`; `refused` stores reason; `error` event stores text; abort ends `stopped`; stream ending with no terminal event ends `error`; `startRun` while running rejects with `busy` and creates no turn; progress snapshot equals folding `reduce` over the events.
- [ ] **Step 2:** Run `rtk npm --prefix frontend test -- chat run`, expect FAIL.
- [ ] **Step 3:** Implement per the Interfaces. A history/storage failure must never abort a run (as today).
- [ ] **Step 4:** Run full test suite + lint, expect PASS.
- [ ] **Step 5:** Commit `feat(frontend): chat store and run controller`.

### Task 3: App shell and navigation

**Files:**
- Create: `frontend/src/app/chat/page.tsx`, `frontend/src/components/shell/{AppShell,Sidebar,ProjectSwitcher,SessionList}.tsx`, `frontend/src/components/shell/shell.test.tsx`
- Modify: `frontend/src/app/ask/page.tsx` and `frontend/src/app/saved/page.tsx` become `redirect("/chat")` (server `redirect` from `next/navigation`; check the installed docs); `frontend/src/lib/strings.ts`
- Delete: `frontend/src/components/Nav.tsx`, `Nav.test.tsx`, `frontend/src/app/ask/page.test.tsx`, `frontend/src/app/saved/page.test.tsx`, `ReferenceList`/`AnswerView` are kept for T4/T5

**Interfaces:**
- Produces: `<AppShell>{children}</AppShell>` used by `app/chat/page.tsx`: persistent sidebar ≥ md (collapsible with a toggle, collapsed state in `prefs`), temporary `Drawer` below md opened from a 44px menu button in a top bar. `Sidebar`: brand mark (CSS/SVG only), "New chat" button (`newSession()` + focus composer), search field filtering session titles (case-insensitive substring), projects list (expand/collapse, "+" opens an inline name input), recents grouped by project of the active project first, each row shows title, relative time, running dot when `useRunState().sessionId` matches, settings link at the foot (opens the T6 dialog via a `useSettingsOpen` store exported here: `{ open: boolean; set(o: boolean) }`). `ProjectSwitcher` in the page header: current project name, menu to switch/create. Main region slot gets `{ children }`; right panel region slots are added in T5.
- Consumes: `useChatStore`, `useT`, `useRunState`.

- [ ] **Step 1:** Failing tests: new-chat button creates and activates a session only when none empty exists (reuse an existing empty session); search filters rows; switching project changes the highlighted project and does not delete sessions; running session row shows an accessible "running" label; the drawer opens/closes via keyboard and Escape returns focus to the menu button.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. Empty lists show a one-line real empty state, never sample rows. **Step 4:** Full suite + lint PASS. **Step 5:** Commit `feat(frontend): chat app shell, sidebar, project switcher`.

### Task 4: Conversation and composer

**Files:**
- Create: `frontend/src/components/chat/{Composer,Thread,UserMessage,AgentMessage,EmptyChat}.tsx`, `frontend/src/components/chat/chat.test.tsx`
- Modify: `frontend/src/app/chat/page.tsx`, `frontend/src/components/AnswerView.tsx` (keep `cite`; restyle to tokens), `frontend/src/lib/strings.ts`

**Interfaces:**
- Produces: `EmptyChat` (heading "วันนี้อยากสำรวจเรื่องใด?" / English equivalent, large composer, three starter prompts taken from `sampleQuestions`, clicking one fills the composer, never auto-sends). `Composer({ sessionId })`: multiline textarea (Enter sends, Shift+Enter newline, not while IME composing), char counter near the limit, attach button disabled with tooltip reason, non-interactive "Deep Research" mode chip with tooltip that quick chat is not available, send button; while this or any run is active the send button becomes Stop (`stopRun()`); other-session busy shows "Another research run is in progress" and disables send. `Thread`: user and Hermes messages with time; `AgentMessage` renders by `turn.status`: `running` (inline `ProgressCard` slot from T5, until then a plain status line with `aria-live="polite"`), `done` (Markdown via `AnswerView` with inline citation pills; actions: Ask follow-up (focuses composer), Copy, and the T5 report/export slot), `refused` (plain message + "back to research" starter chips), `error`/`interrupted`/`stopped` (message + Retry that calls `startRun(sessionId, turn.question)`). Follow-up note under the composer once the session has turns: "Each question is answered on its own; earlier turns are not sent" (th/en). Auto-scroll to the newest message unless the user scrolled up.
- Consumes: `startRun`, `stopRun`, `canStart`, `useRunState`, `useChatStore`, `AnswerView`, `useT`.

- [ ] **Step 1:** Failing tests (mock `lib/run`): Enter sends trimmed text and clears; Shift+Enter does not; Enter during `isComposing` does not send; over-limit disables send; disabled attach exposes its reason; refused turn renders reason as plain text without `role="alert"`; error turn Retry calls `startRun` with the same question; busy elsewhere disables send with reason; no sample rows when store is empty.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Full suite + lint PASS. **Step 5:** Commit `feat(frontend): conversation thread and composer`.

### Task 5: Research progress, source inspector, report export

**Files:**
- Create: `frontend/src/components/research/{ProgressCard,ProgressPanel,SourceInspector,ReportActions}.tsx`, `frontend/src/lib/report.ts`, `frontend/src/lib/report.test.ts`, `frontend/src/components/research/research.test.tsx`
- Modify: `frontend/src/components/ReferenceList.tsx` (token restyle; rows gain an "Open details" action), `frontend/src/components/AnswerView.tsx` (citation pill click → inspector), `frontend/src/components/ProgressPanel.tsx` (delete after move), `frontend/src/lib/strings.ts`, `frontend/src/components/chat/AgentMessage.tsx`

**Interfaces:**
- Produces: `ProgressCard({ turn })` inside the thread: the four real stages (plan → search → write → check) derived from `turn.progress.phase`, search terms from `strategy` shown read-only as "Research plan" (label says "proposed by Hermes, not editable yet"), per-term paper counts from `progress.sources`, answered terms, waiting position, elapsed time while running. `ProgressPanel({ turn })`: right panel ≥ lg with the same facts as a compact list (stages x/4, sources found = sum of `sources`, branch summaries done); no "after filtering" or other invented counts. `useInspector()` store `{ ref: { sessionId; turnId; refId } | null; open(r); close() }`. `SourceInspector`: right panel ≥ lg, bottom sheet (`Drawer anchor="bottom"`) below; shows title, authors, year, source host, DOI/PMID when present, the identifier-check status chip (verified→"Identifier exists", unverified→"Not found", unknown→"Could not check", no identifier→"No identifier to check") with the note that this does not confirm the paper supports the claim, "Open source" link (http/https only, `rel="noopener noreferrer"`), close button; Esc closes and focus returns to the citation that opened it. `lib/report.ts`: `buildReportMarkdown(session: Session, turn: Turn, lang: Lang): string` (question, answer, numbered references with DOI/PMID/url and check status) and `downloadText(name: string, text: string)`. `ReportActions`: "Copy answer", "Download report (.md)" real; "PDF" and "DOCX" shown disabled with reason "Not supported by the backend yet".
- Consumes: `Turn`/`Session` (T2), `Progress` (`lib/progress.ts`), `paperLink` (`ReferenceList.tsx`).

- [ ] **Step 1:** Failing tests: `report.test.ts` (references numbered like the answer, unverified references stay listed with their status, Thai and English headings, no HTML injected); component tests (stage highlighting from phase; counts equal the progress data; clicking a citation pill opens the inspector for that reference; inspector shows no quote section; non-http url yields no link; Esc closes; PDF/DOCX buttons are disabled with a reason).
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement; GSAP only for one pulse on the active stage, never built under reduced motion (as today). **Step 4:** Full suite + lint PASS. **Step 5:** Commit `feat(frontend): research progress, source inspector, report export`.

### Task 6: Settings, project and session management

**Files:**
- Create: `frontend/src/components/settings/SettingsDialog.tsx`, `frontend/src/components/shell/SessionMenu.tsx`, `frontend/src/components/settings/settings.test.tsx`
- Modify: `frontend/src/components/shell/{Sidebar,SessionList,ProjectSwitcher}.tsx`, `frontend/src/lib/strings.ts`

**Interfaces:**
- Produces: `SettingsDialog` (opened via `useSettingsOpen`): language th/en radio, theme Light/Dark/System radio (`useColorScheme`), "Data stays in this browser" note with a "Delete all chats" action behind an in-dialog confirm step (no `window.confirm`), read-only backend status line from `GET /v1/health` (reachable / unreachable, no secrets). `SessionMenu` (kebab on each row, keyboard reachable): rename (inline), move to project, delete (inline confirm). Project rename/delete with the same pattern; deleting the active session or project falls back to an empty chat.
- Consumes: `useChatStore` actions, `usePrefs`, `useColorScheme`, `API_BASE`.

- [ ] **Step 1:** Failing tests: switching language re-renders labels and keeps sessions; mode change calls `setMode`; delete-all requires the confirm step then empties store; deleting the active session activates none (EmptyChat); health failure shows "unreachable" without throwing.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Full suite + lint PASS. **Step 5:** Commit `feat(frontend): settings, project and session management`.

### Task 7: Landing page

**Files:**
- Modify: `frontend/src/app/page.tsx`, `frontend/src/app/page.test.tsx`, `frontend/src/components/RunFigure.tsx` (retoken or delete if unused), `frontend/src/lib/strings.ts` (`landing`)
- Create: `frontend/src/components/landing/LandingHeader.tsx` if the page file grows past ~200 lines

**Interfaces:**
- Produces: image-free landing per images 01, 11, 18: header (brand, anchors, language and theme controls, "เริ่มต้นใช้งาน / Get started" → `/chat`), typography-led hero ("ตั้งคำถามวิจัย แล้วตามรอยคำตอบถึงหลักฐาน" and an English twin), primary CTA + "How it works" anchor, an example-question block that links to `/chat` (it does not auto-send), the ask → search → verify path as a plain line/step list (no icon-card grid, no kicker/eyebrow, no invented numbers or testimonials), a short honest "what the check means" note (identifier existence only). One authored motion moment (the single run-trace line drawing once), reduced-motion static. Use the `/impeccable` craft floor: decide the layout from the committed world, no gradient text, no glow-as-decoration.
- Consumes: `useT`/landing strings, `useColorScheme`.

- [ ] **Step 1:** Failing tests: CTA href is `/chat`; no `<img>`/`<svg role="img">`/`background-image` url in the landing markup; renders Thai and English; theme/language controls change prefs; no "NECTEC" text.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** Implement. **Step 4:** Full suite + lint + `rtk npm --prefix frontend run build` PASS. **Step 5:** Commit `feat(frontend): chat-first landing`.

### Task 8: Verification, docs, gap report

**Files:**
- Modify: `DESIGN.md` (replace the warm-paper world with the implemented Arctic Teal system, derived from shipped code), `PRODUCT.md` (only factual drift), `README.md` run/route section, `docs/design/ai-scientist-chat-redesign/IMPLEMENTATION-REPORT.md` (create: built, gaps, evidence)

- [ ] **Step 1:** Run `rtk npm --prefix frontend run lint`, `test`, `build`; run backend `rtk uv run --directory backend pytest -q` (contract untouched, expect the same 210 passed, 2 skipped).
- [ ] **Step 2:** `/Users/parksurakiat/.claude/skills/impeccable/scripts/impeccable detect --json` over changed UI files; fix findings in one batch.
- [ ] **Step 3:** Start backend + frontend (`scripts/dev.sh`; never print `.env`). With `/claude-in-chrome` (fallback: built-in browser, say so) do one batched pass at desktop 1440 and mobile 390, light and dark, th and en: Landing→Chat; new chat; a research question end-to-end if the backend has a key (otherwise the stream is unavailable: state it, and verify the UI states using the app's real error path); off-topic question; citation→inspector; project/session create, switch, rename, delete; theme System follows OS; reload persistence; screenshots compared to images 01–19.
- [ ] **Step 4:** Fix everything found in one batch, one confirming round, stop.
- [ ] **Step 5:** Write the report and DESIGN.md, commit `docs: chat-first frontend report and design system`.
