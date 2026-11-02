---
id: manage-files
title: Upload and preview files
audience: []
book: user-guide
kind: how-to
group: files
routes: [/files]
covers: []
sources: [src/lib/strings.ts, src/components/files/FilesPage.tsx, src/components/files/FileDialogs.tsx, src/lib/files.ts]
---
## What is uploading and previewing files

The {{ui:"My files"}} menu lists the files you uploaded, the files you attached in the question box, and the documents saved from a report. Each row shows the name, type, size, upload date and project. Use it to upload a file ahead of time, check what is in a file, or download it again.

The menu of each file has {{ui:"Preview"}}, {{ui:"Download"}}, {{ui:"Rename"}}, {{ui:"Analyze"}} (data files) or {{ui:"Ask about this document"}} (PDF), {{ui:"Move to project"}} and {{ui:"Delete"}}.

## How to upload and preview files

{{steps:files-flow}}

## Good to know

- You can upload CSV, XLSX, Parquet and JSON to analyse, and PDF to ask about documents
- The preview shows only the first rows of a table file
- You can rename a file. The new name must not be empty, must be at most 120 characters, and must keep the same extension
- Deleting a file moves it to the trash for 7 days, then removes it from storage for good. See [[trash]]
- Use the {{ui:"Search files"}} box to find a file by name
- PDF and Word files saved from a report are listed here too. See [[create-report]]

## Problems and fixes

- Problem: “The file is no longer in storage”
  Fix: Click {{ui:"Remove from list"}}, then upload the file again
- Problem: “File storage is unavailable right now. Try again later”
  Fix: Wait a moment and try again
- Problem: “The file is too large to preview”
  Fix: Download the file and open it in a program on your computer
- Problem: “No preview for this file type”
  Fix: Download the file and open it in a program on your computer
- Problem: “The file extension must stay .csv”
  Fix: Give the new name, keeping the same extension at the end
- Problem: “The name is longer than 120 characters”
  Fix: Use a shorter name

## Related questions

- [[analyze-data]]
- [[ask-documents]]
- [[trash]]
