---
id: report-details
title: Add the paper type, authors and closing statements
audience: []
book: user-guide
kind: how-to
group: report
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/research/ReportForm.tsx, src/lib/paperOutline.ts, src/lib/exportReport.ts]
---
## What is adding paper details

The {{ui:"Paper details"}} window in the document editor adds an outline, the authors, keywords, an abstract and the closing statements that journals and universities often require. Use it after you open the editor as in [[create-report]].

There are 5 paper types: {{ui:"Research (IMRaD)"}}, {{ui:"Computer science paper"}}, {{ui:"Review article"}}, {{ui:"Thai thesis, 5 chapters"}} and {{ui:"Research proposal"}}. {{ui:"Insert outline"}} adds only the headings that are not in the document yet, at the end. Text you already wrote is not changed or removed.

## How to add the paper type, authors and closing statements

{{steps:details-flow}}

## Good to know

- {{ui:"Authors"}}: one person per line, the full name and then the affiliation (optional), separated by a comma. Up to 20 people
- {{ui:"Keywords"}}: separated by commas, up to 8
- {{ui:"Abstract"}}: plain text, can be left empty. If you fill it in, it shows under the title
- {{ui:"Closing statements"}} has 4 items: Use of generative AI, Data and code availability, Ethics, and Conflicts of interest. They appear before the references, only the ones you tick
- The starting text of each item is a neutral draft with square brackets [ ] to fill in. You must change it to match the facts before you use it
- Author names can be personal data. Enter only what you want to appear in the document

## Problems and fixes

- Problem: “A closing statement still has its starting text or an unfilled [ ]. Check it before submitting”
  Fix: Open the {{ui:"Paper details"}} window, change the text of each ticked item to match the facts and fill in the [ ] parts
- Problem: “All headings are already there”
  Fix: Do nothing. The document already has the headings of this type

## Related questions

- [[create-report]]
- [[export-latex]]
