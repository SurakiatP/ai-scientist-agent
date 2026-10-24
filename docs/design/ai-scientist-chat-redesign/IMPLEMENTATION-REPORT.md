# Implementation report: chat-first frontend (Task 8 verification)

Branch `feature/research-search`. Shipped system: Arctic Teal, see `DESIGN.md` and `frontend/src/theme.ts` (not the warm-paper system in the old DESIGN.md).

## What was verified
Real Google Chrome driven by playwright-core (claude-in-chrome tools were not available in this session), against the live backend with a real key.
Viewports 360, 390 (touch), 768, 1440; Thai and English; light, dark via emulated OS scheme; reduced motion. Screenshots: `/private/tmp/claude-501/-Users-parksurakiat-ai-scientist-dem/14b232e4-ac3f-44cc-9f1a-2f1230bf707c/scratchpad/`.

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
lint clean, tsc clean, vitest 135 passed (133 before), `next build` ok, backend pytest 210 passed 2 skipped. `next start` smoke: / and /chat 200, /ask and /saved 307 to /chat, unknown path 404 with the new page, title/theme-color/icon in HTML. No console.log, no eval, no gsap on the landing (gsap remains only in ProgressCard's stage pulse, which skips under reduced motion). `impeccable detect`: no findings.

## Remaining
- Keyboard pass covered sidebar, composer, inspector, settings; tab order inside the sheet on touch was not exercised with a real screen reader.
- Real hydration warnings: none seen in dev console across all passes.
- `next.config.ts` has no rewrites or headers; CORS lives in the backend (`CORS_ORIGINS`). No CSP header is set (no inline eval exists, so one can be added later).
- `tsconfig.tsbuildinfo` sits untracked-ignored in frontend/; harmless.
- Mobile 360/390 answer-with-table and sheet screenshots were taken; pixel-level comparison to the references was visual only.
