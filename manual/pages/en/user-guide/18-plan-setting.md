---
id: plan-setting
title: Turn the plan review on or off
audience: []
book: user-guide
kind: how-to
group: settings
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/settings/SettingsDialog.tsx, src/lib/prefs.ts]
---
## What is the plan review setting

The {{ui:"Review the plan before searching"}} switch in the settings decides whether {{ui:"Deep research"}} mode stops to let you review and edit the search plan before it really searches. It is on by default. Turn it off when you do not want to review the plan every time and want the search to start right after you send the question. {{ui:"General search"}} and {{ui:"Answer research"}} modes never wait.

## How to turn the plan review on or off

{{steps:plan-setting-flow}}

## Good to know

- This setting is stored in the browser you use
- When it is on, the review step is explained in [[review-plan]]
- When it is off, you can still stop the work with {{ui:"Stop"}} while it searches

## Problems and fixes

This task has no problem message of its own. If nothing happens after you send a question, see [[faq]]

## Related questions

- [[review-plan]]
- [[language-theme]]
