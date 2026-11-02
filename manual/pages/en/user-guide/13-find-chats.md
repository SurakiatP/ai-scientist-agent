---
id: find-chats
title: Find and open an earlier chat
audience: []
book: user-guide
kind: how-to
group: chats
routes: [/chat]
covers: []
sources: [src/lib/strings.ts, src/components/shell/Sidebar.tsx, src/components/shell/SessionList.tsx, src/components/shell/ProjectTree.tsx]
---
## What is finding a chat

Every chat is kept in the left bar. Use the {{ui:"Search chats"}} box to find one by its title, then click it to see the earlier question and answer. You can ask a follow-up in the same chat.

## How to find and open an earlier chat

{{steps:find-flow}}

## Good to know

- The search looks at chat titles (which come from the first question), not at the text of the answers
- Chats are listed with the most recently used first. If there are many, {{ui:"Load more chats"}} loads older ones
- While you search, every project that has a matching chat opens by itself
- In an earlier chat, the {{ui:"Ask follow-up"}} button below an answer takes you to the question box to ask more. The {{ui:"Answer research"}} mode uses the results already found in that chat
- To group chats, see [[organize-chats]]

## Problems and fixes

- Problem: “No matching chats”
  Fix: Try a shorter search word, or a word from the real chat title. Clear the search to see all chats
- Problem: “No chats yet”
  Fix: You have not asked a question in this project. Click {{ui:"New chat"}} to start. See [[ask-a-question]]

## Related questions

- [[organize-chats]]
- [[delete-chat]]
