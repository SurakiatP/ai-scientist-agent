---
id: analyze-data
title: Analyze a data file
audience: []
book: user-guide
kind: how-to
group: files
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/chat/Composer.tsx, src/components/research/AnalysisArtifact.tsx, src/lib/files.ts]
---
## What is analyzing a data file

Attach a table file (CSV, XLSX, Parquet or JSON) and ask in plain language. The system writes and runs a Python script in a container with no internet, then shows the result as tables, charts and findings. Use it to compare groups, find averages or draw charts from your own data.

When a data file is attached, the send button analyses that data instead of searching the literature.

## How to analyze a data file

{{steps:data-flow}}

## Good to know

- The result has the tabs {{ui:"Overview"}}, {{ui:"Tables"}}, {{ui:"Charts"}}, {{ui:"Findings"}} and {{ui:"Code and run log"}}, and a button to download the result table
- The system shows the stages it went through: profile the file, write the script, run the analysis, repair the script (if needed) and store the results
- A language model wrote the script. Before you use the numbers, open the {{ui:"Code and run log"}} tab and check that it computed what you meant
- A table in the result may show only the first rows, and a very large file may be cut at the row limit. The system says so in the result
- You can ask only about the data in the file. To search the literature, remove the file first. See [[ask-a-question]]
- You can also choose the same file from {{ui:"My files"}} and click {{ui:"Analyze"}}. See [[manage-files]]

## Problems and fixes

- Problem: “This question is not about the uploaded data.”
  Fix: Ask about the table in the file, for example compare the mean of each group
- Problem: “This is a literature question, not an analysis of the uploaded file.”
  Fix: To search the literature, remove the file and ask again
- Problem: “File analysis is not enabled on this server”
  Fix: Ask the server administrator to turn on file analysis
- Problem: “Could not upload the file”
  Fix: Check that the file is a supported type and not damaged, then attach it again

## Related questions

- [[manage-files]]
- [[limits-and-safety]]
