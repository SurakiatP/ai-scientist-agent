---
id: faq
title: Common problems and fixes
audience: []
book: user-guide
kind: reference
group: safety
routes: []
covers: []
sources: [src/lib/strings.ts]
---
## What this page collects

The problem messages you meet most often when you use AI Scientist, and how to fix them. Look for the message you see on the screen in the list below. Problems that belong to one task are on the page of that task, such as [[ask-documents]] and [[create-report]].

## Problems and fixes

- Problem: “Could not reach the server”
  Fix: Check your internet connection and that the server is running, then reload the page. If it still fails, tell the server administrator
- Problem: “The connection ended before the answer was complete”
  Fix: The answer is incomplete. Click {{ui:"Try again"}} to ask again
- Problem: “Received unreadable data from the server”
  Fix: Ask again. If it stays the same, tell the server administrator
- Problem: “Request failed”
  Fix: Try again. If it keeps happening, tell the server administrator
- Problem: “Could not start the run. Try again.”
  Fix: Send the question again
- Problem: “Not sure the question reached the server. If it did, it will appear in this chat. Check before sending it again.”
  Fix: Wait a moment and look in this chat to see whether the question appears. Send it again only when you are sure it did not, so it does not search twice
- Problem: “The server queues this run. Reload the page and try again.”
  Fix: Reload the page, then send the question again
- Problem: “Another research run is in progress”
  Fix: Wait for that work to finish, or click {{ui:"Stop"}} on it
- Problem: “Could not stop the run. Try again.”
  Fix: Click {{ui:"Stop"}} again
- Problem: “The run was interrupted (for example by a reload). You can retry.”
  Fix: Click {{ui:"Try again"}}
- Problem: “No papers yet. Each search can take up to 5 minutes, and some external databases answer slowly or limit requests.”
  Fix: Keep waiting. The system is still working. If you do not want to wait, click {{ui:"Stop"}}
- Problem: “This question is outside this tool's scope”
  Fix: Ask a scientific research question. See [[limits-and-safety]]
- Problem: “The scope check could not be completed. Please try again.”
  Fix: Send the question again
- Problem: “The question is too long. Please shorten it.”
  Fix: Shorten the question
- Problem: “There are no search results in this session to answer from yet. Run a search first.”
  Fix: Change the mode to {{ui:"Deep research"}} or {{ui:"General search"}} and get an answer first, then use {{ui:"Answer research"}}
- Problem: “Browser storage is full. Delete old chats; new chats may not be saved.”
  Fix: Delete old chats you no longer use. See [[delete-chat]]
- Problem: “The sync queue is full, so some edits may not be saved. Try reconnecting.”
  Fix: Check the connection to the server, then reload the page and check that your latest edits are still there
- Problem: “Someone else changed this item. We loaded the latest version.”
  Fix: Someone else edited the same item. Check that it is what you want, and do it again if needed
- Problem: “This page failed to render. Try again; your chats stored in this browser are not affected.”
  Fix: Click {{ui:"Try again"}} or reload the page

## Related questions

- [[ask-a-question]]
- [[data-and-privacy]]
- [[limits-and-safety]]
