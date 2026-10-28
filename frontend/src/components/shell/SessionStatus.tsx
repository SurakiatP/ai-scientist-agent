"use client";
import type { ReactNode } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import type { Session } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { span, useNow, useUnread } from "@/lib/unread";

// The state of one session in the list: a spinner and the time it has been running, or a dot (finished, not read yet)
// and how long ago it finished. null = nothing to say (the caller shows the usual "time ago").
export function useSessionStatus(s: Session) {
  const unread = useUnread((st) => st.unread[s.id]);
  const running = s.turns.filter((t) => t.status === "running");
  const since = running.length ? Math.min(...running.map((t) => t.createdAt)) : null;
  return { running: since !== null, since, unread: since === null ? unread ?? null : null };
}

// With onlyIdle it renders its children only when the session is idle (the time ago); otherwise it renders nothing,
// so the status itself lives outside the hover-hidden time slot and stays visible and announced on hover and focus.
export function SessionStatus({ s, onlyIdle, children = null, sx }: { s: Session; onlyIdle?: boolean; children?: ReactNode; sx?: object }) {
  const t = useT();
  const st = useSessionStatus(s);
  const now = useNow(!onlyIdle && (st.running || !!st.unread));
  if (onlyIdle) return !st.running && !st.unread ? <>{children}</> : null;
  if (!st.running && !st.unread) return null;
  const u = { s: t.unitS, m: t.unitM, h: t.unitH };
  const text = st.running ? span(now - st.since!, u) : span(now - st.unread!.at, u);
  const label = st.running ? `${t.sessRunning} ${text}` : `${t.sessDone}. ${t.sessAgo} ${text}. ${t.sessTook} ${span(st.unread!.took, u)}`;
  return (
    <Box role="img" aria-label={label} title={label} sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, flexShrink: 0, ...sx }}>
      {st.running
        ? <CircularProgress size={14} thickness={5} aria-hidden sx={{ color: "primary.main" }} />
        : <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />}
      <Typography component="span" aria-hidden sx={{ fontSize: "0.75rem", color: st.running ? "primary.main" : "text.secondary", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{text}</Typography>
    </Box>
  );
}
