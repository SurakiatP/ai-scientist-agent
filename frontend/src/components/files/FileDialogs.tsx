"use client";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { checkName, deleteFile, fetchPreview, FileApiError, renameFile, useFilesStore, type FileEntry, type Preview } from "@/lib/files";
import { srOnly } from "@/lib/config";
import { skeletonBar } from "@/lib/motion";
import { useT } from "@/lib/prefs";
import type { Strings } from "@/lib/strings";

// One user-facing sentence per failure; the server's own English detail is never shown.
export const apiMessage = (e: unknown, t: Strings) =>
  !(e instanceof FileApiError) ? t.fileFailed : e.status === 0 ? t.fileNetwork : e.status === 503 ? t.fileStorageDown : e.status === 404 ? t.fileMissing : t.fileFailed;
const previewMessage = (e: unknown, t: Strings) =>
  e instanceof FileApiError && e.status === 415 ? t.previewUnavailable : e instanceof FileApiError && e.status === 413 ? t.previewTooLarge : e instanceof FileApiError && e.status === 422 ? t.previewUnreadable : apiMessage(e, t);

function Frame({ id, title, onClose, children, actions, maxWidth = 480 }: { id: string; title: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode; maxWidth?: number }) {
  const t = useT();
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={false} aria-labelledby={id} slotProps={{ paper: { sx: { maxWidth, m: { xs: 1.5, sm: 4 }, width: { xs: "calc(100% - 24px)", sm: "100%" }, borderRadius: 3, border: 1, borderColor: "divider", backgroundImage: "none", bgcolor: "background.default" } } }}>
      <DialogTitle id={id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, pb: 1, fontSize: "1.125rem", fontWeight: 700 }}>
        <Box component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{title}</Box>
        <IconButton aria-label={t.close} onClick={onClose} sx={{ width: 44, height: 44, flexShrink: 0 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>{actions}</DialogActions>}
    </Dialog>
  );
}

export function PreviewDialog({ file, onClose, onMissing }: { file: FileEntry; onClose: () => void; onMissing: () => void }) {
  const t = useT();
  const [state, setState] = useState<{ p: Preview } | { err: string } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetchPreview(file.id, ac.signal).then((p) => setState({ p }), (e) => {
      if (ac.signal.aborted) return;
      if (e instanceof FileApiError && e.status === 404) onMissing();
      setState({ err: previewMessage(e, t) });
    });
    return () => ac.abort();
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = state && "p" in state ? state.p : null;
  return (
    <Frame id="file-preview-title" title={`${t.filePreview}: ${file.name}`} onClose={onClose} maxWidth={960}>
      {!state && (
        <Box>
          <Box role="status" sx={srOnly}>{t.previewLoading}</Box>
          <Box aria-hidden sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Box key={i} sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, px: 2, height: i === 0 ? 40 : 33, alignItems: "center", borderTop: i ? 1 : 0, borderColor: "divider", bgcolor: i === 0 ? "action.hover" : undefined }}>
                {[0, 1, 2].map((c) => <Box key={c} sx={{ ...skeletonBar(i + c), height: i === 0 ? 12 : 10, width: i === 0 ? "50%" : `${90 - ((i + c) % 3) * 20}%` }} />)}
              </Box>
            ))}
          </Box>
        </Box>
      )}
      {state && "err" in state && <Alert severity="info" role="status">{state.err}</Alert>}
      {p && (p.columns.length === 0 ? <Alert severity="info" role="status">{t.previewEmpty}</Alert> : (
        <>
          <Box role="region" aria-label={`${t.filePreview}: ${file.name}`} tabIndex={0} sx={{ overflow: "auto", maxHeight: "55vh", border: 1, borderColor: "divider", borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>{p.columns.map((c, i) => <TableCell key={i} sx={{ fontWeight: 700, whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", bgcolor: "background.paper" }} title={c}>{c}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {p.rows.map((r, ri) => (
                  <TableRow key={ri}>{p.columns.map((_, ci) => <TableCell key={ci} sx={{ whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={r[ci]}>{r[ci] ?? ""}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography role="status" sx={{ mt: 1, fontSize: "0.8125rem", color: "text.secondary" }}>
            {p.total !== null && p.truncated ? t.previewShownOf.replace("{n}", String(p.rows.length)).replace("{total}", String(p.total)) : p.truncated ? t.previewShown.replace("{n}", String(p.rows.length)) : ""}
          </Typography>
        </>
      ))}
    </Frame>
  );
}

export function RenameDialog({ file, onClose, onMissing }: { file: FileEntry; onClose: () => void; onMissing: () => void }) {
  const t = useT();
  const [v, setV] = useState(file.name), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    const c = checkName(v, file.kind);
    if ("problem" in c) {
      setErr(c.problem === "empty" ? t.nameErrEmpty : c.problem === "long" ? t.nameErrLong : c.problem === "chars" ? t.nameErrChars : t.nameErrExt.replace("{ext}", file.kind));
      return;
    }
    setBusy(true); setErr("");
    try {
      const m = await renameFile(file.id, c.name);
      useFilesStore.getState().rename(file.id, m.name);
      onClose();
    } catch (e) {
      if (e instanceof FileApiError && e.status === 404) onMissing();
      setErr(e instanceof FileApiError && e.status === 422 ? t.nameErrExt.replace("{ext}", file.kind) : apiMessage(e, t));
      setBusy(false);
    }
  };
  return (
    <Frame id="file-rename-title" title={t.renameFileTitle} onClose={onClose}
      actions={<><Button color="inherit" onClick={onClose} sx={{ minHeight: 44 }}>{t.cancel}</Button><Button variant="contained" disabled={busy} onClick={submit} sx={{ minHeight: 44 }}>{t.saveName}</Button></>}>
      <TextField autoFocus fullWidth margin="dense" label={t.fileNameLabel} value={v} error={!!err} helperText={err || undefined}
        onChange={(e) => { setV(e.target.value); setErr(""); }} onFocus={(e) => e.target.select()}
        slotProps={{ htmlInput: { maxLength: 200, "aria-describedby": err ? "file-rename-err" : undefined }, formHelperText: { id: "file-rename-err", role: "alert" } }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} />
    </Frame>
  );
}

export function DeleteDialog({ file, onClose, onRemove = (id) => useFilesStore.getState().remove(id) }: { file: FileEntry; onClose: () => void; onRemove?: (id: string) => void }) {
  const t = useT();
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try { await deleteFile(file.id); } catch (e) {
      // 404: already gone from the server, so only the local entry is left to remove. Anything else: keep the entry and say why.
      if (!(e instanceof FileApiError && e.status === 404)) { setErr(apiMessage(e, t)); setBusy(false); return; }
    }
    onRemove(file.id);
    onClose();
  };
  return (
    <Frame id="file-delete-title" title={t.deleteFileTitle} onClose={onClose}
      actions={<><Button color="inherit" autoFocus onClick={onClose} sx={{ minHeight: 44 }}>{t.cancel}</Button><Button color="error" variant="contained" disabled={busy} onClick={go} sx={{ minHeight: 44 }}>{t.deleteItem}</Button></>}>
      <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{file.name}</Typography>
      <Typography sx={{ mt: 0.5, color: "text.secondary" }}>{t.deleteFileBody}</Typography>
      {err && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{err}</Alert>}
    </Frame>
  );
}
