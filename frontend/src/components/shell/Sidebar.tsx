"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EditSquareIcon from "@mui/icons-material/EditSquare";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import { create } from "zustand";
import { UI } from "@/lib/config";
import { useHydrated } from "@/lib/history";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { useGoChat } from "@/lib/nav";
import { usePrefs, useT } from "@/lib/prefs";
import { focusKebab, InlineConfirm, InlineRename, KebabMenu } from "./SessionMenu";
import { projectName, selectProject } from "./ProjectSwitcher";
import { SessionList } from "./SessionList";

// Opened here, rendered by the settings dialog (T6).
export const useSettingsOpen = create<{ open: boolean; set: (o: boolean) => void }>()((set) => ({ open: false, set: (open) => set({ open }) }));

// Brand mark: a small node cluster (research graph). Colours follow the theme.
export const Mark = () => (
  <Box component="svg" viewBox="0 0 32 32" aria-hidden="true" sx={{ width: 28, height: 28, flexShrink: 0, color: "primary.main" }}>
    <g stroke="currentColor" strokeWidth="1.3" opacity=".55" fill="none"><path d="M9 20l7-9M16 11l8 4M9 20l9 5M24 15l-6 10" /></g>
    <g fill="currentColor"><circle cx="9" cy="20" r="4" /><circle cx="16" cy="11" r="3" /><circle cx="24" cy="15" r="2.4" /><circle cx="18" cy="25" r="2" opacity=".7" /><circle cx="6" cy="9" r="1.5" opacity=".5" /></g>
  </Box>
);

const rowSx = { justifyContent: "flex-start", gap: 1.5, ...UI.row, px: 1.25, borderRadius: 1.2, fontWeight: 400, fontSize: "0.875rem", minWidth: 0, "& .MuiSvgIcon-root": { fontSize: 20 } } as const;

