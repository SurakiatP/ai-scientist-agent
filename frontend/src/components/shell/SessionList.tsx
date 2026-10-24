"use client";
import { useState } from "react";
import { Box, List, ListItemButton, Typography } from "@mui/material";
import { useChatStore, type Session } from "@/lib/chat";
import { useHydrated } from "@/lib/history";
import { usePrefs, useT } from "@/lib/prefs";
import { stopRun, useRunState } from "@/lib/run";
import { projectName } from "./ProjectSwitcher";
import { InlineConfirm, InlineRename, SessionMenu } from "./SessionMenu";

function ago(ts: number, lang: string) {
  const m = Math.round((ts - Date.now()) / 60_000);
  const f = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (Math.abs(m) < 60) return f.format(m, "minute");
  if (Math.abs(m) < 1440) return f.format(Math.round(m / 60), "hour");
  return f.format(Math.round(m / 1440), "day");
}

export function SessionList({ query, onPick }: { query: string; onPick?: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const hydrated = useHydrated(); // persisted store is browser-only: first render must match the server
  const store = useChatStore();
  const { projects, activeId, activeProjectId, setActive } = store;
  const sessions = hydrated ? store.sessions : [];
  const { sessionId: runningId } = useRunState();
  const [edit, setEdit] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const done = () => setEdit(null);
  const q = query.trim().toLowerCase();
  const match = (s: Session) => !q || (s.title || t.untitled).toLowerCase().includes(q);
  if (!sessions.length) return <Typography sx={{ px: 1.25, fontSize: "0.8125rem", color: "text.secondary" }}>{t.noSessions}</Typography>;
  const groups = [...projects].sort((a, b) => +(b.id === activeProjectId) - +(a.id === activeProjectId))
    .map((p) => ({ p, rows: sessions.filter((s) => s.projectId === p.id && match(s)).sort((a, b) => b.updatedAt - a.updatedAt) }))
    .filter((g) => g.rows.length);
  if (!groups.length) return <Typography sx={{ px: 1.25, fontSize: "0.8125rem", color: "text.secondary" }}>{t.noMatches}</Typography>;
  return (
    <>
      {groups.map(({ p, rows }) => (
        <Box key={p.id} component="section" aria-label={projectName(p, t)}>
          <Typography sx={{ px: 1.25, pt: 1, fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary" }}>{projectName(p, t)}</Typography>
          <List dense disablePadding>
            {rows.map((s) => edit?.id === s.id ? (
              <Box key={s.id} sx={{ px: 0.5 }}>
                {edit.mode === "rename"
                  ? <InlineRename value={s.title} label={t.newName} onCancel={done} onSave={(v) => { store.renameSession(s.id, v); done(); }} />
                  : <InlineConfirm text={t.deleteChatConfirm} onCancel={done} onConfirm={() => { if (runningId === s.id) stopRun(); store.deleteSession(s.id); done(); }} />}
              </Box>
            ) : (
              <Box key={s.id} sx={{ display: "flex", alignItems: "center" }}>
                <ListItemButton selected={s.id === activeId} onClick={() => { setActive(s.id); onPick?.(); }}
                  aria-current={s.id === activeId ? "true" : undefined} sx={{ minHeight: 44, borderRadius: 1.5, gap: 1, minWidth: 0 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem" }}>{s.title || t.untitled}</Typography>
                    <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{ago(s.updatedAt, lang)}</Typography>
                  </Box>
                  {s.id === runningId && (
                    <Box role="img" aria-label={t.running} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                  )}
                </ListItemButton>
                <SessionMenu session={s} onRename={() => setEdit({ id: s.id, mode: "rename" })} onDelete={() => setEdit({ id: s.id, mode: "delete" })} />
              </Box>
            ))}
          </List>
        </Box>
      ))}
    </>
  );
}
