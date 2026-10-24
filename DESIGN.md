---
name: AI Scientist Research Workspace
description: A bilingual evidence notebook for cited research answers.
colors:
  fern: "#2E6B4F"
  fern-deep: "#245740"
  fern-wash: "#E3EDE4"
  on-primary: "#F2F8F3"
  paper: "#F4F4F0"
  sheet: "#FDFDFA"
  sheet-raised: "#FFFFFF"
  rail: "#ECECE5"
  rail-hover: "#E4E4DC"
  rule: "#E2E2D9"
  ink: "#23252A"
  ink-muted: "#575B61"
  teal-evidence: "#0E7268"
  teal-wash: "#DDECE8"
  gold-note: "#A97B12"
  gold-wash: "#F3EAD3"
  clay-warning: "#B0451F"
  clay-wash: "#F5E4DB"
  error: "#A63B26"
  row-stripe: "#FAFAF6"
typography:
  display:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "clamp(1.875rem, 1.1rem + 3vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.28
    letterSpacing: "-0.02em"
  display-en:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "clamp(1.125rem, 1rem + 0.6vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.4
  headline:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.8
  abstract:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.5
  micro:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.04em"
  button:
    fontFamily: '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.75
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  page-xs: "20px"
  page-sm: "32px"
  page-lg: "40px"
components:
  button-primary:
    backgroundColor: "{colors.fern}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-primary-large:
    backgroundColor: "{colors.fern}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "46px"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.fern}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button}"
    rounded: "0"
    height: "44px"
  chip-status:
    backgroundColor: "{colors.teal-wash}"
    textColor: "{colors.teal-evidence}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "0 8px"
    height: "24px"
  card-sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "20px 24px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "44px"
---

# Design System: AI Scientist Research Workspace

## Overview

**Creative North Star: "The Evidence Field Notebook"**

The interface is a researcher's working notebook, not a chat product or a marketing page. Warm paper is the desk, a narrow rail holds the workspace and recent runs, and every answer is a sheet placed on that desk. The work stays visible: the plan, the searches and the count of papers found are a ledger that fills in as the runner moves.

The system is quiet by construction. One family, one action colour, hairline rules and flat surfaces; colour is reserved for meaning. Fern means the researcher can act. Teal means evidence exists and has been checked. Gold marks a note. Clay appears only when the tool cannot confirm something. Nothing decorates for its own sake.

Thai is the native voice; English is its twin only where the page makes a statement (the landing abstract, the brand, the primary call to action). Operational screens stay in one language so the researcher never reads everything twice.

**Key Characteristics:**
- Warm paper ground with near-white sheets and a slightly darker rail.
- Flat, zero-elevation surfaces separated by 1px hairline rules.
- Squared 6px geometry; no pill-shaped containers except the spinner.
- One typeface at a compact, academic scale; 68ch reading measure for answers.
- Evidence-coloured status: teal verified, clay unconfirmed, gold noted.
- Motion appears once (the landing run figure and the live run trace), never as ambient decoration.

## Colors

A warm neutral paper field carrying three functional accents: fern, evidence teal, warning clay, with gold for notes.

