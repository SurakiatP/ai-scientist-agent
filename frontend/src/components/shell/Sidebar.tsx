"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Button, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EditSquareIcon from "@mui/icons-material/EditSquare";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { SyncChip } from "@/components/sync/SyncUI";
import { useSync } from "@/lib/sync";
import { refreshLoad, useLoad, watchLoad, type QueueStatus } from "@/lib/runs";
import { create } from "zustand";
import { srOnly, UI } from "@/lib/config";
import { useHydrated } from "@/lib/history";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { useGoChat } from "@/lib/nav";
import { useT } from "@/lib/prefs";
import { ProjectTree } from "./ProjectTree";
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

// How busy the server is: one quiet line. The shared poller runs only while this is mounted and the tab is visible;
// it also refreshes right after this tab submits, cancels or finishes a run, and when the shared store changes.
export function ServerLoad() {
  const t = useT();
  const on = useSync((s) => s.status !== "disabled" && s.status !== "connecting");
  const rev = useSync((s) => s.rev);
  const q = useLoad((s) => s.q);
  useEffect(() => (on ? watchLoad() : undefined), [on]);
  useEffect(() => { if (on) { const id = setTimeout(refreshLoad, 800); return () => clearTimeout(id); } }, [on, rev]);
  if (!on || !q?.research) return null;
  const line = (k: "serverLoad" | "serverLoadAnalysis", x: QueueStatus["research"]) => t[k].replace("{running}", String(x.running)).replace("{limit}", String(x.limit)).replace("{queued}", String(x.queued));
  const a = q.analysis && q.analysis.running + q.analysis.queued > 0 ? q.analysis : null;
  return (
    <Typography aria-live="off" sx={{ px: 1.25, pb: 0.5, fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
      <Box component="span" sx={srOnly}>{t.serverLoadLabel}: </Box>{line("serverLoad", q.research)}{a ? ` · ${line("serverLoadAnalysis", a)}` : ""}
    </Typography>
  );
}

export function Sidebar({ onPick, onCollapse }: { onPick?: () => void; onCollapse?: () => void }) {
  const t = useT();
  const hydrated = useHydrated();
  const goChat = useGoChat();
  const path = usePathname(), onFiles = path === "/files", onTrash = path === "/trash";
  const shared = useSync((s) => s.status) !== "disabled" && hydrated;
  const newSession = useChatStore((s) => s.newSession);
  const [query, setQuery] = useState("");

  function newChat() {
    // "New chat" always starts in Personal (switching the header and tree with it); the store reuses an existing blank chat there instead of piling up blanks.
    newSession(PERSONAL);
    onPick?.();
    goChat();
    setTimeout(() => document.getElementById("composer")?.focus(), 0); // composer lands in T4
  }

  return (
    <Stack component="nav" aria-label={t.sidebar} sx={{ height: "100%", p: 1.25, gap: 1, bgcolor: "surface.shell", overflowY: "auto" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 0.5, minHeight: 44 }}>
        {/* the brand is a link to the landing page too (same target as the home icon) */}
        <Stack component={Link} href="/" aria-label={`${t.brand}: ${t.goHome}`} onClick={() => onPick?.()} direction="row" spacing={1}
          sx={{ alignItems: "center", minHeight: 44, px: 0.5, mx: -0.5, borderRadius: 1.5, color: "text.primary", textDecoration: "none", "&:hover": { bgcolor: "action.hover" } }}>
          <Mark /><Typography component="span" sx={{ fontWeight: 600, fontSize: "1.0625rem", letterSpacing: "-0.01em" }}>{t.brand}</Typography>
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <IconButton component={Link} href="/" aria-label={t.goHome} title={t.goHome} onClick={() => onPick?.()} sx={{ color: "text.secondary" }}><HomeOutlinedIcon /></IconButton>
          {onCollapse && (
            <IconButton aria-label={t.collapseSidebar} onClick={onCollapse} sx={{ color: "text.secondary" }}><ViewSidebarOutlinedIcon /></IconButton>
          )}
        </Stack>
      </Stack>
      <Button id="new-chat" variant="outlined" startIcon={<EditSquareIcon />} onClick={newChat}
        sx={{ justifyContent: "flex-start", gap: 0.5, px: 1.5, minHeight: { xs: 44, md: 40 }, borderRadius: 1.5, fontSize: "0.875rem", borderColor: "primary.main", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 12%, transparent)", "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 20%, transparent)", borderColor: "primary.main" } }}>
        {t.newChat}
      </Button>
      <ProjectTree query={query} onPick={onPick} />
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Typography component="h2" sx={{ px: 1.25, pb: 0.5, fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary" }}>{t.recentShort}</Typography>
        <TextField size="small" type="search" placeholder={t.searchChats} value={query} onChange={(e) => setQuery(e.target.value)} fullWidth
          sx={{ mb: 0.5, "& .MuiOutlinedInput-root": { ...UI.row, borderRadius: 1.5, fontSize: "0.875rem" }, "& fieldset": { borderColor: "transparent" }, "& .MuiOutlinedInput-root:hover fieldset": { borderColor: "divider" } }}
          slotProps={{ htmlInput: { "aria-label": t.searchChats }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
        <SessionList query={query} onPick={() => { onPick?.(); goChat(); }} />
      </Box>
      <Stack sx={{ borderTop: 1, borderColor: "divider", pt: 1, flexShrink: 0 }}>
        <SyncChip />
        <ServerLoad />
        <Button component={Link} href="/files" color="inherit" startIcon={<FolderCopyOutlinedIcon />} onClick={() => onPick?.()} aria-current={onFiles ? "page" : undefined}
          sx={{ ...rowSx, bgcolor: onFiles ? "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)" : "transparent", fontWeight: onFiles ? 600 : 400 }}>{t.files}</Button>
        {shared && (
          <Button component={Link} href="/trash" color="inherit" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => onPick?.()} aria-current={onTrash ? "page" : undefined}
            sx={{ ...rowSx, bgcolor: onTrash ? "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)" : "transparent", fontWeight: onTrash ? 600 : 400 }}>{t.trashTitle}</Button>
        )}
        <Button color="inherit" startIcon={<SettingsOutlinedIcon />} endIcon={<ChevronRightRoundedIcon />} onClick={() => useSettingsOpen.getState().set(true)}
          sx={{ ...rowSx, "& .MuiButton-endIcon": { ml: "auto" } }}>{t.settings}</Button>
      </Stack>
    </Stack>
  );
}
