---
id: ask-a-question
title: Ask a research question
audience: []
book: user-guide
kind: how-to
group: ask
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/chat/Composer.tsx, src/lib/packs.ts, src/components/research/ProgressPanel.tsx]
---
## What is asking a research question

The question box on the chat screen takes a research question of up to 2000 characters. Two buttons next to the send button choose how the system works.

- Mode button: {{ui:"Deep research"}} plans search terms and searches scholarly sources, {{ui:"General search"}} uses fewer search terms, and {{ui:"Answer research"}} answers from results already found in that chat without searching again. You can choose it once the chat has an answer
- Field button: {{ui:"All fields"}} or the field that fits your topic, such as Medicine. The system then picks sources that fit better
- While it works, the screen shows the stages (plan, search, write, check references) and papers appearing as they are found. Click {{ui:"Stop"}} to stop the work at any time

## How to ask a research question

{{steps:ask-flow}}

## Good to know

- Press Enter to send the question, and hold Shift while pressing Enter to start a new line
- In {{ui:"Deep research"}} mode the system proposes the search plan for you to check before it starts. See [[review-plan]]. If you turned this step off, it starts at once. See [[plan-setting]]
- The system searches with up to 5 search terms per question, and each search term can take up to 5 minutes
- When several people use the system, work waits in a queue, and the screen shows your place and the estimated wait
- If you attach a file, the send button acts differently. See [[ask-documents]] and [[analyze-data]]
- The answer comes from a language model, so check the sources before you use it. See [[read-sources]]

## Problems and fixes

- Problem: “Question is longer than 2000 characters”
  Fix: Shorten the question and send it again
- Problem: “You already have the maximum jobs waiting. Wait for one to finish.”
  Fix: Wait for the earlier work to finish, or click {{ui:"Stop"}} on it, then send the new question
- Problem: “The queue is full. Try again shortly.”
  Fix: Wait a moment and send again
- Problem: “Could not send the run. The server is not ready. Try again.”
  Fix: Send the question again. If it stays the same, see [[faq]]
- Problem: “The run failed. You can retry.”
  Fix: Click {{ui:"Try again"}}

## Related questions

- [[review-plan]]
- [[limits-and-safety]]
- [[faq]]
