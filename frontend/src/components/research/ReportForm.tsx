"use client";
import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import type { Turn } from "@/lib/chat";
import { draftIssue, errorText, initialDraft, LIM, paragraphsOf, useExport, type Draft, type Format } from "@/lib/exportReport";
import { skeletonBar } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import type { Lang } from "@/lib/strings";

const fill = (s: string, v: Record<string, number>) => Object.entries(v).reduce((a, [k, n]) => a.replace(`{${k}}`, String(n)), s);
const hidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

// Create-document form, prefilled from the real answer. Mount it only while open so each open starts from the answer again.
export function ReportForm({ turn, onClose }: { turn: Turn; onClose: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const full = useMediaQuery(useTheme().breakpoints.down("sm"));
  const [d, setD] = useState<Draft>(() => initialDraft(turn, lang, t));
  const { busy, error, done, run } = useExport();
  useEffect(() => { useExport.getState().reset(); return () => useExport.getState().reset(); }, []);
  const issue = draftIssue(d);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const edit = (i: number, p: Partial<Draft["sections"][number]>) => set({ sections: d.sections.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const move = (i: number, by: -1 | 1) => { const a = [...d.sections]; [a[i], a[i + by]] = [a[i + by], a[i]]; set({ sections: a }); };
  const refCount = d.refs ? Math.min(turn.answer?.references.length ?? 0, LIM.refs) : 0;
  const make = (f: Format) => { if (!issue) void run(d, f, turn); };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullScreen={full} maxWidth="lg" fullWidth aria-labelledby="rf-title">
      <DialogTitle id="rf-title" sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Box component="span" sx={{ flex: 1 }}>{t.fTitle}</Box>
        <IconButton aria-label={t.fCancel} onClick={onClose} disabled={!!busy} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "minmax(0,1fr) 280px" } }}>
          <Stack spacing={2}>
            <TextField label={t.fDocTitle} value={d.title} onChange={(e) => set({ title: e.target.value })} required error={!d.title.trim()} helperText={!d.title.trim() ? t.fNeedTitle : `${d.title.length}/${LIM.title}`} slotProps={{ htmlInput: { maxLength: LIM.title } }} fullWidth />
            <TextField label={t.fSubtitle} value={d.subtitle} onChange={(e) => set({ subtitle: e.target.value })} slotProps={{ htmlInput: { maxLength: LIM.subtitle } }} fullWidth />
            <Stack direction="row" useFlexGap sx={{ gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              <TextField select label={t.fLang} value={d.lang} onChange={(e) => set({ lang: e.target.value as Lang })} sx={{ minWidth: 180 }}>
                <MenuItem value="th">ไทย</MenuItem>
                <MenuItem value="en">English</MenuItem>
              </TextField>
              <FormControlLabel control={<Switch checked={d.refs} onChange={(e) => set({ refs: e.target.checked })} />} label={t.fRefs} sx={{ minHeight: 44 }} />
            </Stack>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{fill(t.fLimits, { s: LIM.sections, p: LIM.paras, c: LIM.para })}</Typography>
            {d.sections.map((s, i) => {
              const n = paragraphsOf(s.text).length;
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
          <Box component="aside" aria-label={t.fOutline} sx={{ alignSelf: "start", position: { md: "sticky" }, top: 0, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", p: 2 }}>
            <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, mb: 1 }}>{t.fOutline}</Typography>
            <Typography sx={{ fontSize: "1rem", fontWeight: 700, overflowWrap: "anywhere" }}>{d.title || "—"}</Typography>
            {d.subtitle && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", overflowWrap: "anywhere" }}>{d.subtitle}</Typography>}
            <Box component="ol" sx={{ m: 0, mt: 1.5, pl: 2.5, display: "grid", gap: 0.75 }}>
              {d.sections.map((s, i) => (
                <li key={i}><Typography component="span" sx={{ fontSize: "0.875rem", overflowWrap: "anywhere" }}>{s.heading || "—"}</Typography>{" "}
                  <Typography component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>({t.reportParagraphs.replace("{n}", String(paragraphsOf(s.text).length))})</Typography></li>
              ))}
            </Box>
            {d.refs && refCount > 0 && <Typography sx={{ mt: 1.5, fontSize: "0.8125rem", color: "text.secondary" }}>{fill(t.fRefsN, { n: refCount })}</Typography>}
            <Typography sx={{ mt: 1.5, fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.6 }}>{t.idCheckNote}</Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ display: "block", p: 2 }}>
        {issue === "limits" && <Alert severity="warning" sx={{ mb: 1.5 }}>{t.fTooMany}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{errorText(error, t)}</Alert>}
        <Box role="status" sx={busy || done ? (busy ? hidden : { fontSize: "0.875rem", color: "text.secondary", mb: 1 }) : hidden}>{busy ? t.fBusy : done ? t.fDone : ""}</Box>
        <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: "wrap" }}>
          <Button variant="contained" disabled={!!busy || !!issue} onClick={() => make("pdf")}>{t.fMakePdf}</Button>
          <Button variant="outlined" disabled={!!busy || !!issue} onClick={() => make("docx")}>{t.fMakeDocx}</Button>
        </Stack>
        {busy && (
          <Stack aria-hidden spacing={1} sx={{ mt: 1.5 }}>
            {["70%", "54%", "38%"].map((w, i) => <Box key={i} sx={{ ...skeletonBar(i), width: w }} />)}
          </Stack>
        )}
      </DialogActions>
    </Dialog>
  );
}
