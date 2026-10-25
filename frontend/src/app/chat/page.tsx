"use client";
import { useEffect } from "react";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { AppShell } from "@/components/shell/AppShell";
import { Composer } from "@/components/chat/Composer";
import { EmptyChat } from "@/components/chat/EmptyChat";
import { Thread } from "@/components/chat/Thread";
import { ProgressPanel } from "@/components/research/ProgressPanel";
import { SourceInspector } from "@/components/research/SourceInspector";
import { UI } from "@/lib/config";
import { useInspector } from "@/lib/inspector";
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
  const wide = useMediaQuery(useTheme().breakpoints.up("lg"));
  const iref = useInspector((s) => s.ref);
  const inspecting = !!iref && iref.sessionId === active?.id && !!active.turns.find((x) => x.id === iref.turnId)?.answer?.references.some((x) => x.id === iref.refId);
  useEffect(() => { useInspector.setState({ ref: null }); }, [active?.id]); // a source from another chat never lingers
  // right panel: the source being inspected, else the running (or last) turn's real progress
  const turn = active?.turns.find((x) => x.status === "running") ?? active?.turns.at(-1);
  const progress = turn && turn.status !== "awaiting_plan" && (turn.status === "running" || turn.progress.searches.length > 0 || !!turn.answer) ? <ProgressPanel turn={turn} sessionId={active?.id} /> : null;
  return (
    <AppShell aside={wide ? (inspecting ? <SourceInspector variant="panel" /> : progress) : null}>
      {!wide && <SourceInspector variant="sheet" />}
      {hydrated && active && (active.turns.length === 0 ? <EmptyChat sessionId={active.id} /> : (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Thread key={active.id} sessionId={active.id} />
          <Box sx={{ maxWidth: UI.content, width: "100%", mx: "auto", px: { xs: 2, sm: 3 }, pb: 1.5 }}><Composer sessionId={active.id} /></Box>
        </Box>
      ))}
    </AppShell>
  );
}
