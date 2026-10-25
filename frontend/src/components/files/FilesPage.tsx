"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Chip, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { UI } from "@/lib/config";
import { ANALYZABLE, downloadUrl, fetchMeta, FileApiError, registerUpload, useAttach, useFilesStore, type FileEntry } from "@/lib/files";
import { useHydrated } from "@/lib/history";
import { enterRise } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { UploadError, uploadFile } from "@/lib/sse";
import { focusKebab, KebabMenu, type MenuAction } from "@/components/shell/SessionMenu";
import { projectName } from "@/components/shell/ProjectSwitcher";
import { DeleteDialog, PreviewDialog, RenameDialog } from "./FileDialogs";

const ACCEPT = ".csv,.xlsx,.parquet,.json";
const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
type Dialog = { kind: "preview" | "rename" | "delete"; id: string } | null;
// ok: the server has it. missing: it answered 404. A network/503 failure stays unknown, never "missing".
type Check = "ok" | "missing";

export function FilesPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const hydrated = useHydrated();
  const router = useRouter();
  const files = useFilesStore((s) => s.files);
  const projects = useChatStore((s) => s.projects);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [upload, setUpload] = useState<{ busy: boolean; err: string }>({ busy: false, err: "" });
  const picker = useRef<HTMLInputElement>(null);

  // Verify each entry against the server once per page visit (a few at a time).
  const checked = useRef(new Set<string>());
  useEffect(() => {
    if (!hydrated) return;
    const ac = new AbortController();
    const todo = files.map((f) => f.id).filter((id) => !checked.current.has(id));
    todo.forEach((id) => checked.current.add(id));
    const worker = async () => {
      for (let id = todo.shift(); id && !ac.signal.aborted; id = todo.shift()) {
        try {
          const m = await fetchMeta(id, ac.signal);
          setChecks((c) => ({ ...c, [id]: "ok" }));
          const cur = useFilesStore.getState().files.find((x) => x.id === id);
          if (cur && cur.name !== m.name) useFilesStore.getState().rename(id, m.name); // renamed elsewhere
        } catch (e) {
          if (e instanceof FileApiError && e.status === 404) setChecks((c) => ({ ...c, [id]: "missing" }));
          else if (!ac.signal.aborted) checked.current.delete(id); // retry on the next change, not shown as missing
        }
      }
    };
    void Promise.all([worker(), worker(), worker(), worker()]);
    return () => ac.abort();
  }, [hydrated, files]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => [...files].sort((a, b) => b.createdAt - a.createdAt).filter((f) => !q || f.name.toLowerCase().includes(q)), [files, q]);
  const pname = (f: FileEntry) => { const p = projects.find((x) => x.id === f.projectId) ?? projects.find((x) => x.id === PERSONAL)!; return projectName(p, t); };
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const close = (id: string) => { setDialog(null); focusKebab(id); };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || upload.busy) return;
    setUpload({ busy: true, err: "" });
    try {
      const up = await uploadFile(f, new AbortController().signal);
      registerUpload(up, useChatStore.getState().activeProjectId);
      checked.current.add(up.id);
      setChecks((c) => ({ ...c, [up.id]: "ok" }));
      setUpload({ busy: false, err: "" });
    } catch (e) {
      setUpload({ busy: false, err: e instanceof UploadError && e.message ? e.message : t.uploadFailed });
    }
  };
  const analyze = (f: FileEntry) => {
    useChatStore.getState().newSession(f.projectId);
    useAttach.setState({ file: { id: f.id, name: f.name, size: f.size } });
    router.push("/chat");
  };
  const download = (f: FileEntry) => { const a = document.createElement("a"); a.href = downloadUrl(f.id); a.download = f.name; document.body.append(a); a.click(); a.remove(); };
  const actions = (f: FileEntry): MenuAction[] => {
    const others = projects.filter((p) => p.id !== f.projectId);
    return [
      { label: t.filePreview, onClick: () => setDialog({ kind: "preview", id: f.id }) },
      { label: t.download, onClick: () => download(f) },
      { label: t.rename, onClick: () => setDialog({ kind: "rename", id: f.id }) },
      ...(ANALYZABLE.includes(f.kind) ? [{ label: t.fileAnalyze, onClick: () => analyze(f) }] : []),
      ...(others.length ? [{ label: t.moveTo, header: true, onClick: () => {} }] : []),
      ...others.map((p) => ({ key: p.id, label: projectName(p, t), onClick: () => useFilesStore.getState().move(f.id, p.id) })),
      { label: t.deleteItem, onClick: () => setDialog({ kind: "delete", id: f.id }) },
    ];
  };
  const open = dialog ? files.find((f) => f.id === dialog.id) : undefined;
  const missing = (id: string) => setChecks((c) => ({ ...c, [id]: "missing" }));
  const uploadBtn = (
    <Button variant="outlined" startIcon={<UploadFileRoundedIcon />} disabled={upload.busy} onClick={() => picker.current?.click()} sx={{ minHeight: 44, borderRadius: 2, borderColor: "primary.main" }}>
      {upload.busy ? t.uploadingFile : t.filesUpload}
    </Button>
  );
  const cell = { py: 1, borderColor: "divider" } as const;
  const hideSm = { display: { xs: "none", md: "table-cell" } } as const;

  return (
    <Box component="main" id="main" sx={{ maxWidth: 1000, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, md: 3 } }}>
      <input ref={picker} type="file" accept={ACCEPT} hidden onChange={onPick} />
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2 }}>
        <Typography component="h1" sx={{ flex: "1 1 auto", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.01em" }}>{t.files}</Typography>
        {hydrated && files.length > 0 && uploadBtn}
      </Box>
      {upload.err && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{upload.err}</Alert>}
      {!hydrated ? null : files.length === 0 ? (
        <Box sx={{ ...enterRise, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1.5, py: 8, px: 2, border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 4 }}>
          <FolderCopyOutlinedIcon aria-hidden sx={{ fontSize: 40, color: "primary.main" }} />
          <Typography component="h2" sx={{ fontSize: "1.125rem", fontWeight: 600 }}>{t.filesEmptyTitle}</Typography>
          <Typography sx={{ maxWidth: 420, color: "text.secondary" }}>{t.filesEmptyBody}</Typography>
          {uploadBtn}
        </Box>
      ) : (
        <>
          <TextField size="small" type="search" fullWidth placeholder={t.filesSearch} value={query} onChange={(e) => setQuery(e.target.value)}
            sx={{ mb: 2, maxWidth: 420, "& .MuiOutlinedInput-root": { ...UI.row, borderRadius: 2 } }}
            slotProps={{ htmlInput: { "aria-label": t.filesSearch }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
          {rows.length === 0 ? <Typography role="status" sx={{ color: "text.secondary" }}>{t.filesNoMatch}</Typography> : (
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
              <Table aria-label={t.files}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...cell, fontWeight: 700 }}>{t.colName}</TableCell>
                    <TableCell sx={{ ...cell, ...hideSm, fontWeight: 700 }}>{t.colType}</TableCell>
                    <TableCell sx={{ ...cell, ...hideSm, fontWeight: 700 }}>{t.colSize}</TableCell>
                    <TableCell sx={{ ...cell, ...hideSm, fontWeight: 700 }}>{t.colDate}</TableCell>
                    <TableCell sx={{ ...cell, ...hideSm, fontWeight: 700 }}>{t.colProject}</TableCell>
                    <TableCell align="right" sx={{ ...cell, fontWeight: 700, width: 56 }}><Box component="span" sx={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t.colActions}</Box></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((f) => (
                    <TableRow key={f.id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                      <TableCell sx={{ ...cell, maxWidth: { xs: 0, md: 360 }, width: { xs: "100%", md: "auto" } }}>
                        <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", overflowWrap: "anywhere" }}>{f.name}</Typography>
                        <Typography sx={{ display: { xs: "block", md: "none" }, fontSize: "0.8125rem", color: "text.secondary" }}>
                          {`${f.kind.toUpperCase()} · ${size(f.size)} · ${date(f.createdAt)} · ${pname(f)}`}
                        </Typography>
                        {checks[f.id] === "missing" && (
                          <Typography role="status" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5, fontSize: "0.8125rem", color: "error.main" }}>
                            <ReportProblemOutlinedIcon aria-hidden sx={{ fontSize: 16 }} />{t.fileMissing}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cell, ...hideSm }}><Chip size="small" variant="outlined" label={f.kind.toUpperCase()} sx={{ fontWeight: 600 }} /></TableCell>
                      <TableCell sx={{ ...cell, ...hideSm, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{size(f.size)}</TableCell>
                      <TableCell sx={{ ...cell, ...hideSm, whiteSpace: "nowrap" }}>{date(f.createdAt)}</TableCell>
                      <TableCell sx={{ ...cell, ...hideSm }}><Chip size="small" label={pname(f)} sx={{ maxWidth: 160 }} /></TableCell>
                      <TableCell align="right" sx={{ ...cell, whiteSpace: "nowrap" }}>
                        {checks[f.id] === "missing"
                          ? <Button size="small" color="error" onClick={() => useFilesStore.getState().remove(f.id)} sx={{ minHeight: 44 }}>{t.fileRemoveEntry}</Button>
                          : <KebabMenu id={f.id} label={`${t.fileActions}: ${f.name}`} actions={actions(f)} />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
      {open && dialog?.kind === "preview" && <PreviewDialog file={open} onClose={() => close(open.id)} onMissing={() => missing(open.id)} />}
      {open && dialog?.kind === "rename" && <RenameDialog file={open} onClose={() => close(open.id)} onMissing={() => missing(open.id)} />}
      {open && dialog?.kind === "delete" && <DeleteDialog file={open} onClose={() => close(open.id)} />}
    </Box>
  );
}
