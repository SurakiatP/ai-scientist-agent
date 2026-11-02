---
id: export-latex
title: Download an article as LaTeX
audience: []
book: user-guide
kind: how-to
group: report
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/research/ReportForm.tsx, src/lib/exportReport.ts]
---
## What is downloading as LaTeX

If you must send an article to a journal or conference that uses LaTeX, choose a style in the {{ui:"LaTeX paper (.tex)"}} group of the document editor. The system builds a .tex file for the chosen template: {{ui:"General article"}}, {{ui:"IEEE Conference"}}, {{ui:"Elsevier (elsarticle)"}} or {{ui:"Springer LNCS"}}. Use it after you open the editor as in [[create-report]].

When you choose a LaTeX template, the buttons that save as PDF and Word turn into one {{ui:"Download .tex"}} button.

## How to download an article as LaTeX

{{steps:latex-flow}}

## Good to know

- The .tex file compiles with XeLaTeX as is. For example, upload it to Overleaf and set the compiler to XeLaTeX
- Add the authors in the file yourself before you submit
- The font follows the template. Thai uses the Laksaman font, so you cannot choose a font
- The .tex file downloads straight to your computer and is not kept in {{ui:"My files"}}
- Set the paper type, authors and closing statements before you download in [[report-details]]

## Problems and fixes

- Problem: “Could not create the file. Try again”
  Fix: Click {{ui:"Download .tex"}} again
- Problem: “Could not reach the server. Check your connection and try again”
  Fix: Check your internet connection and try again
- Problem: “A title is required”
  Fix: Enter a title at the top of the page

## Related questions

- [[create-report]]
- [[report-details]]
