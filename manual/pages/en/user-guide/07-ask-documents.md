---
id: ask-documents
title: Ask about PDF documents
audience: []
book: user-guide
kind: how-to
group: files
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/chat/Composer.tsx, src/components/files/FilesPage.tsx, src/components/chat/AgentMessage.tsx]
---
## What is asking about PDF documents

You can attach 1 to 5 of your own PDF files and ask about what is in them. When you attach a PDF, the system switches to {{ui:"From documents"}} mode and answers only from the attached documents. It does not search other research and does not use the research field. The answer has numbers such as [1] and [2] at the end of sentences. Click a number to see the page and the text in the document that match the answer.

Use it to summarise a paper, ask about its methods or limits, or read work that is not in a public database.

## How to ask about PDF documents

There are 2 ways

### Method 1 Attach the file in the question box

{{steps:docs-flow}}

### Method 2 Pick a file already uploaded to {{ui:"My files"}}

{{steps:docs-files-flow}}

{{clip:docs-video}}

## Good to know

- You cannot attach PDFs together with a data file. If you attach a data file, the system analyses the data instead. See [[analyze-data]]
- The system reads at most the first 300 pages of each file
- The {{ui:"Reproduction plan"}} button, which appears when you attach a PDF, makes the system list what is needed to reproduce the paper: the main results, the data, the methods, the steps, and what the paper does not say. The system does not run any code
- The text of the attached documents is sent to the language model to write the answer, so do not attach documents that must not be disclosed. See [[data-and-privacy]]
- An attached PDF also appears in {{ui:"My files"}}. See [[manage-files]]
- Always check the answer against the document. The system quotes the text and gives the page so you can check

## Problems and fixes

- Problem: “You can attach up to 5 PDFs”
  Fix: Remove some attachments with {{ui:"Remove file"}}, then attach again
- Problem: “Choose PDFs or one data file, not both”
  Fix: Attach only PDFs, or only one data file
- Problem: “sample-paper.pdf could not be read as a PDF (it may be damaged or password-protected)”
  Fix: Open the file in a PDF reader to check it, remove the password, then attach it again
- Problem: “sample-paper.pdf has no extractable text (it may be a scanned image)”
  Fix: Use a file whose text can be selected, not a scanned image
- Problem: “The selected document was not found (it may have been deleted)”
  Fix: Attach the PDF again
- Problem: “Asking about documents needs the server's shared database, which is not available”
  Fix: Ask the server administrator to connect the shared database

## Related questions

- [[read-sources]]
- [[manage-files]]
- [[data-and-privacy]]
