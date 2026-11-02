---
id: create-report
title: Create a report document from an answer
audience: []
book: user-guide
kind: how-to
group: report
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/research/ReportPanel.tsx, src/components/research/ReportForm.tsx, src/components/research/ReportSheet.tsx, src/lib/exportReport.ts]
---
## What is creating a report document

From a finished answer, click {{ui:"Open report"}} to open the {{ui:"Research report draft"}} in the right panel. The panel has {{ui:"Contents"}} to jump to a heading, {{ui:"Share & export"}} to export at once as PDF, Word or Markdown or to copy the text, and {{ui:"Edit & create document"}}, which opens a full-screen editor.

Use the full-screen editor when you want to change the text, set the title, and choose the language, style and font before saving. A PDF or Word file you save is kept in {{ui:"My files"}}.

## How to create a report document from an answer

{{steps:report-flow}}

{{clip:report-video}}

## Good to know

- Click {{ui:"Preview PDF"}} to see the real PDF you will get in the chosen style. The Word file has the same content, but its look may differ from the preview
- When you change {{ui:"Document language"}}, the system translates the content. If the translation fails, the original language and content stay
- {{ui:"Document style"}} offers {{ui:"Standard"}} and {{ui:"Official"}}. The font is chosen in the same row
- The {{ui:"Include references"}} switch adds the references built from the sources at the end of the document
- If you close the editor without saving, the system asks {{ui:"Discard your edits?"}} because the edited document would be lost
- Set the authors, the paper type and the closing statements in [[report-details]]. For a journal file, see [[export-latex]]
- The draft from the system is a starting point. You must check the content and the sources yourself. See [[limits-and-safety]]

## Problems and fixes

- Problem: “A title is required”
  Fix: Enter a title at the top of the page
- Problem: “A heading is longer than 200 characters. Shorten it before creating the file”
  Fix: Shorten the heading that is too long
- Problem: “A table has more than 12 columns or a cell over 500 characters. Shrink the table before making the file.”
  Fix: Reduce the columns or shorten the text in the table cells
- Problem: “Over the limit the server accepts. Remove sections or paragraphs before creating the file”
  Fix: Remove or merge sections and paragraphs
- Problem: “The document service is unavailable. Try again later; your form is kept”
  Fix: Wait a moment, then click the save button again
- Problem: “Could not save the file. Nothing was added to My files. Try again; your form is kept”
  Fix: Click the save button again
- Problem: “The preview could not be made. Check the title, sections and paragraphs”
  Fix: Fix the title, headings or paragraphs the system points out

## Related questions

- [[report-details]]
- [[export-latex]]
- [[manage-files]]
