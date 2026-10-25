# Surface brief: workspace (`/`, `/ask`, `/saved`)

> Development-only. Never copy this into page source or rendered output.
> Supersedes the visual world in `landing-surface.md`; the bilingual-abstract content model stays.

## Scope

- Modes: Operate for `/ask` and `/saved` (researcher completes a run, saves an answer); Persuade for `/` (first-time visit ends at `/ask`).
- Audience and proof: see `PRODUCT.md`. No logos, users, testimonials or numbers.
- Constraints: MUI + `frontend/src/theme.ts`, Noto Sans Thai, offline, 360px, WCAG AA, reduced motion.

## Direction (pinned by the user)

Reference world: `lfnovo/open-notebook` ("Quiet Green"). The user asked for that web-app feel with differences, so this is a replacement world, not a polish of the old blue placeholder.

THESIS: A researcher's field notebook for evidence. The app shell and run ledger are always visible, so the answer arrives inside a working research desk, not on a marketing card. The category's chat-only white page is refused.

OWN-WORLD: Warm paper ground `#F4F4F0`, surface `#FDFDFA`, sidebar `#ECECE5`, hairline `#E2E2D9`, ink `#23252A`. Fern `#2E6B4F` acts, teal `#0E7268` speaks for evidence and AI, gold `#A97B12` marks notes, clay `#B0451F` only warns. Squared 6px geometry, zero-elevation hairline surfaces, one family (Noto Sans Thai), tabular numerals for counts. No gradients, glass, emoji icons or decorative shadows.

STORY: The researcher sees recent runs before asking, watches the plan and searches stream into a run ledger, reads the cited answer on a note sheet, and sees each reference's existence check as the closing act.

FIRST VIEWPORT (`/ask`): fixed sidebar with brand mark, workspace nav and recent runs; main column holds the heading, one large composer sheet with the ask action, and example prompts. No eyebrow labels. The answer replaces the composer's lower half rather than opening a modal.

FORM: Pinned reference + own mark (bracketed citation square) and evidence ledger; the existing motion2code Figure 1 stays the landing's signature motion. Run trace uses one GSAP clock, deterministic, static under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Finish record

- Review 1 (pre-fix): `disposition: fix`; eight material findings — run-completion handoff, mobile table affordance, glyph status icons, reading measure, count copy, 44px targets, mobile reference summary, run-trace rail overhang.
- Fixes applied; captures recaptured over `.impeccable/review/{desktop,mobile,desktop-home,mobile-home,desktop-saved,mobile-saved}.png` on 24 Oct 2026.
- Review 2 (verdict pass): `disposition: ship`; all eight resolved, no regressions, contract promises kept.
- Documentation: root `DESIGN.md` (tokens extracted from `frontend/src/theme.ts`) and `.impeccable/design.json` sidecar.
- Shipping rasters: none. Figure 1, the brand mark and all icons are inline SVG/code; the review captures are working evidence, not shipped assets.
