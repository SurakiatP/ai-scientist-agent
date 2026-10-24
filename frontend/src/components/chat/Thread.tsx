"use client";
import { useEffect, useRef } from "react";
import { Box, Stack } from "@mui/material";
import { useChatStore } from "@/lib/chat";
import { AgentMessage } from "./AgentMessage";
import { UserMessage } from "./UserMessage";

export function Thread({ sessionId }: { sessionId: string }) {
  const turns = useChatStore((s) => s.sessions.find((x) => x.id === sessionId)?.turns);
  const box = useRef<HTMLDivElement>(null), stick = useRef(true), count = useRef(0);
  useEffect(() => {
    const el = box.current;
    if (!el || !turns) return;
    if (turns.length !== count.current) { count.current = turns.length; stick.current = true; } // a new message always follows
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);
  return (
    <Box ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
      sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <Stack spacing={4} sx={{ maxWidth: 820, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
        {turns?.map((x) => (
          <Stack key={x.id} component="article" spacing={2}>
            <UserMessage question={x.question} createdAt={x.createdAt} />
            <AgentMessage sessionId={sessionId} turn={x} />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
