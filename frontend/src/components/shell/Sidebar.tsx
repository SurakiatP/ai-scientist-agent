"use client";
import { useState } from "react";
import { Box, Button, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { create } from "zustand";
import { useHydrated } from "@/lib/history";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { InlineConfirm, InlineRename, KebabMenu } from "./SessionMenu";
import { projectName, selectProject } from "./ProjectSwitcher";
import { SessionList } from "./SessionList";

// Opened here, rendered by the settings dialog (T6).
export const useSettingsOpen = create<{ open: boolean; set: (o: boolean) => void }>()((set) => ({ open: false, set: (open) => set({ open }) }));

// CSS-only brand mark: a citation bracket around a check.
const Mark = () => (
  <Box component="svg" viewBox="0 0 28 28" aria-hidden="true" sx={{ width: 28, height: 28, flexShrink: 0, color: "primary.main" }}>
    <path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5V8M20 4h2.5A1.5 1.5 0 0 1 24 5.5V8M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20M8 24H5.5A1.5 1.5 0 0 1 4 22.5V20" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    <path d="M10.5 14.2l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Box>
);

export function Sidebar({ onPick }: { onPick?: () => void }) {
  const t = useT();
  const hydrated = useHydrated();
  const store = useChatStore();
  const { newSession, setActive, addProject } = store;
  const [pedit, setPedit] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const projects = hydrated ? store.projects : store.projects.slice(0, 1);
  const activeProjectId = hydrated ? store.activeProjectId : PERSONAL;
  const sessions = hydrated ? store.sessions : [];
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function newChat() {
    const empty = sessions.find((s) => s.projectId === activeProjectId && !s.turns.length);
    if (empty) setActive(empty.id); else newSession(activeProjectId);
    onPick?.();
    setTimeout(() => document.getElementById("composer")?.focus(), 0); // composer lands in T4
  }

  return (
    <Stack component="nav" aria-label={t.sidebar} sx={{ height: "100%", p: 1.5, gap: 1.5, bgcolor: "surface.shell", overflowY: "auto" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 0.5 }}>
        <Mark /><Typography sx={{ fontWeight: 700 }}>{t.brand}</Typography>
      </Stack>
      <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={newChat}>{t.newChat}</Button>
      <TextField size="small" type="search" placeholder={t.searchChats} value={query} onChange={(e) => setQuery(e.target.value)}
        slotProps={{ htmlInput: { "aria-label": t.searchChats }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
      <Box>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Button color="inherit" size="small" aria-expanded={open} onClick={() => setOpen(!open)}
            endIcon={<ExpandMoreRoundedIcon sx={{ transform: open ? "none" : "rotate(-90deg)" }} />} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t.projects}</Button>
          <IconButton size="small" aria-label={t.newProject} onClick={() => setAdding(!adding)}><AddRoundedIcon fontSize="small" /></IconButton>
        </Stack>
        {adding && (
          <TextField size="small" fullWidth autoFocus placeholder={t.newProject} value={name} onChange={(e) => { setName(e.target.value); setFull(false); }} error={full} helperText={full ? t.projectLimit : undefined}
            slotProps={{ htmlInput: { "aria-label": t.projectName, maxLength: 100 } }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.stopPropagation(); setAdding(false); setName(""); setFull(false); }
              if (e.key !== "Enter" || e.nativeEvent.isComposing || !name.trim()) return;
              const id = addProject(name);
              if (!id) return setFull(true);
              selectProject(id);
              setAdding(false); setName("");
            }} />
        )}
        {open && projects.map((p) => pedit?.id === p.id ? (
          <Box key={p.id} sx={{ px: 0.5 }}>
            {pedit.mode === "rename"
              ? <InlineRename value={p.name} label={t.projectName} onCancel={() => setPedit(null)} onSave={(v) => { store.renameProject(p.id, v); setPedit(null); }} />
              : <InlineConfirm text={t.deleteProjectConfirm} onCancel={() => setPedit(null)} onConfirm={() => { store.deleteProject(p.id); setPedit(null); }} />}
          </Box>
        ) : (
          <Box key={p.id} sx={{ display: "flex", alignItems: "center" }}>
            <Button fullWidth color="inherit" aria-current={p.id === activeProjectId ? "true" : undefined}
              onClick={() => selectProject(p.id)}
              sx={{ justifyContent: "flex-start", minWidth: 0, minHeight: 44, fontWeight: p.id === activeProjectId ? 700 : 400, bgcolor: p.id === activeProjectId ? "action.selected" : "transparent" }}>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectName(p, t)}</Box>
            </Button>
            {p.id !== PERSONAL && (
              <KebabMenu label={`${t.moreActions}: ${projectName(p, t)}`} actions={[
                { label: t.rename, onClick: () => setPedit({ id: p.id, mode: "rename" }) },
                { label: t.deleteItem, onClick: () => setPedit({ id: p.id, mode: "delete" }) },
              ]} />
            )}
          </Box>
        ))}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Typography sx={{ px: 1.25, fontSize: "0.75rem", fontWeight: 700, color: "text.secondary" }}>{t.recents}</Typography>
        <SessionList query={query} onPick={onPick} />
      </Box>
      <Button color="inherit" startIcon={<SettingsOutlinedIcon />} onClick={() => useSettingsOpen.getState().set(true)} sx={{ justifyContent: "flex-start", color: "text.secondary" }}>{t.settings}</Button>
    </Stack>
  );
}
