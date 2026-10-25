---
name: AI Scientist Research Workspace
description: A chat-first, bilingual research workspace; Arctic Teal on warm paper, derived from the shipped code (frontend/src/theme.ts).
colors:
  light:
    primary: "#0A6B6B"
    on-primary: "#FFFFFF"
    background: "#FAF8F4"
    paper: "#FFFFFF"
    shell: "#F1EDE6"
    text: "#0B1620"
    text-secondary: "#3F4F55"
    divider: "#E3DED6"
    evidence-verified: "#0A6B5A"
    evidence-unverified: "#8A5A00"
    evidence-unknown: "#5A6B70"
  dark:
    primary: "#69D8D1"
    on-primary: "#06201E"
    background: "#0D151B"
    paper: "#182B34"
    shell: "#0D151B"
    raised: "#203845"
    text: "#ECF4F4"
    text-secondary: "#9DB0B4"
    divider: "#2A4350"
    evidence-verified: "#5FD6B5"
    evidence-unverified: "#E5B44F"
    evidence-unknown: "#9DB0B4"
typography:
  fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
  body: { fontSize: "1rem", lineHeight: 1.8 }
  small: { fontSize: "0.8125rem", lineHeight: 1.6 }
  caption: { fontSize: "0.75rem" }
rounded: { base: 10px, composer: 16px, sheet-top: 16px }
---

# Design System: AI Scientist Research Workspace

Source of truth is `frontend/src/theme.ts` (MUI `createTheme`, `cssVariables` with `colorSchemeSelector: "data"`, `defaultMode="system"`). This file describes what shipped, not what was planned.

## Overview

A chat-first workspace: a left sidebar (new chat, search, projects, recent chats, settings), a centred thread (max 820px), and a right panel at >= 1200px that shows live run progress or the source being inspected. Below 1200px the inspector is a bottom sheet; below 900px the sidebar is a drawer. Warm off-white ground, white message sheets, one action colour (teal), no ambient decoration.

Thai is the default language (SSR renders Thai, the persisted language applies after hydration); English mirrors every string in `frontend/src/lib/strings.ts` (type-checked key parity), and has its own hand-written starter questions.

## Colors

- **Primary teal** `#0A6B6B` (light) / `#69D8D1` (dark): actions, links, citation pills, running dot, focus ring.
- **Surfaces**: `background` page, `paper` composer and cards, `shell` sidebar and quotes, `divider` hairlines.
- **Evidence** (meaning only, never decoration): verified teal-green, unverified amber, unknown grey. Status is always paired with text, never colour alone.
- Light and dark both checked for AA contrast in `theme.test.ts`. System mode follows the OS; the user can force light or dark in Settings.

## Typography

One family, Noto Sans Thai with Latin fallback. Body 1rem at line-height 1.8 (Thai needs air); answers cap at 68ch. Buttons are not uppercased.

## Layout

- Sidebar 280px (collapsible >= 900px, drawer below). Right aside 340px at >= 1200px.
- Touch targets are at least 44px (MUI button and icon-button minimums set in the theme).
- No horizontal page scroll at 360px; wide markdown tables scroll inside their own box with a visible hint.

## Elevation and shape

Flat: paper elevation 0, 1px hairlines. Radius 10px base, composer 16px, bottom sheet 16px top corners.

## Components

- **Composer**: multiline, Enter sends, Shift+Enter newline, IME-safe; stop button while its own run is active; disabled attach and a fixed "Deep Research" chip, both with stated reasons.
- **ProgressCard / ProgressPanel**: four stages (plan, search, write, check), real counts from the stream only.
- **Citation pill**: `[n]` in the answer opens the source inspector; Esc closes it and returns focus to the pill.
- **Reference list**: numbered rows with ID-check status (verified, unconfirmed, no ID, unknown), DOI/PMID chips, "details" action.
- **Report actions**: copy answer, download `.md`; PDF and DOCX shown disabled with a reason (the backend has no export).
- **Sessions and projects**: inline rename and delete confirm, kebab menus with return-focus, move session between projects.

## Motion

Authored moment: the landing trace line. Supporting motion (shared in `frontend/src/lib/motion.ts`, exponential ease-out `cubic-bezier(0.16, 1, 0.3, 1)`, 220-400ms, CSS under `no-preference` only): new chat turns rise in (turns present on load never animate) followed by an instant scroll (a smooth one would drop the follow mid-flight); the source inspector slides in on open (not on load); the opened reference row flashes once (400ms); the sidebar collapses by width over a fixed-width inner (animated only after a user toggle); the composer's send/stop is one button whose icon pops on swap; progress stage nodes ease colour, and the active node pulses (GSAP, one clock). `prefers-reduced-motion: reduce` removes all of it (global CSS rule in the theme; the pulse checks `matchMedia`).

## Do

- Keep every status paired with text. Keep state honest: no fake progress, no placeholder numbers.
- Use theme tokens (`primary.main`, `divider`, `surface.shell`), never hard-coded colours in components.

## Don't

- Don't add new accent colours or gradients. Don't hide copy behind opacity on first paint.
- Don't claim features the backend lacks (file attach, quick chat, PDF/DOCX, multi-turn context).