### Primary
- **Fern** (#2E6B4F): the action colour. Primary buttons, links, progress fill, active nav dot, citation affordance and focus rings. **Fern Deep** (#245740) is its pressed/hover partner; **Fern Wash** (#E3EDE4) is a fill tint, never text on paper.
- **On Fern** (#F2F8F3): text and icons on fern fills.

### Secondary
- **Evidence Teal** (#0E7268): spoken for verification. Verified reference links, inline citation pills, the reference number plate when a check passes, and the brand check. **Teal Wash** (#DDECE8) backs those marks.
- **Note Gold** (#A97B12): a note, a saved item, a synthetic-data flag. **Gold Wash** (#F3EAD3) backs it.
- **Warning Clay** (#B0451F): only for an unverified or unknown reference, and the matching wash (#F5E4DB). **Error** (#A63B26) is reserved for failed requests and validation, never for evidence status.

### Neutral
- **Paper** (#F4F4F0): page ground and input wells.
- **Sheet** (#FDFDFA): the main surface for composer, answer and ledger sheets.
- **Sheet Raised** (#FFFFFF): small raised elements such as outlined chips; not a page ground.
- **Rail** (#ECECE5): the fixed sidebar; **Rail Hover** (#E4E4DC) is its only hover tone.
- **Rule** (#E2E2D9): every 1px border and divider.
- **Ink** (#23252A) / **Muted Ink** (#575B61): primary and secondary text.
- **Row Stripe** (#FAFAF6): even table rows; the only zebra treatment.

**The One Green Voice Rule.** Fern marks an action or the current position. It is not a decorative accent; if it is not clickable or live, it stays neutral.

**The Evidence Colour Rule.** Teal = checked, gold = note, clay = unconfirmed. Never use clay for a generic error or teal for a generic success; the palette is a claim about evidence.

**The Warm Paper Rule.** The page is never pure white. White appears only as a small raised element on top of paper or sheet.

## Typography

**Display Font:** Noto Sans Thai (self-hosted via next/font) with Noto Sans and the system sans stack.
**Body Font:** the same family at 1rem.
**Label/Mono Font:** the same family; code blocks use the platform monospace stack.

**Character:** one humanist sans carries Thai and Latin without a pairing; the page reads like a journal offprint rather than an app dashboard. Weight and measure do the hierarchy work, not colour or size jumps.

### Hierarchy
- **Display** (700, clamp 1.875–3.25rem, 1.28, -0.02em): landing Thai headline only. Its English twin sits directly under it (400, clamp 1.125–1.5rem, 1.4, muted).
- **Headline** (700, 2rem / 1.75rem below md, 1.25, -0.02em): page titles on `/ask` and `/saved`.
- **Title** (700, 0.9375rem, 1.5): answer and reference section headers; 1.0625rem is the ceiling for prose h3.
- **Body** (400, 1rem, 1.8): answers and running text. Long prose is capped at 68ch; the page intro is capped at 62ch.
- **Abstract** (400, 0.9375rem, 1.75): the English twin of Thai statements and secondary explanatory copy.
- **Label** (600, 0.75rem, 1.5): counts, metadata, hints. Counts use tabular numerals.
- **Micro** (700, 0.6875rem, 1.3, +0.04em): section labels in the rail, stage labels, table-scroll hint and small status notes.

**The 68ch Rule.** A paragraph, list or blockquote never runs past 68ch, however wide the sheet. Tables may exceed it only inside their own horizontal scroller.

**The Pair-Once Rule.** Thai and English are set as a pair only for statements on the landing page and the bilingual CTA. Workspace controls, error messages and metadata appear once, in the active language.

## Layout

The app shell is a fixed 272px rail from `md` (900px) up; below that it becomes a 64px top bar opening a 288px drawer. The rail carries the brand, workspace navigation, the four most recent runs and a privacy footer. Content starts after it and never overlaps.

Workspace pages (`/ask`, `/saved`) center a 900px column with 20px page padding at 360px, 32px at `sm`, 40px at `lg`. The landing widens to 1080px. Section rhythm is 12–32px, with 24–48px between major blocks; an 8px base with 4px half-steps covers component internals.

`/ask` is a vertical stack: heading, one composer sheet, the live run ledger, then the answer sheet and its reference footer. `/saved` is a tab strip over a stack of note sheets. The landing is a bilingual abstract: one column below `md`, a Thai/English pair of columns above it, Figure 1 full-width, then a 280px method column beside its notes.

**The Working Desk Rule.** The rail and the run ledger stay visible while the researcher works; the answer is a sheet inside the desk, never a modal or a separate results page.

## Elevation & Depth

There are no shadows. Depth is tonal and linear: paper ground, sheet surface, rail, and a 1px rule at every boundary. Hover and active states shift background tone by one step; focus draws a 2px fern outline with a 2px offset (or a 3px fern-wash ring around the composer). The single exception is a transient `0 0 0 3px #E3EDE4` focus halo on the composer.

A dark token set exists in `src/theme.ts` but is not wired to a toggle; it is not part of the shipped surface.

**The Flat-by-Default Rule.** If a surface needs separation, add a hairline or move it to the next tonal step. Do not add a drop shadow.

## Shapes

Default radius is 6px: sheets, buttons, inputs, nav rows, notice boxes, code blocks. Chips use 4px, accordions 8px, dialogs 10px. Status plates and icon wells are 30px squares with 6px corners. Run-trace nodes are 10px squares with 2px corners; the rail is a 2px line inset 12.5% per side so it starts and ends at node centres. Inline citation pills are 19px-high rounded rectangles.

The brand mark is a 28px citation bracket holding a gold note square and a teal check. It is the only ornament in the shell. Circular forms are limited to the progress spinner and avatars; nothing else is fully rounded.

**The Squared-Paper Rule.** Corners are cut paper, not pills. When in doubt, 6px.

## Components

### Buttons
- **Shape:** 6px radius, 44px minimum height (46px for large), no elevation, 600 weight, 16px inline padding (20px large).
- **Primary:** fern fill, on-fern text. One per view; the ask action is the canonical primary.
- **Outlined / ghost:** transparent fill, fern text, rule border; used for "ask new" and empty-state actions. Stop is outlined with ink text and a stop icon.
- **Hover / Focus:** MUI tonal hover; 2px fern focus-visible outline at 2px offset. Icon buttons are 44×44 with a 6px radius.
- **Bilingual CTA:** the landing button stacks Thai (1rem, 700) over English (0.75rem, 500, 85% opacity) inside one 44px target.

### Chips
- **Style:** 24px high, 4px radius, 0.75rem/500. Status chips use a wash fill with matching text and a 15px icon; identifier chips are outlined sheet-raised with a rule border.
- **Semantics:** verified = teal wash + check; unconfirmed/unknown = clay wash + warning or info icon; sample question = auto-height sheet chip with wrapping label, 6px radius.
- **State:** chips are read-only evidence markers, not filters; the sample chips are the only clickable ones.

### Cards / Containers
- **Corner Style:** 6px sheets, 8px accordions.
- **Background:** sheet on paper; answer header and reference footer sit on paper to separate the three bands.
- **Shadow Strategy:** none; see Elevation.
- **Border:** 1px rule on every sheet. The answer sheet is one border containing three tonal bands.
- **Internal Padding:** 16–20px on mobile, 24px at `md`; reference rows 12px block padding.

### Inputs / Fields
- **Style:** the composer is a sheet, not a bordered input. The text field is borderless and transparent at 1.0625rem/1.7; the sheet provides the boundary.
- **Focus:** the sheet border turns fern and gains a 3px fern-wash ring; the caret is fern.
- **Counter / hint:** 0.75rem muted, tabular numerals; the hint hides below `sm`. Validation uses error ink, never clay.

### Navigation
- **Rail:** 272px, rail background, brand block 64px high with a hairline under it. Section labels are micro caps; nav rows are 44px with a 5px fern active dot, 18px icon, 0.875rem label and a sheet-filled active state.
- **Recents:** two-line clamped question at 0.8125rem with a micro date; hover is rail-hover.
- **Mobile:** 56px main offset for the fixed 64px bar; a 288px drawer with a visible close control and 44px targets.

### Run Trace (signature)
Four stages on a 2px rail inset 12.5%; passed and active nodes are fern squares, upcoming nodes are sheet squares with a rule border. The active node pulses 1 → 1.4 over 0.7s with a sine in-out yoyo; the fill width moves at 320ms on `cubic-bezier(0.22, 1, 0.36, 1)`. Under `prefers-reduced-motion` the trace is static. Stage labels are micro type; the live status is announced separately to screen readers.

### Evidence Citation (signature)
Inline citations are fern-wash pills, 19px high, 0.6875rem/700, linking to `#ref-N`; the target row highlights with a teal border. The reference list numbers each paper in a 30px square plate, teal when verified, and pairs the status chip with a plain-language note. Unverified references are never hidden.

## Do's and Don'ts

### Do:
- **Do** reserve fern for actions and current position, and keep one fern-filled primary action per view.
- **Do** keep every interactive target at least 44px and every focus state visible with the 2px fern outline.
- **Do** cap prose at 68ch and place wide tables in their own horizontal scroller with a visible scroll hint on mobile.
- **Do** use tabular numerals for counts, dates, reference numbers and progress.
- **Do** keep the evidence semantics: teal for checked, gold for noted, clay for unconfirmed, error ink for failures.
- **Do** use Noto Sans Thai for Thai and Latin, and set paired Thai/English only on statement surfaces.
- **Do** label synthetic demonstration data and state the limits of the existence check.

### Don't:
- **Don't** use gradients, glass, backdrop blur, decorative shadows or elevation.
- **Don't** use emoji or Unicode glyphs as icons; use the icon set (MUI rounded icons).
- **Don't** use pill-shaped cards, fully round containers or ornamental corners.
- **Don't** add eyebrow/kicker labels, coloured left borders, icon-card grids or feature-card carousels.
- **Don't** invent logos, users, testimonials, accuracy figures or usage statistics.
- **Don't** use clay or teal as generic success/error decoration; those hues carry evidence meaning.
- **Don't** let a table widen the page; scroll the table, not the document.
