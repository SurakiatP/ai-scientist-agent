"use client";
import { useState } from "react";
import { Box, List, ListItemButton, Typography } from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import { UI } from "@/lib/config";
import { useChatStore, type Session } from "@/lib/chat";
import { useHydrated } from "@/lib/history";
import { usePrefs, useT } from "@/lib/prefs";
import { stopRun, useRunState } from "@/lib/run";
import { useTreeOpen } from "./ProjectTree";
import { projectName } from "./ProjectSwitcher";
import { focusKebab, InlineConfirm, InlineRename, SessionMenu } from "./SessionMenu";

// Short relative time ("2 ชม.", "2h"); under a minute reads as "now".
function ago(ts: number, lang: string) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  const [n, unit] = m < 60 ? [m, "minute"] : m < 1440 ? [Math.round(m / 60), "hour"] : [Math.round(m / 1440), "day"];
  if (!n) return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(0, "second");
  return new Intl.NumberFormat(lang, { style: "unit", unit, unitDisplay: "narrow" }).format(n);
}

export function SessionList({ query, onPick }: { query: string; onPick?: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const hydrated = useHydrated(); // persisted store is browser-only: first render must match the server
  const activeId = useChatStore((s) => s.activeId), setActive = useChatStore((s) => s.setActive);
  const storeSessions = useChatStore((s) => s.sessions), store = useChatStore.getState();
  const treeOpen = useTreeOpen((s) => s.open), projects = useChatStore((s) => s.projects), activeProjectId = useChatStore((s) => s.activeProjectId);
  const sessions = hydrated ? storeSessions.filter((s) => s.turns.length || s.title) : []; // blank chats are not history
  const { sessionId: runningId } = useRunState();
  const [edit, setEdit] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const done = (id: string) => { setEdit(null); focusKebab(id); };
  const q = query.trim().toLowerCase();
  const match = (s: Session) => !q || (s.title || t.untitled).toLowerCase().includes(q);
  if (!sessions.length) return <Typography sx={{ px: 1.25, fontSize: "0.8125rem", color: "text.secondary" }}>{t.noSessions}</Typography>;
  // Sessions already listed inside an open project group are not repeated here; the rest, newest 8 (all matches while searching).
  const all = sessions.filter((s) => match(s) && !treeOpen.includes(s.projectId)).sort((a, b) => b.updatedAt - a.updatedAt);
  const rows = q ? all : all.slice(0, 8);
  if (!rows.length) return q && !sessions.some(match) ? <Typography sx={{ px: 1.25, fontSize: "0.8125rem", color: "text.secondary" }}>{t.noMatches}</Typography> : null;
  return (
    <List dense disablePadding aria-label={t.recents}>
      {rows.map((s) => edit?.id === s.id ? (
        <Box key={s.id} sx={{ px: 0.5 }}>
          {edit.mode === "rename"
            ? <InlineRename value={s.title} label={t.newName} onCancel={() => done(s.id)} onSave={(v) => { store.renameSession(s.id, v); done(s.id); }} />
            : <InlineConfirm text={t.deleteChatConfirm} note={t.deleteChatMemoryNote} onCancel={() => done(s.id)} onConfirm={() => { if (runningId === s.id) stopRun(); store.deleteSession(s.id); done(s.id); }} />}
        </Box>
      ) : (
        <Box key={s.id} sx={{
          display: "flex", alignItems: "center", position: "relative",
          // hover devices: the kebab overlays the time and shows on hover/focus; touch keeps both in the row
          "@media (hover: hover)": {
            "& .kebab": { position: "absolute", right: 0, opacity: 0 },
            "&:hover .kebab, &:focus-within .kebab, & .kebab:has([aria-expanded=true])": { opacity: 1 },
            "&:hover .when, &:focus-within .when": { visibility: "hidden" },
          },
        }}>
          <ListItemButton selected={s.id === activeId} onClick={() => { setActive(s.id); onPick?.(); }}
            aria-current={s.id === activeId ? "true" : undefined} sx={{ ...UI.row, borderRadius: 1.2, gap: 1.25, minWidth: 0, px: 1.25 }}>
            <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 18, color: "text.secondary", flexShrink: 0 }} />
            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.875rem" }}>{s.title || t.untitled}
              {s.projectId !== activeProjectId && <Typography component="span" sx={{ ml: 1, fontSize: "0.75rem", color: "text.secondary" }}>{projectName(projects.find((p) => p.id === s.projectId) ?? projects[0], t)}</Typography>}</Typography>
            {s.id === runningId && (
              <Box role="img" aria-label={t.running} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
            )}
            <Typography className="when" component="span" sx={{ fontSize: "0.75rem", color: "text.secondary", flexShrink: 0, minWidth: 28, textAlign: "right" }}>{ago(s.updatedAt, lang)}</Typography>
          </ListItemButton>
          <Box className="kebab" sx={{ display: "flex" }}>
            <SessionMenu session={s} onRename={() => setEdit({ id: s.id, mode: "rename" })} onDelete={() => setEdit({ id: s.id, mode: "delete" })} />
          </Box>
        </Box>
      ))}
    </List>
  );
}
