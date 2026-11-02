---
name: AI Scientist Research Workspace
description: A chat-first, bilingual research workspace; Ink Navy on blue-grey paper (a document desk), derived from the shipped code (frontend/src/theme.ts).
colors:
  light:
    primary: "#1C4E8F"
    primary-dark: "#143B6E"
    on-primary: "#FFFFFF"
    background: "#E8EDF4"
    paper: "#FFFFFF"
    shell: "#F4F6FA"
    text: "#0E1A2C"
    text-secondary: "#475670"
    divider: "#D3DCE8"
    ai: "#5B4CC4"
    ai-soft: "#E3E1F7"
    evidence-verified: "#0A6B5A"
    evidence-unverified: "#8A5A00"
    evidence-unknown: "#566579"
  dark:
    primary: "#8DB5F2"
    on-primary: "#0A1B33"
    background: "#0B1322"
    paper: "#121C2E"
    shell: "#0E1727"
    raised: "#1A2639"
    text: "#E9EEF7"
    text-secondary: "#9DABC0"
    divider: "#24324A"
    ai: "#B3A9F5"
    ai-soft: "#2A2650"
    evidence-verified: "#5FD6B5"
    evidence-unverified: "#E5B44F"
    evidence-unknown: "#9DABC0"
typography:
  fontFamily: '"Noto Sans Thai Looped", "Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
  display: { fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }
  body: { fontSize: "1rem", lineHeight: 1.8 }
  small: { fontSize: "0.8125rem", lineHeight: 1.6 }
  caption: { fontSize: "0.75rem" }
rounded: { base: 10px, row: 12px, card: 24px, home-composer: 28px, header: 18px, sheet-top: 16px, surface: 16px }
---

# Design System: AI Scientist Research Workspace

Source of truth is `frontend/src/theme.ts` (MUI `createTheme`, `cssVariables` with `colorSchemeSelector: "data"`, `defaultMode="system"`). This file describes what shipped, not what was planned.

## Overview

A chat-first workspace: a left sidebar (new chat, search, projects, recent chats, settings), a centred thread (max 820px), and a right panel at >= 1200px that shows live run progress or the source being inspected. Below 1200px the inspector is a bottom sheet; below 900px the sidebar is a drawer. Cool blue-grey paper with one soft wash of light from the top right, white sheets lifted by long, low navy-tinted shadows, one action colour (navy), and a violet mark reserved for what the AI did (agent chips, citation numbers, the "data leaves here" cell).

Thai is the default language (SSR renders Thai, the persisted language applies after hydration); English mirrors every string in `frontend/src/lib/strings.ts` (type-checked key parity), and has its own hand-written starter questions.

## Colors

- **Primary navy** `#1C4E8F` (light) / `#8DB5F2` (dark): actions, links, citation pills, running dot, focus ring, the current page row in the sidebar (filled).
- **AI violet** `surface.ai` / `surface.aiSoft`: only for marks of the agent's own work; never for actions.
- **Surfaces**: `background` page, `paper` composer and cards, `shell` sidebar and quotes, `divider` hairlines.
- **Evidence** (meaning only, never decoration): verified teal-green, unverified amber, unknown grey. Status is always paired with text, never colour alone.
- Light and dark both checked for AA contrast in `theme.test.ts`. System mode follows the OS; the user can force light or dark in Settings.

## Typography

One family, Noto Sans Thai Looped (the formal, document-like Thai voice) with Latin fallback. Display headings 700 with slight negative tracking; uppercase letterspaced captions only for figure and section labels. Body 1rem at line-height 1.8 (Thai needs air); answers cap at 68ch. Buttons are not uppercased.

## Layout

- Sidebar 280px (collapsible >= 900px, drawer below). Right aside 340px at >= 1200px.
- Touch targets are at least 44px (MUI button and icon-button minimums set in the theme).
- No horizontal page scroll at 360px; wide markdown tables scroll inside their own box with a visible hint.

## Elevation and shape

Paper elevation 0 and 1px hairlines inside the app; floating surfaces (landing header, cards, the home composer) use the shared `lift` shadow (a long navy-tinted blur plus a tight contact shadow). Radius 10px base, sidebar rows 12px, page cards and dialogs 24px, data surfaces, list rows, menus and site cards 16px, home composer 28px, landing header 18px. Items inside a 16px menu with 6px padding use 10px (outer radius minus padding). Radii on custom surfaces are written in px (MUI multiplies bare numbers by the base radius).

## Landing

A floating header bar; hero with a three-line heading (last line navy) beside an answer sheet figure built from markup; a strip of numbers read from the code (sources, fields, languages, export formats); then numbered sections ("01 //" with a hairline) for the statement, capabilities (one lead card plus a ruled list of the other tools), how it works, where data goes (a 2x2 ledger, the external hop tinted violet), and FAQ; a closing card with the call to action. Section numbers and labels are the user's explicit reference, not a default.

## Components

- **Home**: a time-of-day greeting with the mark, the question beneath it, and the large composer (text on top, controls below, a real example as placeholder; Tab in the empty box takes the example).
- **Composer**: multiline, Enter sends, Shift+Enter newline, IME-safe; stop button while its own run is active; disabled attach and a fixed "Deep Research" chip, both with stated reasons.
- **ProgressCard / ProgressPanel**: four stages (plan, search, write, check), real counts from the stream only.
- **Citation pill**: `[n]` in the answer opens the source inspector; Esc closes it and returns focus to the pill.
- **Reference list**: numbered rows with ID-check status (verified, unconfirmed, no ID, unknown), DOI/PMID chips, "details" action.
- **Report actions**: copy answer, download `.md`; PDF and DOCX export are available (the backend renders them).
- **Sessions and projects**: inline rename and delete confirm, kebab menus with return-focus, move session between projects.

## Motion

Authored moment: the landing answer sheet writes itself (lines scale in, citations land, notes slide on), transform and blur only. The home composer has a second, smaller moment on each mount (new session or home): a thin light in the theme colours (pale sky tail, navy, AI violet at the head; a 1px line over a faint 3px glow) starts at the bottom centre, runs up both sides, meets at the top and fades, about 1.7s, once. Supporting motion uses one token scale (`frontend/src/lib/motion.ts`, mirrored as `:root` CSS vars such as `--duration-quick` and `--ease-smooth-out`; CSS under `no-preference` only). One curve, smooth-out `cubic-bezier(0.22,1,0.36,1)`; durations 150 / 250 / 400ms; close is always faster than open. Buttons press to 0.98. Dialog opens from .96, Menu/Popover from .97 and closes to .99, Tooltip .98 on ease-out; toast opens 350ms, closes 250ms. New chat turns rise in (turns present on load never animate) followed by an instant scroll (a smooth one would drop the follow mid-flight); the source inspector slides in on open (not on load); the opened reference row flashes once; the sidebar collapses by width over a fixed-width inner (animated only after a user toggle); the composer's send/stop is one button whose icon pops on swap; progress stage nodes ease colour, and the active node pulses (GSAP, one clock). `prefers-reduced-motion: reduce` removes all of it (global CSS rule in the theme; the pulse checks `matchMedia`).

## Do

- Keep every status paired with text. Keep state honest: no fake progress, no placeholder numbers.
- Use theme tokens (`primary.main`, `divider`, `surface.shell`), never hard-coded colours in components.

## Don't

- Don't add accent colours beyond navy and the AI violet. Gradients only as the one soft light wash on the page. Don't hide copy behind opacity on first paint.
- Don't claim features the backend lacks (file attach, quick chat, multi-turn context).
