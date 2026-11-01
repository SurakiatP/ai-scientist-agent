"use client";
import { useState } from "react";
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { Editor } from "@tiptap/react";
import { LIM, STATEMENT_KINDS, statementText, type Draft } from "@/lib/exportReport";
import { missingHeadings, outlineNodes, PAPER_TYPES, type PaperType } from "@/lib/paperOutline";
import { useExitClose } from "@/lib/motion";
import { useT } from "@/lib/prefs";
import { strings } from "@/lib/strings";

// Paper type (outline helper), front matter and closing statements of the document. Everything here is optional.
export function PaperDetails({ editor, d, set, onClose }: { editor: Editor | null; d: Draft; set: (p: Partial<Draft>) => void; onClose: () => void }) {
  const t = useT();
  const x = useExitClose(onClose);
  const [type, setType] = useState<PaperType | "">("");
  const [msg, setMsg] = useState("");
  const insert = () => {
    if (!editor || !type) return;
    const heads = missingHeadings(editor.getJSON(), type, d.lang);
    if (heads.length) editor.chain().insertContentAt(editor.state.doc.content.size, outlineNodes(heads)).run(); // appended: nothing existing is touched
    setMsg(heads.length ? t.fOutlineDone.replace("{n}", String(heads.length)) : t.fOutlineNone);
  };
  const stmt = (k: (typeof STATEMENT_KINDS)[number]) => {
    const st = d.statements[k], put = (p: Partial<typeof st>) => set({ statements: { ...d.statements, [k]: { ...st, ...p } } });
    return (
      <Box key={k}>
        <FormControlLabel control={<Checkbox checked={st.on} onChange={(e) => put({ on: e.target.checked })} />} label={t[`fStmt_${k}`]} />
        {st.on && <TextField multiline minRows={2} fullWidth size="small" label={t[`fStmt_${k}`]} value={statementText(st, k, strings[d.lang])} onChange={(e) => put({ text: e.target.value })} helperText={st.text === null ? t.fStmtDefault : undefined} slotProps={{ htmlInput: { maxLength: LIM.statement } }} />}
      </Box>
    );
  };
  return (
    <Dialog open={x.open} onClose={x.close} slotProps={{ transition: { onExited: x.onExited } }} fullWidth maxWidth="sm" aria-labelledby="pd-title">
      <DialogTitle id="pd-title" sx={{ fontSize: "1.0625rem", fontWeight: 700 }}>{t.fDetailsTitle}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2, pt: 1 }}>
          <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
            <TextField select size="small" label={t.fPaperType} value={type} onChange={(e) => { setType(e.target.value as PaperType | ""); setMsg(""); }} sx={{ minWidth: 220 }}>
              <MenuItem value="" sx={{ minHeight: 44 }}>{t.fPaperNone}</MenuItem>
              {PAPER_TYPES.map((x) => <MenuItem key={x} value={x} sx={{ minHeight: 44 }}>{t[`fPaper_${x}`]}</MenuItem>)}
            </TextField>
            <Button variant="outlined" disabled={!type || !editor} onClick={insert} sx={{ minHeight: 44 }}>{t.fOutlineInsert}</Button>
          </Stack>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: -1 }}>{t.fOutlineHelp}</Typography>
          <Box role="status" sx={{ fontSize: "0.8125rem" }}>{msg}</Box>
          <TextField multiline minRows={2} fullWidth size="small" label={t.fAuthors} value={d.authors} onChange={(e) => set({ authors: e.target.value })} helperText={t.fAuthorsHelp} />
          <TextField fullWidth size="small" label={t.fKeywords} value={d.keywords} onChange={(e) => set({ keywords: e.target.value })} helperText={t.fKeywordsHelp} />
          <TextField multiline minRows={3} fullWidth size="small" label={t.fAbstract} value={d.abstract} onChange={(e) => set({ abstract: e.target.value })} helperText={t.fAbstractHelp} slotProps={{ htmlInput: { maxLength: LIM.abstract } }} />
          <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
            <Typography component="legend" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{t.fStatements}</Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mb: 0.5 }}>{t.fStatementsHelp}</Typography>
            {STATEMENT_KINDS.map(stmt)}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button autoFocus onClick={x.close} sx={{ minHeight: 44 }}>{t.fDetailsClose}</Button></DialogActions>
    </Dialog>
  );
}
