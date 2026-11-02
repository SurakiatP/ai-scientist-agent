---
id: review-plan
title: Review and edit the plan before searching
audience: []
book: user-guide
kind: how-to
group: ask
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/research/PlanCard.tsx, src/lib/prefs.ts]
---
## What is reviewing the plan

In {{ui:"Deep research"}} mode, after you send a question, the system proposes a {{ui:"Research plan (editable)"}}: a list of search terms, one per item, each with a short instruction about what to take from the papers found. It does not search until you click {{ui:"Start search"}}. Use this when you want the search to fit better, to drop a term you do not want, or to add a term of your own.

{{ui:"General search"}} and {{ui:"Answer research"}} modes do not wait at this step.

## How to review and edit the plan

{{steps:plan-flow}}

## Good to know

- Search terms must be in English only, up to 5 of them, and at least 1 must remain
- The {{ui:"Extra instructions (optional)"}} box says what you want from the papers found. You can leave it empty
- Remove a term with the trash can button at the end of its row
- Click {{ui:"Cancel"}} if you do not want to search
- If the results are thin, the system may add search terms by itself while it searches and say so with “Plan adjusted”
- If you do not want to review the plan every time, turn it off in [[plan-setting]]

## Problems and fixes

- Problem: “Search terms must be in English only”
  Fix: Change the term to English, then click {{ui:"Start search"}} again
- Problem: “Enter a search term”
  Fix: Enter a term in the empty box, or remove that row

## Related questions

- [[ask-a-question]]
- [[plan-setting]]
