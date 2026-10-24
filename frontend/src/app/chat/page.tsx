"use client";
import { useEffect } from "react";
import { Typography } from "@mui/material";
import { AppShell } from "@/components/shell/AppShell";
import { useChatStore } from "@/lib/chat";
import { useT } from "@/lib/prefs";

export default function ChatPage() {
  const t = useT();
  useEffect(() => { useChatStore.getState().importLegacyHistory(); }, []); // no-op after the first import
  return (
    <AppShell>
      <Typography component="h1" sx={{ p: 3, fontSize: "1.5rem", fontWeight: 700 }}>{t.title}</Typography>
    </AppShell>
  );
}
