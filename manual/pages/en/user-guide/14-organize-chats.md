---
id: organize-chats
title: Organize chats in projects
audience: []
book: user-guide
kind: how-to
group: chats
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/shell/ProjectTree.tsx, src/components/shell/SessionMenu.tsx, src/lib/chat.ts]
---
## What is organizing chats in projects

A project is a group of chats. Use projects to keep each research topic apart. A {{ui:"Personal"}} project always exists. You can add more projects, then move existing chats into them, or start a new chat inside a project with {{ui:"New session"}}.

## How to organize chats in projects

{{steps:organize-flow}}

{{clip:organize-video}}

## Good to know

- A new project stays empty until you move or start a chat in it. When you click a project name, the system switches to that project
- You can create up to 30 projects
- Rename a chat or a project from its actions menu: choose {{ui:"Rename"}}, enter the {{ui:"New name"}}, then click {{ui:"Save"}}
- Delete a project from its actions menu. The chats in a deleted project move to {{ui:"Personal"}} and the project goes to the trash. The system asks you to confirm first
- A file can also be moved to a project from the file menu. See [[manage-files]]

## Problems and fixes

- Problem: “Project limit reached. Delete a project to add another.”
  Fix: Delete a project you no longer use, then create the new one

## Related questions

- [[find-chats]]
- [[delete-chat]]
