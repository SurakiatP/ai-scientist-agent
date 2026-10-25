"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, IconButton, List, ListItemButton, Stack, TextField, Typography } from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { create } from "zustand";
import { UI } from "@/lib/config";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { useHydrated } from "@/lib/history";
import { canAnimate, ease } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { useGoChat } from "@/lib/nav";
import { stopRun, useRunState } from "@/lib/run";
import { ago, focusKebab, InlineConfirm, InlineRename, KebabMenu, SessionMenu } from "./SessionMenu";
import { projectName, selectProject } from "./ProjectSwitcher";

// Which project groups are open. Session-scoped (sessionStorage), never synced; SessionList reads it so a
// session shown inside an open group is not repeated in Recent.
const KEY = "scientist-tree-open";
const read = (): string[] => { try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const write = (ids: string[]) => { try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* storage blocked: state stays in memory */ } };
export const useTreeOpen = create<{ open: string[]; toggle: (id: string) => void; add: (id: string) => void; setOnly: (id: string) => void; load: () => void }>()((set, get) => ({
  open: [],
  toggle: (id) => { const open = get().open.includes(id) ? get().open.filter((x) => x !== id) : [...get().open, id]; write(open); set({ open }); },
  add: (id) => { if (!get().open.includes(id)) { const open = [...get().open, id]; write(open); set({ open }); } },
  setOnly: (id) => { write([id]); set({ open: [id] }); },
  load: () => set({ open: read() }),
}));

const MS = 180;
// Height animates 0fr -> 1fr under no-preference only; reduced motion and jsdom open/close instantly.
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  // `lingering` keeps the content mounted while the closing animation plays; everything else is derived from `open`
  const [lingering, setLingering] = useState(false), [entered, setEntered] = useState(open);
  const animate = canAnimate();
  useEffect(() => {
    if (!animate) return;
    if (open) { const r = requestAnimationFrame(() => setEntered(true)); return () => cancelAnimationFrame(r); }
    const r = requestAnimationFrame(() => { setEntered(false); setLingering(true); });
    const id = setTimeout(() => setLingering(false), MS);
    return () => { cancelAnimationFrame(r); clearTimeout(id); };
  }, [open, animate]);
  const mounted = open || (animate && lingering);
  const shown = animate ? entered && open : open;
  if (!mounted) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateRows: shown ? "1fr" : "0fr", "@media (prefers-reduced-motion: no-preference)": { transition: `grid-template-rows ${MS}ms ${ease}` } }}>
      <Box sx={{ minHeight: 0, overflow: "hidden" }}>{children}</Box>
    </Box>
  );
}

const coarse = (fine: number, touch = 44) => ({ minHeight: touch, "@media (pointer: fine)": { minHeight: fine } });
const reveal = {
  "@media (hover: hover)": {
    "& .kebab": { position: "absolute", right: 0, opacity: 0 },
    "&:hover .kebab, &:focus-within .kebab, & .kebab:has([aria-expanded=true])": { opacity: 1 },
    "&:hover .when, &:focus-within .when": { visibility: "hidden" },
  },
};
const activeBg = "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)";

