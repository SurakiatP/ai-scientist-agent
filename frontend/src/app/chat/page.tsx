"use client";
import { useEffect } from "react";
import { Box } from "@mui/material";
import { AppShell } from "@/components/shell/AppShell";
import { Composer } from "@/components/chat/Composer";
import { EmptyChat } from "@/components/chat/EmptyChat";
import { Thread } from "@/components/chat/Thread";
import { useChatStore } from "@/lib/chat";
import { useHydrated } from "@/lib/history";

export default function ChatPage() {
  const hydrated = useHydrated();
  const active = useChatStore((s) => s.sessions.find((x) => x.id === s.activeId));
  useEffect(() => { useChatStore.getState().importLegacyHistory(); }, []); // no-op after the first import
  useEffect(() => { // always have a valid active session; reuse an empty one instead of piling up blanks
    if (!hydrated || active) return;
    const s = useChatStore.getState();
    const empty = s.sessions.find((x) => x.projectId === s.activeProjectId && x.turns.length === 0);
    if (empty) s.setActive(empty.id); else s.newSession(s.activeProjectId);
  }, [hydrated, active]);
  return (
    <AppShell>
      {hydrated && active && (active.turns.length === 0 ? <EmptyChat sessionId={active.id} /> : (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Thread key={active.id} sessionId={active.id} />
          <Box sx={{ maxWidth: 820, width: "100%", mx: "auto", px: { xs: 2, sm: 3 }, pb: 1.5 }}><Composer sessionId={active.id} /></Box>
        </Box>
      ))}
    </AppShell>
  );
}