export function Sidebar({ onPick, onCollapse }: { onPick?: () => void; onCollapse?: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang), setLang = usePrefs((s) => s.setLang);
  const hydrated = useHydrated();
  const goChat = useGoChat();
  const onFiles = usePathname() === "/files";
  const newSession = useChatStore((s) => s.newSession), setActive = useChatStore((s) => s.setActive), addProject = useChatStore((s) => s.addProject);
  const storeProjects = useChatStore((s) => s.projects), storeActive = useChatStore((s) => s.activeProjectId), storeSessions = useChatStore((s) => s.sessions), store = useChatStore.getState();
  const [pedit, setPedit] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const projects = hydrated ? storeProjects : storeProjects.slice(0, 1);
  const activeProjectId = hydrated ? storeActive : PERSONAL;
  const sessions = hydrated ? storeSessions : [];
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function newChat() {
    const empty = sessions.find((s) => s.projectId === activeProjectId && !s.turns.length);
    if (empty) setActive(empty.id); else newSession(activeProjectId);
    onPick?.();
    goChat();
    setTimeout(() => document.getElementById("composer")?.focus(), 0); // composer lands in T4
  }

  return (
    <Stack component="nav" aria-label={t.sidebar} sx={{ height: "100%", p: 1.25, gap: 1, bgcolor: "surface.shell", overflowY: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 0.5, minHeight: 44 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Mark /><Typography sx={{ fontWeight: 600, fontSize: "1.0625rem", letterSpacing: "-0.01em" }}>{t.brand}</Typography>
        </Stack>
        {onCollapse && (
          <IconButton aria-label={t.collapseSidebar} onClick={onCollapse} sx={{ color: "text.secondary" }}><ViewSidebarOutlinedIcon /></IconButton>
        )}
      </Stack>
      <Button id="new-chat" variant="outlined" startIcon={<EditSquareIcon />} onClick={newChat}
        sx={{ justifyContent: "flex-start", gap: 0.5, px: 1.5, minHeight: { xs: 44, md: 40 }, borderRadius: 1.5, fontSize: "0.875rem", borderColor: "primary.main", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 12%, transparent)", "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 20%, transparent)", borderColor: "primary.main" } }}>
        {t.newChat}
      </Button>
      <Box>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", pl: 1.25, pt: 0.5 }}>
          <Typography component="h2" sx={{ fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary" }}>{t.projects}</Typography>
          <IconButton size="small" aria-label={t.newProject} aria-expanded={adding} onClick={() => setAdding(!adding)} sx={{ color: "text.primary" }}>
            <Box sx={{ display: "grid", placeItems: "center", width: 22, height: 22, border: 1, borderColor: "divider", borderRadius: "50%" }}><AddRoundedIcon sx={{ fontSize: 16 }} /></Box>
          </IconButton>
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
        {projects.map((p) => pedit?.id === p.id ? (
          <Box key={p.id} sx={{ px: 0.5 }}>
            {pedit.mode === "rename"
              ? <InlineRename value={p.name} label={t.projectName} onCancel={() => { setPedit(null); focusKebab(p.id); }} onSave={(v) => { store.renameProject(p.id, v); setPedit(null); focusKebab(p.id); }} />
              : <InlineConfirm text={t.deleteProjectConfirm} onCancel={() => { setPedit(null); focusKebab(p.id); }} onConfirm={() => { store.deleteProject(p.id); setPedit(null); focusKebab(p.id); }} />}
          </Box>
        ) : (
          <Box key={p.id} sx={{ display: "flex", alignItems: "center" }}>
            <Button fullWidth color="inherit" aria-current={p.id === activeProjectId ? "true" : undefined} startIcon={<FolderOpenOutlinedIcon />}
              onClick={() => selectProject(p.id)}
              sx={{ ...rowSx, fontWeight: p.id === activeProjectId ? 600 : 400, bgcolor: p.id === activeProjectId ? "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)" : "transparent", "& .MuiButton-startIcon": { mr: 0 } }}>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectName(p, t)}</Box>
            </Button>
            {p.id !== PERSONAL && (
              <KebabMenu id={p.id} label={`${t.moreActions}: ${projectName(p, t)}`} actions={[
                { label: t.rename, onClick: () => setPedit({ id: p.id, mode: "rename" }) },
                { label: t.deleteItem, onClick: () => setPedit({ id: p.id, mode: "delete" }) },
              ]} />
            )}
          </Box>
        ))}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Typography component="h2" sx={{ px: 1.25, pb: 0.5, fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary" }}>{t.recentShort}</Typography>
        <TextField size="small" type="search" placeholder={t.searchChats} value={query} onChange={(e) => setQuery(e.target.value)} fullWidth
          sx={{ mb: 0.5, "& .MuiOutlinedInput-root": { ...UI.row, borderRadius: 1.5, fontSize: "0.875rem" }, "& fieldset": { borderColor: "transparent" }, "& .MuiOutlinedInput-root:hover fieldset": { borderColor: "divider" } }}
          slotProps={{ htmlInput: { "aria-label": t.searchChats }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
        <SessionList query={query} onPick={() => { onPick?.(); goChat(); }} />
      </Box>
      <Stack sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
        <Button component={Link} href="/files" color="inherit" startIcon={<FolderCopyOutlinedIcon />} onClick={() => onPick?.()} aria-current={onFiles ? "page" : undefined}
          sx={{ ...rowSx, bgcolor: onFiles ? "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)" : "transparent", fontWeight: onFiles ? 600 : 400 }}>{t.files}</Button>
        <Button color="inherit" startIcon={<SettingsOutlinedIcon />} endIcon={<ChevronRightRoundedIcon />} onClick={() => useSettingsOpen.getState().set(true)}
          sx={{ ...rowSx, "& .MuiButton-endIcon": { ml: "auto" } }}>{t.settings}</Button>
        <Button color="inherit" startIcon={<LanguageRoundedIcon />} endIcon={<ChevronRightRoundedIcon />} onClick={() => setLang(lang === "en" ? "th" : "en")}
          sx={{ ...rowSx, "& .MuiButton-endIcon": { ml: 0.5 } }}>
          {t.language}<Box component="span" sx={{ ml: "auto", color: "text.secondary" }}>{t.langName}</Box>
        </Button>
      </Stack>
    </Stack>
  );
}