export function ProjectTree({ query, onPick }: { query: string; onPick?: () => void }) {
  const t = useT();
  const hydrated = useHydrated();
  const goChat = useGoChat();
  const { open, toggle, add, load, setOnly } = useTreeOpen();
  const lang = usePrefs((s) => s.lang), [listOpen, setListOpen] = useState(true);
  const storeProjects = useChatStore((s) => s.projects), storeActive = useChatStore((s) => s.activeProjectId), storeSessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeId), setActive = useChatStore((s) => s.setActive), newSession = useChatStore((s) => s.newSession), addProject = useChatStore((s) => s.addProject);
  const store = useChatStore.getState();
  const { sessionId: runningId } = useRunState();
  const projects = hydrated ? storeProjects : storeProjects.slice(0, 1);
  const activeProjectId = hydrated ? storeActive : PERSONAL;
  const sessions = hydrated ? storeSessions.filter((s) => s.turns.length || s.title) : [];
  const [adding, setAdding] = useState(false), [name, setName] = useState(""), [full, setFull] = useState(false);
  const [pedit, setPedit] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const [sedit, setSedit] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => { if (hydrated) load(); }, [hydrated, load]);
  // the project new chats go to (and the one of the open chat) is always expanded when it becomes active
  // later switches collapse the other groups (the user can still open several by hand)
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (seen.current !== null && seen.current !== activeProjectId) setOnly(activeProjectId); else add(activeProjectId);
    seen.current = activeProjectId;
  }, [hydrated, activeProjectId, add, setOnly]);

  const closeForm = () => { setAdding(false); setName(""); setFull(false); };
  const submit = () => {
    if (!name.trim()) return;
    const id = addProject(name);
    if (!id) return setFull(true);
    selectProject(id);
    closeForm();
  };
  const sdone = (id: string) => { setSedit(null); focusKebab("t-" + id); };

  function newIn(pid: string) {
    newSession(pid);
    onPick?.();
    goChat();
    setTimeout(() => document.getElementById("composer")?.focus(), 0);
  }

  return (
    <Box component="section" aria-label={t.projects}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", pl: 1.25, pt: 0.5 }}>
        <Button color="inherit" aria-expanded={listOpen} aria-label={`${t.toggleProject} ${t.projects}`} onClick={() => setListOpen((v) => !v)} endIcon={<ExpandMoreRoundedIcon sx={{ transform: listOpen ? "none" : "rotate(-90deg)" }} />}
          sx={{ ...coarse(32), px: 0.75, ml: -0.75, fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary", "& .MuiButton-endIcon": { ml: 0.25, "& svg": { fontSize: 16 } } }}>
          <Box component="span">{t.projects}</Box>
        </Button>
        <IconButton size="small" aria-label={t.newProject} aria-expanded={adding} onClick={() => (adding ? closeForm() : setAdding(true))} sx={{ color: "text.primary" }}>
          <Box sx={{ display: "grid", placeItems: "center", width: 22, height: 22, border: 1, borderColor: "divider", borderRadius: "50%" }}><AddRoundedIcon sx={{ fontSize: 16 }} /></Box>
        </IconButton>
      </Stack>
      {adding && listOpen && (
        <Stack direction="row" spacing={0.5} sx={{ mt: 1, mb: 1.5, px: 0.5, alignItems: "flex-start" }}>
          <TextField size="small" fullWidth autoFocus placeholder={t.newProject} value={name} onChange={(e) => { setName(e.target.value); setFull(false); }} error={full}
            helperText={full ? t.projectLimit : undefined}
            sx={{ "& .MuiInputBase-input": { py: "10px" }, "& .MuiFormHelperText-root": { mx: 0.5, mt: 0.75 } }}
            slotProps={{ htmlInput: { "aria-label": t.projectName, maxLength: 100 } }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); closeForm(); }
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }} />
          <IconButton aria-label={t.addProject} disabled={!name.trim()} onClick={submit} sx={{ ...coarse(40), width: { xs: 44, "@media (pointer: fine)": 40 }, color: "primary.main" }}><CheckRoundedIcon fontSize="small" /></IconButton>
          <IconButton aria-label={t.cancel} onClick={closeForm} sx={{ ...coarse(40), width: { xs: 44, "@media (pointer: fine)": 40 }, color: "text.secondary" }}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      )}
      <Collapse open={listOpen}><Box sx={{ pt: adding ? 0 : 0.5 }}>
        {projects.map((p) => {
          const pname = projectName(p, t);
          
          const current = p.id === activeProjectId;
          const rows = sessions.filter((s) => s.projectId === p.id && (!q || (s.title || t.untitled).toLowerCase().includes(q))).sort((a, b) => b.updatedAt - a.updatedAt);
          const expanded = hydrated && (open.includes(p.id) || (!!q && rows.length > 0));
          if (pedit?.id === p.id) return (
            <Box key={p.id} sx={{ px: 0.5, mb: 0.5 }}>
              {pedit.mode === "rename"
                ? <InlineRename value={p.name} label={t.projectName} onCancel={() => { setPedit(null); focusKebab(p.id); }} onSave={(v) => { store.renameProject(p.id, v); setPedit(null); focusKebab(p.id); }} />
                : <InlineConfirm text={t.deleteProjectConfirm} onCancel={() => { setPedit(null); focusKebab(p.id); }} onConfirm={() => { store.deleteProject(p.id); setPedit(null); focusKebab(p.id); }} />}
            </Box>
          );
          return (
            <Box key={p.id} sx={{ mb: 0.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", position: "relative", borderRadius: 1.2, bgcolor: current ? activeBg : "transparent", ...reveal }}>
                <IconButton aria-expanded={expanded} aria-label={`${t.toggleProject} ${pname}`} onClick={() => toggle(p.id)}
                  sx={{ borderRadius: 1.2, color: "text.secondary", ...coarse(40), width: { xs: 44, "@media (pointer: fine)": 36 }, flexShrink: 0 }}>
                  {expanded ? <FolderOpenOutlinedIcon sx={{ fontSize: 20 }} /> : <FolderOutlinedIcon sx={{ fontSize: 20 }} />}
                </IconButton>
                {/* a second click on the open, current project folds it like a dropdown; any other click selects the project and opens it */}
                <Button fullWidth color="inherit" aria-current={current ? "true" : undefined} onClick={() => { if (current && expanded) { toggle(p.id); return; } selectProject(p.id); add(p.id); }}
                  sx={{ justifyContent: "flex-start", ...UI.row, px: 0.75, borderRadius: 1.2, fontWeight: current ? 600 : 400, fontSize: "0.875rem", minWidth: 0 }}>
                  <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pname}</Box>
                </Button>
                {p.id !== PERSONAL && (
                  <Box className="kebab" sx={{ display: "flex" }}>
                    <KebabMenu id={p.id} label={`${t.moreActions}: ${pname}`} actions={[
                      { label: t.rename, onClick: () => setPedit({ id: p.id, mode: "rename" }) },
                      { label: t.deleteItem, onClick: () => setPedit({ id: p.id, mode: "delete" }) },
                    ]} />
                  </Box>
                )}
              </Box>
              <Collapse open={expanded}>
                <List dense disablePadding aria-label={pname} sx={{ ml: "18px", pl: 1.5, mt: 0.25, borderLeft: 1, borderColor: "divider" }}>
                  {rows.map((s) => sedit?.id === s.id ? (
                    <Box key={s.id} component="li" sx={{ listStyle: "none" }}>
                      {sedit.mode === "rename"
                        ? <InlineRename value={s.title} label={t.newName} onCancel={() => sdone(s.id)} onSave={(v) => { store.renameSession(s.id, v); sdone(s.id); }} />
                        : <InlineConfirm text={t.deleteChatConfirm} note={t.deleteChatMemoryNote} onCancel={() => sdone(s.id)} onConfirm={() => { if (runningId === s.id) stopRun(); store.deleteSession(s.id); sdone(s.id); }} />}
                    </Box>
                  ) : (
                    <Box key={s.id} component="li" sx={{ display: "flex", alignItems: "center", position: "relative", listStyle: "none", ...reveal }}>
                      <ListItemButton selected={s.id === activeId} aria-current={s.id === activeId ? "true" : undefined} onClick={() => { setActive(s.id); onPick?.(); goChat(); }}
                        sx={{ ...coarse(36), borderRadius: 1.2, gap: 1, minWidth: 0, px: 1 }}>
                        <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.8125rem" }}>{s.title || t.untitled}</Typography>
                        {s.id === runningId && <Box role="img" aria-label={t.running} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />}
                        <Typography className="when" component="span" sx={{ fontSize: "0.75rem", color: "text.secondary", flexShrink: 0, minWidth: 28, textAlign: "right" }}>{ago(s.updatedAt, lang)}</Typography>
                      </ListItemButton>
                      <Box className="kebab" sx={{ display: "flex" }}>
                        <SessionMenu kid={"t-" + s.id} session={s} onRename={() => setSedit({ id: s.id, mode: "rename" })} onDelete={() => setSedit({ id: s.id, mode: "delete" })} />
                      </Box>
                    </Box>
                  ))}
                  {!rows.length && !q && <Typography component="li" sx={{ listStyle: "none", px: 1, py: 0.75, fontSize: "0.8125rem", color: "text.secondary" }}>{t.noProjectSessions}</Typography>}
                  {!q && (
                    <Box component="li" sx={{ listStyle: "none" }}>
                      <Button fullWidth color="inherit" startIcon={<AddRoundedIcon />} onClick={() => newIn(p.id)}
                        sx={{ justifyContent: "flex-start", ...coarse(36), px: 1, borderRadius: 1.2, fontWeight: 400, fontSize: "0.8125rem", color: "text.secondary", "& .MuiSvgIcon-root": { fontSize: 18 } }}>{t.newSessionIn}</Button>
                    </Box>
                  )}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box></Collapse>
    </Box>
  );
}
