---
id: read-sources
title: Open the sources of an answer
audience: []
book: user-guide
kind: how-to
group: ask
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/AnswerView.tsx, src/components/research/SourceInspector.tsx, src/components/ReferenceList.tsx, src/lib/refs.ts]
---
## What is opening the sources

Every sentence in the answer that cites research has a source label, such as “Yucheng et al. 2023” (the first author and the year). Click a label to open a details panel on the right. It shows the authors, the year, the source, which database found it, the DOI, the identifier check, and the quoted evidence with a result saying whether the abstract supports the statement. Use it when you want to check a sentence before you cite it.

The {{ui:"Sources"}} tab above the answer lists all the sources of that answer.

## How to open the sources of an answer

{{steps:source-flow}}

## Good to know

- The identifier check only confirms that the DOI, PMID or arXiv ID exists. It does not confirm that the paper supports the sentence in the answer
- The quote check has 4 results: {{ui:"Supported by the abstract"}}, {{ui:"Partly supported by the abstract"}}, {{ui:"Not supported by the abstract"}} and {{ui:"No quote found"}}. The reviewer reads only the abstract, not the full text
- Click {{ui:"Open source"}} at the end of the panel to read the original, and check it yourself before you use it
- An answer from your own PDF documents uses numbers such as [1] and [2] at the end of sentences. Click one to see the page and the text in the document. See [[ask-documents]]
- Records from some public databases (when present) appear under {{ui:"Database records"}} below the answer

## Problems and fixes

- Problem: “Could not confirm this reference exists”
  Fix: The system did not find this identifier in the checking sources. Look for the paper yourself before you use it, and do not cite it unchecked
- Problem: “Could not be checked right now (the service did not answer)”
  Fix: The checking service did not answer. This does not mean the paper is fake. Wait a moment and ask again, or check the identifier yourself
- Problem: “No identifier (DOI/PMID) to check”
  Fix: This item has no DOI, PMID or arXiv ID to check. Search for it by its title
- Problem: “No abstract to check against”
  Fix: The system has no abstract for this paper. Open the original and read it yourself

## Related questions

- [[export-references]]
- [[limits-and-safety]]
