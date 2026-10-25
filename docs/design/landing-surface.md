# Surface brief: landing page (`frontend/src/app/page.tsx`)

> Impeccable's `surface-brief write` stores briefs at `.impeccable/surfaces/frontend-src-app-page-tsx.md` (repo root). The task asked for design context under `docs/design/`, so this brief lives here instead. Development-only: never copy any of this into page source or rendered output.

## Scope

- Mode: Persuade. Landing page for a working tool; the action is "ask a research question" (`/ask`).
- Audience: researchers on teams like those at NECTEC (see `PRODUCT.md`). They read Thai and English, and they read papers every day.
- Proof on hand: none beyond the product's own mechanism. No logos, users, testimonials, numbers.
- Constraints: inherits the app's established world (MUI, `src/theme.ts` placeholder tokens, Noto Sans Thai). No new palette, typeface or component vocabulary. Offline: no external requests.

## Structure roll

`concept-seed --scope surface --mode persuade`, seed key `2c54b849`, dealt indices 5, 2, 4 (5 leads).

Implementer's grounded structures, ordered by resonance:
1. Paper-shaped page: title, abstract, Figure 1, method, limitations.
2. The run as the page: one research run unfolds top to bottom.
3. A working ask box as the first viewport.
4. Footnoted page: each claim carries a note on how it is checked.
5. **Bilingual abstract (lead):** every statement set in Thai with its English twin, the way Thai theses and journals print บทคัดย่อ and Abstract.
6. Split hero with product animation (category default).
7. Horizontal pipeline diagram.

No decision page was served (implementer ran as a subagent without a way to reach the user). The dealt lead was taken, with dealt 2 (the run) shaping Figure 1 and dealt 4 (notes on how claims are checked) shaping the Limitations section.

Challengers (catalog worlds, form only; surface scope forbids new identity):
- Drum-machine step row: **competitive** on clarity. Raise kept: "one unbroken row with a chase light that always says where *now* is" becomes Figure 1's active-stage bar.
- Fight poster (versus halves): declined; hype tone. Raise kept: comparison reads as two halves (the sample answer compares two methods).
- Ink basin, gravity-rain garden, colour-chord canopy, calendar pad: declined on audience identification and clarity; nothing transferable beyond "one material owns the page".

## Direction contract

THESIS: The page is a bilingual research abstract whose Figure 1 is the product running. The category's split hero with feature cards is refused; claims sit in Thai with an English twin, like a Thai journal's บทคัดย่อ / Abstract.

OWN-WORLD: App tokens only: `background` ground, `surface` panel for Figure 1, hairline `divider` rules between sections, `primary` reserved for the live "now" bar, the CTA and links, `success` for checked references. Noto Sans Thai at all sizes; Thai line in `text.primary`, English twin in `text.secondary`. No cards, gradients, icons tiles or eyebrows.

STORY: Visitor sees what it does (question, planned searches, papers arriving, cited answer), believes it because the run is shown and the limits of the reference check are stated plainly, then clicks ถามคำถามวิจัย / Ask a research question.

FIRST VIEWPORT: Thai h1 at display size with its English twin directly under it, one-line abstract pair, primary CTA, then Figure 1 starting inside the viewport at full content width with its four stages in a row (stacked on phones).

FORM: Bilingual abstract (structure 5 of 7), seed key `2c54b849`.

FINISH: unreviewed undocumented unfinished; build ends finish review, verdict, DESIGN.md, shipping raster carrying provenance
