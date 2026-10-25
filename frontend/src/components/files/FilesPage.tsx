"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, Chip, InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery } from "@mui/material";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { srOnly, UI } from "@/lib/config";
import { ANALYZABLE, downloadUrl, fetchMeta, FileApiError, registerUpload, useAttach, useFilesStore, type FileEntry } from "@/lib/files";
import { useHydrated } from "@/lib/history";
import { canAnimate, enterRise, enterRow, EXIT_MS, leaveRow } from "@/lib/motion";
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
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useMediaQuery("(max-width:899.95px)"); // false in SSR/jsdom, so the table is the baseline
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const gone = useRef(new Set<string>());

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
  // Focus goes back to the row's menu button; if the row is going away it goes to the page heading instead.
  const close = (id: string) => { setDialog(null); if (gone.current.has(id)) heading.current?.focus(); else focusKebab(id); };
  const removeRow = (id: string) => {
    gone.current.add(id);
    if (!canAnimate()) { useFilesStore.getState().remove(id); return; }
    setLeaving((s) => new Set(s).add(id));
    setTimeout(() => { useFilesStore.getState().remove(id); setLeaving((s) => { const n = new Set(s); n.delete(id); return n; }); gone.current.delete(id); }, EXIT_MS);
  };

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
  const removeBtn = (f: FileEntry) => (
    <Button size="small" color="error" variant="outlined" onClick={() => { removeRow(f.id); heading.current?.focus(); }} sx={{ minHeight: 44, whiteSpace: "nowrap" }}>{t.fileRemoveEntry}</Button>
  );
  const rowMenu = (f: FileEntry) => (checks[f.id] === "missing" ? removeBtn(f) : <KebabMenu id={f.id} label={`${t.fileActions}: ${f.name}`} actions={actions(f)} />);
  const missingNote = (f: FileEntry) => checks[f.id] === "missing" && (
    <Typography role="status" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5, fontSize: "0.8125rem", color: "error.main" }}>
      <ReportProblemOutlinedIcon aria-hidden sx={{ fontSize: 16 }} />{t.fileMissing}
    </Typography>
  );
  const cell = { py: 1, px: 2, borderColor: "divider" } as const;
  const th = { ...cell, fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", whiteSpace: "nowrap", bgcolor: "action.hover" } as const;
  const hideLg = { display: { xs: "none", lg: "table-cell" } } as const;
  const rowSx = (f: FileEntry, i: number) => ({
    ...enterRow(i), transition: "background-color 120ms",
    "&:hover, &:focus-within": { bgcolor: "action.hover" },
    ...(checks[f.id] === "missing" ? { bgcolor: "color-mix(in srgb, var(--mui-palette-error-main) 6%, transparent)" } : {}),
    ...(leaving.has(f.id) ? leaveRow : {}),
  });
  const nameSx = { fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5 } as const;
  const count = t.filesCount.replace("{n}", String(files.length));

  return (
    <Box component="main" id="main" sx={{ maxWidth: 1000, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, md: 3 } }}>
      <input ref={picker} type="file" accept={ACCEPT} hidden onChange={onPick} />
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2.5 }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <Typography ref={heading} tabIndex={-1} component="h1" sx={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.01em", outline: "none" }}>{t.files}</Typography>
          {hydrated && files.length > 0 && <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{count}</Typography>}
        </Box>
        {hydrated && files.length > 0 && uploadBtn}
      </Box>
      {upload.err && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{upload.err}</Alert>}
      {!hydrated ? null : files.length === 0 ? (
        <Box sx={{ ...enterRise, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1.5, py: { xs: 6, md: 8 }, px: 2, border: 1, borderColor: "divider", borderRadius: 4, bgcolor: "background.paper",
          backgroundImage: "radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--mui-palette-primary-main) 12%, transparent), transparent 65%)" }}>
          <Box aria-hidden sx={{ display: "grid", placeItems: "center", width: 64, height: 64, borderRadius: 4, border: 1, borderColor: "primary.main", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 10%, transparent)" }}>
            <FolderCopyOutlinedIcon sx={{ fontSize: 32, color: "primary.main" }} />
          </Box>
          <Typography component="h2" sx={{ fontSize: "1.125rem", fontWeight: 600 }}>{t.filesEmptyTitle}</Typography>
          <Typography sx={{ maxWidth: 420, color: "text.secondary" }}>{t.filesEmptyBody}</Typography>
          {uploadBtn}
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t.filesFormats}</Typography>
        </Box>
      ) : (
        <>
          <TextField size="small" type="search" fullWidth placeholder={t.filesSearch} value={query} onChange={(e) => setQuery(e.target.value)}
            sx={{ mb: 2, maxWidth: { sm: 420 }, "& .MuiOutlinedInput-root": { ...UI.row, borderRadius: 2 } }}
            slotProps={{ htmlInput: { "aria-label": t.filesSearch }, input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
          {rows.length === 0 ? <Typography role="status" sx={{ py: 4, textAlign: "center", color: "text.secondary", border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 3 }}>{t.filesNoMatch}</Typography> : cards ? (
            <Box component="ul" aria-label={t.files} sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 1 }}>
              {rows.map((f, i) => (
                <Box component="li" key={f.id} sx={{ ...rowSx(f, i), display: "flex", alignItems: "center", gap: 1, minHeight: 64, pl: 2, pr: 0.5, py: 0.5, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography title={f.name} sx={{ ...nameSx, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{f.name}</Typography>
                    <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{`${f.kind.toUpperCase()} · ${size(f.size)} · ${date(f.createdAt)}`}</Typography>
                    <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pname(f)}</Typography>
                    {missingNote(f)}
                  </Box>
                  {rowMenu(f)}
                </Box>
              ))}
            </Box>
          ) : (
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
              <Table aria-label={t.files} sx={{ tableLayout: "fixed" }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={th}>{t.colName}</TableCell>
                    <TableCell sx={{ ...th, width: 80 }}>{t.colType}</TableCell>
                    <TableCell align="right" sx={{ ...th, width: 96 }}>{t.colSize}</TableCell>
                    <TableCell sx={{ ...th, width: 136 }}>{t.colDate}</TableCell>
                    <TableCell sx={{ ...th, ...hideLg, width: 150 }}>{t.colProject}</TableCell>
                    <TableCell align="right" sx={{ ...th, width: 176 }}><Box component="span" sx={srOnly}>{t.colActions}</Box></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((f, i) => (
                    <TableRow key={f.id} sx={{ ...rowSx(f, i), "&:last-child td": { borderBottom: 0 } }}>
                      <TableCell sx={cell}>
                        <Typography noWrap title={f.name} sx={nameSx}>{f.name}</Typography>
                        {missingNote(f)}
                      </TableCell>
                      <TableCell sx={cell}><Chip size="small" variant="outlined" label={f.kind.toUpperCase()} sx={{ fontWeight: 600 }} /></TableCell>
                      <TableCell align="right" sx={{ ...cell, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{size(f.size)}</TableCell>
                      <TableCell sx={{ ...cell, whiteSpace: "nowrap" }}>{date(f.createdAt)}</TableCell>
                      <TableCell sx={{ ...cell, ...hideLg }}><Chip size="small" label={pname(f)} sx={{ maxWidth: 134 }} /></TableCell>
                      <TableCell align="right" sx={{ ...cell, pr: 1, whiteSpace: "nowrap" }}>{rowMenu(f)}</TableCell>
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
      {open && dialog?.kind === "delete" && <DeleteDialog file={open} onRemove={removeRow} onClose={() => close(open.id)} />}
    </Box>
  );
}
