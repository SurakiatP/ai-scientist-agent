---
id: data-and-privacy
title: Where your data is kept and sent
audience: []
book: user-guide
kind: concept
group: safety
routes: []
covers: []
sources: [src/lib/strings.ts, src/components/settings/SettingsDialog.tsx, src/components/settings/ImportOld.tsx, src/components/sync/SyncUI.tsx, src/lib/sync.ts]
---
## Where your data is

AI Scientist has no sign-in, so the chats, projects and files you create are not tied to a person. Where the server is connected to the shared database, all data is kept in that database, and everyone who can reach the same server sees and edits the same data. A status indicator sits at the bottom left of the sidebar.

- “Online · shared database”: the data is in the shared database and synced
- “Offline · waiting to sync n items”: the server cannot be reached, but you can keep working. Changes sync when you are back online
- “Browser mode (no database)”: the data is kept only in this browser. The trash, usage and asking about documents do not work

## What is sent off your computer

- The question and the text found are sent to the server and to an outside language model provider to write the answer, so do not put personal data in a question
- The text of an attached PDF is also sent to the model to answer
- The analysis of a data file runs in a container with no internet and with limits on time and memory, but the column names and the text in cells are sent to the model that writes the script as context
- The identifier check sends only the DOI, PMID or arXiv ID to Crossref, PubMed and arXiv
- The {{ui:"Usage"}} page is a summary of real questions and answers on the server, and it does not keep the question text

## Deleting data and old data in the browser

{{shot:settings-data}}

- {{ui:"Delete all chats"}} in the {{ui:"Data"}} section of the settings deletes all chats and projects in the shared database. Nobody who uses this server will see them again. The items stay in the trash for 7 days before they are deleted for good. The system asks you to confirm first. Read the whole confirmation before you press it
- An earlier version of the system kept chats in the browser. The {{ui:"Earlier data in this browser"}} section says whether any was found. {{ui:"Import to the shared database"}} imports it, and after the import everyone who can reach the server sees that data. You can press it again without creating duplicates
- If the browser storage is full, the system tells you to delete old chats

## Why it matters

Because there is no sign-in, anyone who opens the same server can read your chats, files and trash. Do not keep confidential work or other people's personal data in this system. If you are not sure how your server is set up, ask the server administrator.

## Example

Two people open the same server. The first asks a question and uploads a data file. The second opens {{ui:"My files"}} and sees that file too, and can open the first person's chat.
