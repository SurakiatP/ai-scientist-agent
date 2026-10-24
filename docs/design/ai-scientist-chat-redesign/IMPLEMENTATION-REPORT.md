# Implementation report: chat-first frontend (Task 8 verification)

Branch `feature/research-search`. Shipped system: Arctic Teal, see `DESIGN.md` and `frontend/src/theme.ts` (not the warm-paper system in the old DESIGN.md).

## What was verified
Real Google Chrome driven by playwright-core (claude-in-chrome tools were not available in this session), against the live backend with a real key.
Viewports 360, 390 (touch), 768, 1440; Thai and English; light, dark via emulated OS scheme; reduced motion. Four curated screenshots are in `verification/` (answer 1440, inspector panel 1440, inspector sheet 390, error and retry 1440); the rest were not retained.

| Area | Result |
|---|---|
| Landing and /chat at 360/390/768/1440 | no horizontal scroll, no console errors |
| Research run ("RAG vs fine-tuning for medical QA") | streamed plan, search, 12 sources, final answer in ~100 s; right ProgressPanel counts live; 12 refs all ID-verified; copy (3281 chars) and .md download work |
| Citation pill, inspector | panel at >= 1200, bottom sheet below; Esc closes; focus return was broken (fixed) |
| Off-topic question | refused with reason and starter chips |
| Stop mid-run | status "stopped" with retry |
| Error path (requests aborted) | "cannot reach server" + Retry; retry restarts the run |
| Follow-up | "Ask follow-up" focuses composer; same session |
| Projects and sessions | create, rename, delete, move, search, delete a running session (stops the run, composer usable) all work |
| Settings | language en/th persists across reload and sets html lang; theme System follows OS; backend health shown |
| Mid-run reload | showed "cannot reach server" instead of "interrupted" (fixed) |
| Keyboard | tab order sensible; focus rings missing on MUI buttons (fixed) |

Reference images 01-19 were compared for layout and feel only (sidebar, centred thread, right progress panel, sheet inspector, refs list). PDF/DOCX export (analysis/report images) is not built: the backend has no export, so the buttons are disabled with a stated reason. Quick-chat mode and file attach likewise: disabled with a reason. Follow-ups do not send earlier turns (stated in the UI).

## What broke and the fix
1. Esc in the inspector left focus on body (Markdown re-render replaced the pill node). `lib/inspector.ts` now refocuses after the render and falls back to the pill with the same href. Tests added. (e05ea66)
2. Reload mid-run: the aborted fetch overwrote the stored "running" turn with a network error, so "interrupted" never showed. `lib/run.ts` ignores patches after `pagehide`. Test added. (6a9f504)
3. MUI ButtonBase sets `outline: 0`, hiding the global focus ring: added a `MuiButtonBase` focus-visible rule. Wide answer tables squeezed columns to one letter (`overflow-wrap: anywhere`): now `break-word` with a column minimum. Removed the unused legacy `palette` export. (e25748b)
4. Hardening: `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` (th/en); title "AI Scientist"; theme-color light/dark; SVG icon replacing the default Next favicon; 31 unused strings deleted; README (root and frontend) document routes, `NEXT_PUBLIC_API_BASE`, CORS. (ab6e039)
5. DESIGN.md rewritten from the shipped theme. (b13c9a9)

## Checks
lint clean, tsc clean, vitest 135 passed (133 before), `next build` ok, backend pytest 210 passed 2 skipped. `next start` smoke: / and /chat 200, /ask and /saved 307 to /chat, unknown path 404 with the new page, title/theme-color/icon in HTML. No console.log, no eval, no gsap on the landing (gsap remains only in ProgressCard's stage pulse, which skips under reduced motion). `impeccable detect --json` over `frontend/src/app`, `components`, `lib/strings.ts` printed `[]` (no findings; the detector may not parse every MUI `sx` pattern, so treat as weak evidence).

## Fix round 1
- Viewport theme-color now reads shared `BG` constants in `lib/config.ts`, which `theme.ts` also uses (one source for the two backgrounds).
- `pageshow` with `persisted` (bfcache restore) and no live run marks any stored "running" turn "interrupted"; test resets `pageshow` in `finally`.
- Focus rings checked in real Chrome: sidebar session rows and the kebab menu. Rows are not clipped; the menu item ring was cut by the menu paper, so `MuiMenuItem` focus uses `outlineOffset: -2`.
- A long unbroken DOI/URL inside an answer table: no horizontal page scroll at 360 or 1440 (table scrolls in its own box).
- Browsers request `/favicon.ico` regardless of the `<link>`; it returned 404. Added a 32px `app/favicon.ico` rendered from `icon.svg`.
- Verified in a real browser: not-found page (404 shows th copy and a link to chat). Verified by build only: `error.tsx` and `global-error.tsx` (no way to trigger a render error without editing code).

## Not built / gaps (all intentional or backend-limited)
- Sessions and projects live only in this browser (localStorage). No server persistence, no sync across devices, cleared with site data.
- The research plan is shown read-only ("proposed by Hermes, cannot be edited"); no plan editing or approval step.
- No file upload (attach is disabled with a reason).
- No PDF or DOCX export (buttons disabled with a reason; only Markdown copy and download).
- No analysis or report artifacts (images in the reference set showing them are not implemented).
- No quick-chat mode; only Deep Research.
- Follow-ups do not send earlier turns; each question is answered on its own (stated in the UI).

## Not tested
- Safari, Firefox, real screen readers (VoiceOver, NVDA). Only Chrome via playwright-core.
- Touch behaviour beyond tap emulation at 390px.
- No CSP header is set (no inline eval exists, so one could be added).
- Reference images 01-19 compared by eye for layout and feel, not pixel-diffed.
- Real hydration warnings: none seen in dev or production console across the passes.
- The motion commits (25a2830, a02c897) landed after this verification; only lint, tsc, vitest and build were re-run on top of them.

Task 9 fix round 1: instant follow-scroll, flash 400ms, entrances only for user-driven change (aside slide removed; inspector slide, composer pop, search rows, first turn after empty state), SSR-safe `prefersReduced`, Send double-click guard, reduced motion zeroes delays; tests guard the `seen` logic and follow/release.
