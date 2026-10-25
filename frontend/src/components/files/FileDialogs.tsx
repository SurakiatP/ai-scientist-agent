"use client";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { checkName, deleteFile, downloadUrl, fetchPresignedPreview, fetchPreview, FileApiError, presignFile, renameFile, useFilesStore, type FileEntry, type Preview } from "@/lib/files";
import { srOnly } from "@/lib/config";
import { skeletonBar } from "@/lib/motion";
import { useSync } from "@/lib/sync";
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

const TABULAR = ["csv", "json"];
const sizeText = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

function PreviewSkeleton({ label }: { label: string }) {
  return (
    <Box>
      <Box role="status" sx={srOnly}>{label}</Box>
      <Box aria-hidden sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Box key={i} sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, px: 2, height: i === 0 ? 40 : 33, alignItems: "center", borderTop: i ? 1 : 0, borderColor: "divider", bgcolor: i === 0 ? "action.hover" : undefined }}>
            {[0, 1, 2].map((c) => <Box key={c} sx={{ ...skeletonBar(i + c), height: i === 0 ? 12 : 10, width: i === 0 ? "50%" : `${90 - ((i + c) % 3) * 20}%` }} />)}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function TablePreview({ p, name }: { p: Preview; name: string }) {
  const t = useT();
  if (p.columns.length === 0) return <Alert severity="info" role="status">{t.previewEmpty}</Alert>;
  return (
    <>
      <Box role="region" aria-label={`${t.filePreview}: ${name}`} tabIndex={0} sx={{ overflow: "auto", maxHeight: "55vh", border: 1, borderColor: "divider", borderRadius: 2 }}>
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
  );
}

type PState =
  | { s: "load" }
  | { s: "table"; p: Preview }
  | { s: "pdf"; url: string }
  | { s: "nobrowser"; url: string | null } // url = presigned attachment link; null = presign off, download via the proxy
  | { s: "err"; msg: string; retry: boolean };

// Preview goes browser -> MinIO through a short-lived presigned URL. The URL lives in this component's state only.
// If presigning is off or unreachable, csv/json fall back to the backend's table preview (the proxy).
export function PreviewDialog({ file, onClose, onMissing }: { file: FileEntry; onClose: () => void; onMissing: () => void }) {
  const t = useT();
  const [state, setState] = useState<PState>({ s: "load" });
  const [frameReady, setFrameReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    const fail = (e: unknown) => {
      if (ac.signal.aborted) return;
      if (e instanceof FileApiError && e.status === 404) onMissing();
      setState({ s: "err", msg: previewMessage(e, t), retry: false });
    };
    const proxy = () => fetchPreview(file.id, ac.signal).then((p) => !ac.signal.aborted && setState({ s: "table", p }), fail);
    presignFile(file.id, ac.signal).then(async (ps) => {
      if (ac.signal.aborted) return;
      if (ps.kind === "pdf" && ps.inline) { setState({ s: "pdf", url: ps.url }); return; }
      if (!TABULAR.includes(ps.kind)) { setState({ s: "nobrowser", url: ps.url }); return; }
      try {
        const p = await fetchPresignedPreview(ps.url, ps.kind, ac.signal);
        if (!ac.signal.aborted) setState({ s: "table", p });
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e instanceof FileApiError && e.status === 403) { setState({ s: "err", msg: t.previewExpired, retry: true }); return; }
        if (e instanceof FileApiError && (e.status === 413 || e.status === 422)) { fail(e); return; }
        await proxy(); // CORS blocked, storage unreachable from the browser, ...
      }
    }, async (e) => {
      if (ac.signal.aborted) return;
      if (e instanceof FileApiError && e.status === 404) { fail(e); return; }
      if (TABULAR.includes(file.kind)) await proxy();
      else if (e instanceof FileApiError && (e.status === 501 || e.status === 0 || e.status === 503)) setState({ s: "nobrowser", url: null });
      else fail(e);
    });
    return () => ac.abort();
  }, [file.id, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = `${t.filePreview}: ${file.name}`;
  return (
    <Frame id="file-preview-title" title={title} onClose={onClose} maxWidth={960}>
      {state.s === "load" && <PreviewSkeleton label={t.previewLoading} />}
      {state.s === "err" && (
        <Alert severity="info" role="status" action={state.retry ? <Button color="inherit" size="small" onClick={() => { setState({ s: "load" }); setFrameReady(false); setAttempt((n) => n + 1); }} sx={{ minHeight: 44 }}>{t.previewRetry}</Button> : undefined}>{state.msg}</Alert>
      )}
      {state.s === "table" && <TablePreview p={state.p} name={file.name} />}
      {state.s === "pdf" && (
        <Box>
          <Box sx={{ position: "relative", height: "65vh", border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "background.paper" }}>
            {!frameReady && <Box sx={{ position: "absolute", inset: 0, p: 2 }}><PreviewSkeleton label={t.previewLoading} /></Box>}
            {/* No sandbox attribute on purpose: Chrome refuses to render its PDF viewer inside a sandboxed frame. The origin is MinIO, not this app, and no referrer is sent. */}
            <iframe src={state.url} title={title} referrerPolicy="no-referrer" onLoad={() => setFrameReady(true)} style={{ width: "100%", height: "100%", border: 0 }} />
          </Box>
          <Button component="a" href={state.url} target="_blank" rel="noopener noreferrer" size="small" sx={{ mt: 1, minHeight: 44 }}>{t.previewOpenTab}</Button>
        </Box>
      )}
      {state.s === "nobrowser" && (
        <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 3, display: "grid", gap: 1.5, justifyItems: "start" }}>
          <Typography sx={{ fontWeight: 600 }}>{t.previewNoBrowser}</Typography>
          <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{`${file.name} · ${file.kind.toUpperCase()} · ${sizeText(file.size)}`}</Typography>
          <Button component="a" variant="outlined" href={state.url ?? downloadUrl(file.id)} download={file.name} rel="noopener noreferrer" sx={{ minHeight: 44 }}>{t.download}</Button>
        </Box>
      )}
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
  const shared = useSync((s) => s.status) !== "disabled"; // shared database: the file goes to the trash, the stored object is purged after 7 days
  const go = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try { if (!shared) await deleteFile(file.id); } catch (e) {
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
      <Typography sx={{ mt: 0.5, color: "text.secondary" }}>{shared ? t.deleteFileBodyTrash : t.deleteFileBody}</Typography>
      {err && <Alert severity="error" role="alert" sx={{ mt: 2 }}>{err}</Alert>}
    </Frame>
  );
}
