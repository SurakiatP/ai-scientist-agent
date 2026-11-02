---
id: delete-chat
title: Delete a chat
audience: []
book: user-guide
kind: how-to
group: chats
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/shell/ProjectTree.tsx, src/components/shell/SessionMenu.tsx, src/components/sync/SyncUI.tsx]
---
## What is deleting a chat

Delete a chat you no longer need from the left bar. A deleted chat does not vanish at once. It moves to the trash and stays for 7 days, and you can restore it as in [[trash]]. Deleting a chat also deletes the memory of that session, so the {{ui:"Answer research"}} mode can no longer use its earlier results.

## How to delete a chat

{{steps:delete-flow}}

## Good to know

- If the chat is still working, the system stops that work when you delete it
- After you delete, the message {{ui:"Moved to trash"}} shows for a moment. Click {{ui:"Undo"}} to bring the chat back at once
- The trash works when the server is connected to the shared database. If it is not, see [[data-and-privacy]]
- You can delete every chat at once from the settings. See [[data-and-privacy]]

## Problems and fixes

- Problem: “Someone else changed this item. We loaded the latest version.”
  Fix: Someone else edited the same item. Check the list in the left bar, then delete again if it is still there

## Related questions

- [[trash]]
- [[organize-chats]]
