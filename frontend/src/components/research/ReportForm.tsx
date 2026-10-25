"use client";
import { srOnly } from "@/lib/config";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, Switch, Tab, Tabs, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import type { Turn } from "@/lib/chat";
import { draftIssue, errorText, initialDraft, LIM, blocksOf, toPayload, useExport, type Draft, type Format } from "@/lib/exportReport";
import { skeletonBar } from "@/lib/motion";
import { useGoFiles } from "@/lib/nav";
import { usePreview } from "@/lib/preview";
import { usePrefs, useT } from "@/lib/prefs";
import type { Lang } from "@/lib/strings";
import { PreviewPane } from "./PreviewPane";

const fill = (s: string, v: Record<string, number>) => Object.entries(v).reduce((a, [k, n]) => a.replace(`{${k}}`, String(n)), s);
const hidden = srOnly;

// Create-document form, prefilled from the real answer. Mount it only while open so each open starts from the answer again.
export function ReportForm({ turn, onClose }: { turn: Turn; onClose: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const full = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [d, setD] = useState<Draft>(() => initialDraft(turn, lang, t));
  const { busy, error, saved, upErr, save } = useExport();
  const goFiles = useGoFiles();
  useEffect(() => { useExport.getState().reset(); return () => useExport.getState().reset(); }, []);
  const issue = draftIssue(d);
  const [view, setView] = useState<"edit" | "preview">("edit"); // narrow screens show one pane at a time
  const preview = usePreview(useMemo(() => (issue ? null : toPayload(d, "pdf", turn)), [d, issue, turn]));
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const edit = (i: number, p: Partial<Draft["sections"][number]>) => set({ sections: d.sections.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const move = (i: number, by: -1 | 1) => { const a = [...d.sections]; [a[i], a[i + by]] = [a[i + by], a[i]]; set({ sections: a }); };
  const make = (f: Format) => { if (!issue) void save(d, f, turn); };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={full} maxWidth="lg" fullWidth aria-labelledby="rf-title">
      <DialogTitle id="rf-title" sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box component="span" sx={{ flex: 1 }}>{t.fTitle}</Box>
        <IconButton aria-label={t.fCancel} onClick={onClose} disabled={!!busy} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <Tabs value={view} onChange={(_, v) => setView(v)} variant="fullWidth" sx={{ display: { md: "none" }, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="edit" label={t.pvEditTab} sx={{ minHeight: 44 }} />
        <Tab value="preview" label={t.pvTab} sx={{ minHeight: 44 }} />
      </Tabs>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) minmax(300px,380px)" } }}>
          <Stack spacing={2} sx={{ display: { xs: view === "edit" ? "flex" : "none", md: "flex" } }}>
            <TextField label={t.fDocTitle} value={d.title} onChange={(e) => set({ title: e.target.value })} required error={!d.title.trim()} helperText={!d.title.trim() ? t.fNeedTitle : `${d.title.length}/${LIM.title}`} slotProps={{ htmlInput: { maxLength: LIM.title } }} fullWidth />
            <TextField label={t.fSubtitle} value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} slotProps={{ htmlInput: { maxLength: LIM.subtitle } }} fullWidth />
            <Stack direction="row" useFlexGap sx={{ gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              <TextField select label={t.fLang} value={d.lang} onChange={(e) => set({ lang: e.target.value as Lang })} sx={{ minWidth: 180 }}>
                <MenuItem value="th">ไทย</MenuItem>
                <MenuItem value="en">English</MenuItem>
              </TextField>
              <TextField select label={t.fStyle} value={d.style} onChange={(e) => set({ style: e.target.value as Draft["style"] })} sx={{ minWidth: 180 }}>
                <MenuItem value="standard">{t.fStyleStd}</MenuItem>
                <MenuItem value="official">{t.fStyleOfficial}</MenuItem>
              </TextField>
              <FormControlLabel control={<Switch checked={d.refs} onChange={(e) => set({ refs: e.target.checked })} />} label={t.fRefs} sx={{ minHeight: 44 }} />
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{fill(t.fLimits, { s: LIM.sections, p: LIM.paras, c: LIM.para })}</Typography>
            {d.sections.map((s, i) => {
              const n = blocksOf(s.text).length;
              return (
                <Box key={i} component="section" aria-label={`${t.fHeading} ${i + 1}`} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, display: "grid", gap: 1.5 }}>
                  <Stack direction="row" sx={{ gap: 0.5, alignItems: "flex-start" }}>
                    <TextField label={`${t.fHeading} ${i + 1}`} value={s.heading} onChange={(e) => edit(i, { heading: e.target.value })} size="small" fullWidth slotProps={{ htmlInput: { maxLength: LIM.heading } }} />
                    <IconButton aria-label={`${t.fUp}: ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)} sx={{ width: 44, height: 44 }}><ArrowUpwardRoundedIcon /></IconButton>
                    <IconButton aria-label={`${t.fDown}: ${i + 1}`} disabled={i === d.sections.length - 1} onClick={() => move(i, 1)} sx={{ width: 44, height: 44 }}><ArrowDownwardRoundedIcon /></IconButton>
                    <IconButton aria-label={`${t.fRemove}: ${i + 1}`} onClick={() => set({ sections: d.sections.filter((_, k) => k !== i) })} sx={{ width: 44, height: 44 }}><DeleteOutlineRoundedIcon /></IconButton>
                  </Stack>
                  <TextField label={t.fParas} value={s.text} onChange={(e) => edit(i, { text: e.target.value })} multiline minRows={4} maxRows={14} fullWidth error={n > LIM.paras} helperText={t.reportParagraphs.replace("{n}", String(n))} />
                </Box>
              );
            })}
            <Box>
              <Button variant="outlined" color="inherit" startIcon={<AddRoundedIcon />} disabled={d.sections.length >= LIM.sections} onClick={() => set({ sections: [...d.sections, { heading: "", text: "" }] })} sx={{ borderColor: "divider" }}>{t.fAdd}</Button>
            </Box>
          </Stack>
          <Box sx={{ display: { xs: view === "preview" ? "block" : "none", md: "block" }, alignSelf: "start", position: { md: "sticky" }, top: 0 }}>
            <PreviewPane p={preview} issue={!!issue} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ display: "block", p: 2 }}>
        {(issue === "limits" || issue === "table") && <Alert severity="warning" sx={{ mb: 1.5 }}>{issue === "table" ? t.fTableWide : t.fTooMany}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{errorText(error, t)}</Alert>}
        {upErr !== null && <Alert severity="error" sx={{ mb: 1.5 }}>{upErr ? `${t.fSaveFail} (${upErr})` : t.fSaveFail}</Alert>}
        {saved && (
          <Alert severity="success" sx={{ mb: 1.5, alignItems: "center" }} action={<Button color="inherit" size="small" onClick={() => { onClose(); goFiles(); }} sx={{ minHeight: 44 }}>{t.fOpenFiles}</Button>}>
            {t.fSaved}: <Box component="span" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{saved}</Box>
          </Alert>
        )}
        <Box role="status" sx={busy ? { fontSize: "0.875rem", color: "text.secondary", mb: 1 } : hidden}>{busy ? t.fBusy : saved ? t.fSaved : ""}</Box>
        <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: "wrap" }}>
          <Button variant="contained" disabled={!!busy || !!issue} startIcon={<BookmarkAddOutlinedIcon />} onClick={() => make("pdf")}>{t.fSavePdf}</Button>
          <Button variant="outlined" disabled={!!busy || !!issue} startIcon={<BookmarkAddOutlinedIcon />} onClick={() => make("docx")}>{t.fSaveDocx}</Button>
        </Stack>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1.5 }}>{t.fSaveNote}</Typography>
        {busy && (
          <Stack aria-hidden spacing={1} sx={{ mt: 1.5 }}>
            {["70%", "54%", "38%"].map((w, i) => <Box key={i} sx={{ ...skeletonBar(i), width: w }} />)}
          </Stack>
        )}
      </DialogActions>
    </Dialog>
  );
}
