---
id: export-references
title: Copy an answer and export the references
audience: []
book: user-guide
kind: how-to
group: ask
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/chat/AgentMessage.tsx, src/lib/provenance.ts, src/lib/bibliography.ts]
---
## What is copying and exporting

Below a finished answer there is a row of answer tools. Use it to copy the answer text, download the provenance file, and download the references as BibTeX or RIS to import into a reference manager such as Zotero or EndNote. The provenance file says which model, instructions and sources the answer used. The {{ui:"Regenerate answer"}} button in the same row asks the same question again.

## How to copy an answer and export the references

{{steps:ref-flow}}

## Good to know

- The exported references are built from the sources of the answer. Check the titles and years against the originals before you use them in your writing
- The provenance file keeps the question, the answer and the references with their identifier check, but not the abstracts of the papers
- The download provenance button appears only on answers that have provenance data. Some older answers may not have it
- To turn the answer into a document, see [[create-report]]

## Problems and fixes

- Problem: “Copy failed”
  Fix: The browser did not allow copying. Select the text in the answer and copy it yourself

## Related questions

- [[read-sources]]
- [[create-report]]
