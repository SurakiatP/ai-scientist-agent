"use client";
import { useEffect } from "react";
import { Alert, Box, Button, Snackbar, Tooltip } from "@mui/material";
import { dismissNotice, startSync, undoDelete, useSync } from "@/lib/sync";
import { useHydrated } from "@/lib/history";
import { useT } from "@/lib/prefs";

// Starts the sync layer once and owns the two calm, non-blocking messages: "changed by someone else" and "moved to trash, undo".
export function SyncLayer() {
  const t = useT();
  const notice = useSync((s) => s.notice), at = useSync((s) => s.noticeAt), undo = useSync((s) => s.undo);
  useEffect(() => { void startSync(); }, []);
  const text = notice === "conflict" ? t.noticeConflict : notice === "remote" ? t.noticeRemote : notice === "queueFull" ? t.noticeQueueFull : "";
  return (
    <>
      <Snackbar key={at} open={!!notice} autoHideDuration={notice === "queueFull" ? 10000 : 6000} onClose={(_, r) => { if (r !== "clickaway") dismissNotice(); }} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} sx={{ mb: 9 }}>
        <Alert severity={notice === "queueFull" ? "warning" : "info"} variant="outlined" onClose={dismissNotice} slotProps={{ closeButton: { "aria-label": t.dismiss } }} sx={{ bgcolor: "background.paper", alignItems: "center" }}>{text}</Alert>
      </Snackbar>
      <Snackbar key={undo?.at} open={!!undo} autoHideDuration={8000} onClose={(_, r) => { if (r !== "clickaway") useSync.setState({ undo: null }); }} message={t.deletedToTrash} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ content: { sx: { bgcolor: "background.paper", color: "text.primary", border: 1, borderColor: "divider", boxShadow: 6 } } }}
        action={<Button color="primary" onClick={() => void undoDelete()} sx={{ minHeight: 44 }}>{t.undo}</Button>} />
    </>
  );
}

// Tiny dot + label in the sidebar footer. aria-live announces state changes only (the text node changes when the state does).
export function SyncChip() {
  const t = useT();
  const hydrated = useHydrated();
  const status = useSync((s) => s.status), pending = useSync((s) => s.pending);
  const st = hydrated ? status : "disabled";
  const label = st === "disabled" ? t.syncLocal : st === "connecting" ? t.syncConnecting
    : st === "offline" ? (pending ? t.syncOffline.replace("{n}", String(pending)) : t.syncOfflineNone)
    : pending ? t.syncSyncing.replace("{n}", String(pending)) : t.syncOnline;
  const tip = st === "offline" ? t.syncTipOffline : st === "disabled" ? t.syncTipLocal : t.syncTipOnline;
  const dot = st === "offline" ? "evidence.unverified" : st === "disabled" || st === "connecting" ? "text.secondary" : "evidence.verified";
  return (
    <Tooltip title={tip} placement="top-start" enterDelay={600}>
      <Box role="status" aria-live="polite" aria-label={`${t.syncStatus}: ${label}`} tabIndex={0}
        sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.25, minHeight: 32, borderRadius: 1.2, fontSize: "0.75rem", color: "text.secondary", minWidth: 0, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 } }}>
        <Box aria-hidden component="span" sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: dot, ...(st === "connecting" && { opacity: 0.6 }) }} />
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</Box>
      </Box>
    </Tooltip>
  );
}
