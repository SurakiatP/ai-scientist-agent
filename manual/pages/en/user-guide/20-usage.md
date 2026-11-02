---
id: usage
title: View the usage figures
audience: []
book: user-guide
kind: how-to
group: settings
routes: [/usage]
covers: []
sources: [src/lib/strings.ts, src/components/usage/UsagePage.tsx, src/components/settings/SettingsDialog.tsx]
---
## What is viewing usage

The {{ui:"Usage"}} page is a summary of real questions and answers on the server, without the question text, split by mode: {{ui:"Deep research"}}, {{ui:"General search"}}, {{ui:"Answer research"}}, {{ui:"From documents"}}, {{ui:"Search plan"}} and {{ui:"Data analysis"}}. Each card shows {{ui:"Runs"}}, {{ui:"Median time"}}, {{ui:"p95 time"}} (the time that 95 out of 100 runs stay within), {{ui:"Avg tokens (in / out)"}}, {{ui:"Avg cost (USD)"}} and the {{ui:"Succeeded"}} rate. Use it to see about how much time and cost each mode takes.

## How to view the usage figures

{{steps:usage-flow}}

## Good to know

- The figures are for everyone who uses the same server, not only you
- Choose the range {{ui:"7 days"}} or {{ui:"30 days"}} with the toggle at the top of the page
- A token is a unit of text that the language model reads and writes. It measures the amount of work and the cost
- This page works when the server is connected to the shared database

## Problems and fixes

- Problem: “No runs in this period yet”
  Fix: Switch to {{ui:"30 days"}}, or ask a question first
- Problem: “Could not load usage”
  Fix: Reload the page and try again
- Problem: “Usage is available when the shared database is connected”
  Fix: This server is not connected to the shared database. Tell the server administrator

## Related questions

- [[data-and-privacy]]
- [[ask-a-question]]
