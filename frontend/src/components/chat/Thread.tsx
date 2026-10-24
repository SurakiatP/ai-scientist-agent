"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useChatStore } from "@/lib/chat";
import { enterRise, prefersReduced } from "@/lib/motion";
import { AgentMessage } from "./AgentMessage";
import { UserMessage } from "./UserMessage";

export function Thread({ sessionId }: { sessionId: string }) {
  const turns = useChatStore((s) => s.sessions.find((x) => x.id === sessionId)?.turns);
  const box = useRef<HTMLDivElement>(null), stick = useRef(true), count = useRef(0);
  const [seen] = useState(() => new Set(turns?.map((x) => x.id))); // turns present on mount never animate; only ones added after
  useEffect(() => {
    const el = box.current;
    if (!el || !turns) return;
    const added = count.current > 0 && turns.length > count.current;
    if (turns.length !== count.current) { count.current = turns.length; stick.current = true; } // a new message always follows
    if (!stick.current) return;
    if (added && !prefersReduced() && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    else el.scrollTop = el.scrollHeight;
  }, [turns]);
  return (
    <Box ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
      sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <Stack spacing={4} sx={{ maxWidth: 820, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
        {turns?.map((x) => (
          <Stack key={x.id} component="article" spacing={2} sx={seen.has(x.id) ? undefined : enterRise}>
            <UserMessage question={x.question} createdAt={x.createdAt} />
            <AgentMessage sessionId={sessionId} turn={x} />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
