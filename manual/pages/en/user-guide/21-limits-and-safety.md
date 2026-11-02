---
id: limits-and-safety
title: What the system covers and what you must check
audience: []
book: user-guide
kind: concept
group: safety
routes: []
covers: []
sources: [src/lib/strings.ts, src/components/chat/AgentMessage.tsx, src/lib/chat.ts, src/components/research/PlanCard.tsx]
---
## What the system answers

AI Scientist answers only scientific research questions, in Thai and English. It writes the answer only from the papers it finds. If the evidence is not enough, the answer says plainly that it cannot conclude. It does not guess.

## What the system refuses

When it refuses, the screen shows a short message and sample questions so you can go back to a research topic. No search starts.

{{shot:refused}}

- {{ui:"This question is outside this tool's scope"}}: a question that is not scientific research
- {{ui:"This request tries to change the assistant's instructions, so it was not followed."}}: text that tells the system to change its own rules
- {{ui:"This cannot be done here (for example writing work for you, a diagnosis, or reading files and secrets)."}}
- In {{ui:"Answer research"}} mode: if you ask something that needs a new search, or the chat has no results yet, the system tells you to switch the mode or search first
- In file analysis: a question that is not about the data in the file, or a literature question, is turned back and you are told to ask again

## What you must check yourself

- The label that says the references were checked only confirms that the DOI, PMID or arXiv ID exists. It does not confirm that the paper supports the sentence it is cited for
- The reviewer reads only the abstract, not the full text. So “Supported by the abstract” does not certify that the paper really supports it
- A reference without a DOI, PMID or arXiv ID cannot be checked by identifier, and a reference that “could not be checked” may only mean the checking service did not answer
- The language model can still be wrong. Open the original before you use it. See [[read-sources]]
- If you stop the work before it ends, the answer is incomplete. The system says so in the answer
- A file analysis comes from a script the model wrote. Check it in the {{ui:"Code and run log"}} tab. See [[analyze-data]]
- The closing statements of a report are neutral drafts. The author must change them to match the facts. See [[report-details]]
- The author is responsible for the content of the exported report

## Limits to know

- A question is at most 2000 characters
- At most 5 search terms per question, and each search term can take up to 5 minutes
- You can attach up to 5 PDFs, and the system reads the first 300 pages of each
- When several people use the system, work waits in a queue
- The system does not run code from attached documents, and file analysis has no internet
