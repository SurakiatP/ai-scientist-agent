---
id: trash
title: Restore an item from the trash
audience: []
book: user-guide
kind: how-to
group: chats
routes: [/trash]
covers: []
sources: [src/lib/strings.ts, src/components/trash/TrashPage.tsx]
---
## What is restoring from the trash

The {{ui:"Trash"}} menu keeps deleted chats, projects and files for 7 days, then removes them for good. Use it when you deleted something by mistake and want it back, or when you want to delete it for good at once. The table shows {{ui:"Name"}}, {{ui:"Type"}}, {{ui:"Deleted"}} and {{ui:"Time left"}}.

## How to restore an item from the trash

{{steps:trash-flow}}

## Good to know

- The {{ui:"Time left"}} column shows “n days left” and “Expires today”. Items that have expired are removed for good
- Click {{ui:"Delete forever"}} when you want to delete at once. The system asks “Delete ... forever? This cannot be undone.”. Click {{ui:"Confirm"}} to confirm
- The {{ui:"Clear expired items"}} button removes the items that are past 7 days at once
- The trash is shared with everyone who uses the same server, because the system has no sign-in. See [[data-and-privacy]]
- The trash works only when the server is connected to the shared database

## Problems and fixes

- Problem: “Trash is available when the shared database is connected”
  Fix: This server is not connected to the shared database. Tell the server administrator
- Problem: “Could not load the trash”
  Fix: Reload the page and try again
- Problem: “That did not work. Try again.”
  Fix: Click the button of that item again
- Problem: “Trash is empty”
  Fix: There are no deleted items. Deleted chats, projects and files will show up here

## Related questions

- [[delete-chat]]
- [[manage-files]]
