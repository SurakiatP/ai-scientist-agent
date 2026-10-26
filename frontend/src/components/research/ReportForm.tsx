"use client";
import { srOnly } from "@/lib/config";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, ListSubheader, Popover, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useEditor } from "@tiptap/react";
import type { Turn } from "@/lib/chat";
import { defaultFont, draftIssue, errorText, FONTS, initialDraft, toPayload, useExport, type Draft, type Format } from "@/lib/exportReport";
import { reportExtensions } from "@/lib/reportExtensions";
import { enterFade } from "@/lib/motion";
import { useGoFiles } from "@/lib/nav";
import { usePreview } from "@/lib/preview";
import { usePrefs, useT } from "@/lib/prefs";
import type { Lang } from "@/lib/strings";
import { PreviewPane } from "./PreviewPane";
import { ReportSheet } from "./ReportSheet";
import { ReportToolbar } from "./ReportToolbar";

const hidden = srOnly;
// Create-document dialog: the answer opens as an A4 page that is edited like a Word document. Mount it only while open so each open starts from the answer again.
export function ReportForm({ turn, onClose }: { turn: Turn; onClose: () => void }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const wide = useMediaQuery(useTheme().breakpoints.up("md"), { noSsr: true }); // dialog mounts only in the browser
  const [base, setBase] = useState<Draft>(() => initialDraft(turn, lang, t));
  const { busy, error, saved, upErr, save } = useExport();
  const goFiles = useGoFiles();
  useEffect(() => { useExport.getState().reset(); return () => useExport.getState().reset(); }, []);
  const [ver, setVer] = useState(0); // bumps per edit; the document is read out of the editor once per version
  const editor = useEditor({ extensions: reportExtensions, content: base.doc, immediatelyRender: false, onUpdate: () => setVer((v) => v + 1), editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": t.fBody } } });
  const doc = useMemo(() => (editor && ver ? editor.getJSON() : base.doc), [editor, ver, base.doc]);
  const d = useMemo<Draft>(() => ({ ...base, doc }), [base, doc]);
  const issue = useMemo(() => draftIssue(d), [d]);
  const [pv, setPv] = useState(false);
  const [clean, setClean] = useState({ ver: 0, base }); // last saved (or opened) state
  const [fontTouched, setFontTouched] = useState(false); // a style change resets the font to the style default until the user picks one
  const [ask, setAsk] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const dirty = ver !== clean.ver || base !== clean.base;
  const leave = () => (dirty ? setAsk(true) : onClose());
  const preview = usePreview(useMemo(() => (pv && !issue ? toPayload(d, "pdf", turn) : null), [pv, d, issue, turn]));
  const set = (p: Partial<Draft>) => setBase((x) => ({ ...x, ...p }));
  const make = async (f: Format) => { if (issue) return; const at = { ver, base }; await save(d, f, turn); if (useExport.getState().saved) setClean(at); };
  const fields = (
    <>
      <TextField select size="small" label={t.fLang} value={base.lang} onChange={(e) => set({ lang: e.target.value as Lang })} sx={{ minWidth: 140 }}>
        <MenuItem value="th">ไทย</MenuItem>
        <MenuItem value="en">English</MenuItem>
      </TextField>
      <TextField select size="small" label={t.fStyle} value={base.style} onChange={(e) => { const style = e.target.value as Draft["style"]; set(fontTouched ? { style } : { style, font: defaultFont(style) }); }} sx={{ minWidth: 160 }}>
        <MenuItem value="standard">{t.fStyleStd}</MenuItem>
        <MenuItem value="official">{t.fStyleOfficial}</MenuItem>
      </TextField>
      <TextField select size="small" label={t.fFont} value={base.font} onChange={(e) => { setFontTouched(true); set({ font: e.target.value as Draft["font"] }); }} sx={{ minWidth: 200 }} slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } } }}>
        {(["gov", "sipa", "general"] as const).flatMap((g) => [
          <ListSubheader key={g}>{t[`fFontGroup_${g}`]}</ListSubheader>,
          ...FONTS.filter((f) => f.group === g).map((f) => <MenuItem key={f.id} value={f.id} sx={{ fontFamily: f.cssFamily, minHeight: 44 }}>{f.label}</MenuItem>),
        ])}
      </TextField>
      <FormControlLabel control={<Switch checked={base.refs} onChange={(e) => set({ refs: e.target.checked })} />} label={t.fRefs} />
    </>
  );
  const sheetOn = wide || !pv; // below md the preview replaces the page
  return (
    <Dialog open fullScreen onClose={busy ? undefined : leave} aria-labelledby="rf-title" slotProps={{ paper: { sx: { display: "flex", flexDirection: "column" } } }}>
      <Stack direction="row" useFlexGap sx={{ alignItems: "center", gap: 1, px: 2, py: 1, flexWrap: "wrap", borderBottom: 1, borderColor: "divider" }}>
        <Typography id="rf-title" component="h2" sx={{ flex: "1 1 0", minWidth: 0, fontSize: "1.0625rem", fontWeight: 700 }}>{t.fTitle}</Typography>
        {wide ? (
          <>
            <Button variant="outlined" disabled={!!busy || !!issue} startIcon={<BookmarkAddOutlinedIcon />} onClick={() => make("docx")} sx={{ minHeight: 44 }}>{t.fSaveDocx}</Button>
            <Button variant="contained" disabled={!!busy || !!issue} startIcon={<BookmarkAddOutlinedIcon />} onClick={() => make("pdf")} sx={{ minHeight: 44 }}>{t.fSavePdf}</Button>
            <Button variant={pv ? "contained" : "outlined"} color={pv ? "secondary" : "inherit"} aria-pressed={pv} startIcon={<VisibilityOutlinedIcon />} onClick={() => setPv((v) => !v)} sx={{ minHeight: 44, borderColor: "divider" }}>{t.pvShow}</Button>
          </>
        ) : (
          <>
            <Tooltip title={t.fSaveDocx} describeChild><span><IconButton aria-label={t.fSaveDocx} disabled={!!busy || !!issue} onClick={() => make("docx")} sx={{ width: 44, height: 44 }}><DescriptionOutlinedIcon /></IconButton></span></Tooltip>
            <Tooltip title={t.fSavePdf} describeChild><span><IconButton aria-label={t.fSavePdf} color="primary" disabled={!!busy || !!issue} onClick={() => make("pdf")} sx={{ width: 44, height: 44 }}><PictureAsPdfOutlinedIcon /></IconButton></span></Tooltip>
            <Tooltip title={t.pvShow} describeChild><IconButton aria-label={t.pvShow} aria-pressed={pv} color={pv ? "primary" : "default"} onClick={() => setPv((v) => !v)} sx={{ width: 44, height: 44 }}><VisibilityOutlinedIcon /></IconButton></Tooltip>
          </>
        )}
        <Tooltip title={t.fCancel} describeChild>
          <span><IconButton aria-label={t.fCancel} onClick={leave} disabled={!!busy} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton></span>
        </Tooltip>
      </Stack>
      <Box sx={{ px: 2, py: wide ? 0.75 : 0, borderBottom: wide ? 1 : 0, borderColor: "divider" }}>
        {(issue === "limits" || issue === "table" || issue === "heading") && <Alert severity="warning" sx={{ mb: 1 }}>{issue === "table" ? t.fTableWide : issue === "heading" ? t.fHeadingLong : t.fTooMany}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 1 }}>{errorText(error, t)}</Alert>}
        {upErr !== null && <Alert severity="error" sx={{ mb: 1 }}>{upErr ? `${t.fSaveFail} (${upErr})` : t.fSaveFail}</Alert>}
        {saved && (
          <Alert severity="success" sx={{ mb: 1, alignItems: "center" }} action={<Button color="inherit" size="small" onClick={() => { onClose(); goFiles(); }} sx={{ minHeight: 44 }}>{t.fOpenFiles}</Button>}>
            {t.fSaved}: <Box component="span" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{saved}</Box>
          </Alert>
        )}
        <Box role="status" sx={busy ? { fontSize: "0.875rem", color: "text.secondary" } : hidden}>{busy ? t.fBusy : saved ? t.fSaved : ""}</Box>
        <Typography sx={wide ? { fontSize: "0.8125rem", color: "text.secondary" } : hidden}>{t.fSaveNote}</Typography>
      </Box>
      <ReportToolbar
        editor={editor}
        extra={!wide && (
          <Tooltip title={t.fSettings} describeChild>
            <IconButton aria-label={t.fSettings} aria-haspopup="dialog" aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget)} sx={{ width: 44, height: 44 }}><TuneRoundedIcon /></IconButton>
          </Tooltip>
        )}
      />
      {wide ? (
        <Stack direction="row" useFlexGap sx={{ alignItems: "center", gap: 2, px: 2, py: 0.75, flexWrap: "wrap", borderBottom: 1, borderColor: "divider" }}>{fields}</Stack>
      ) : (
        <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
          <Stack aria-label={t.fSettings} role="group" sx={{ p: 2, gap: 2, width: 260 }}>{fields}</Stack>
        </Popover>
      )}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        <Box sx={{ display: sheetOn ? "flex" : "none", flex: 1, minWidth: 0 }}>
          <ReportSheet editor={editor} wide={wide} style={base.style} font={base.font} title={base.title} subtitle={base.subtitle} onTitle={(title) => set({ title })} onSubtitle={(subtitle) => set({ subtitle })} />
        </Box>
        {pv && (
          <Box sx={{ ...enterFade, flex: { xs: 1, md: "0 0 380px" }, minWidth: 0, overflow: "auto", p: 2, borderLeft: { md: 1 }, borderColor: "divider" }}>
            <PreviewPane p={preview} issue={!!issue} />
          </Box>
        )}
      </Box>
      <Dialog open={ask} onClose={() => setAsk(false)} aria-labelledby="rf-discard">
        <DialogTitle id="rf-discard">{t.fDiscardTitle}</DialogTitle>
        <DialogContent><DialogContentText>{t.fDiscardBody}</DialogContentText></DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setAsk(false)} sx={{ minHeight: 44 }}>{t.fKeepEditing}</Button>
          <Button color="error" onClick={onClose} sx={{ minHeight: 44 }}>{t.fDiscard}</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
