"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Button, Divider, Drawer, IconButton, ListItemText, Menu, MenuItem, Stack, Tab, Tabs, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import { AnswerView } from "@/components/AnswerView";
import { useChatStore, type Session, type Turn } from "@/lib/chat";
import { docTitle, errorText, initialDraft, useExport, useReportPanel } from "@/lib/exportReport";
import { usePrefs, useT } from "@/lib/prefs";
import { buildReportMarkdown, downloadText } from "@/lib/report";
import { SourcesPanel } from "./ProgressPanel";
import { ReportForm } from "./ReportForm";

const hidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

function Panel({ session, turn }: { session: Session; turn: Turn }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const { tab, setTab, close } = useReportPanel();
  const body = useRef<HTMLDivElement>(null);
  const [heads, setHeads] = useState<HTMLElement[]>([]);
  const [menu, setMenu] = useState<{ kind: "toc" | "share"; el: HTMLElement } | null>(null);
  const [form, setForm] = useState(false);
  const [note, setNote] = useState<"" | "copied" | "copyFailed">("");
  const { busy, error, done, run } = useExport();
  const refs = turn.answer?.references ?? [];
  useEffect(() => { setHeads(Array.from(body.current?.querySelectorAll<HTMLElement>("h1,h2,h3") ?? [])); }, [turn.answer?.content, tab]);
  const jump = (h: HTMLElement) => { setMenu(null); h.scrollIntoView?.({ block: "start" }); };
  const quick = (f: "pdf" | "docx") => { setMenu(null); void run(initialDraft(turn, lang, t), f, turn); };
  const copy = async () => {
    setMenu(null);
    try { await navigator.clipboard.writeText(turn.answer?.content ?? ""); setNote("copied"); } catch { setNote("copyFailed"); }
  };
  const md = () => { setMenu(null); downloadText(`ai-scientist-${turn.id.replace(/[^\w-]/g, "")}.md`, buildReportMarkdown(session, turn, lang)); };
  const status = busy ? t.fBusy : error ? errorText(error, t) : done ? t.fDone : note ? t[note] : "";
  return (
    <Stack component="section" aria-label={t.reportTitle} sx={{ height: "100%", minHeight: 0 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1 }}>
        <Typography component="h2" sx={{ flex: 1, fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.35, overflowWrap: "anywhere" }}>{docTitle(turn)}</Typography>
        <IconButton aria-label={t.rpClose} onClick={close} sx={{ width: 44, height: 44, mt: -0.5 }}><CloseRoundedIcon /></IconButton>
      </Stack>
      {refs.length > 0 && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label={t.rpTabs} sx={{ minHeight: 44, mt: 0.5 }}>
          <Tab value="report" label={t.rpTabReport} sx={{ minHeight: 44 }} />
          <Tab value="sources" label={t.rpTabSources} sx={{ minHeight: 44 }} />
        </Tabs>
      )}
      {tab === "sources" && refs.length > 0 ? (
        <Box sx={{ mt: 1.5, overflowY: "auto", minHeight: 0 }}><SourcesPanel turn={turn} sessionId={session.id} /></Box>
      ) : (
        <>
          <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: "wrap", my: 1.5 }}>
            <Button variant="outlined" color="inherit" disabled={heads.length === 0} aria-haspopup="menu" aria-expanded={menu?.kind === "toc"} onClick={(e) => setMenu({ kind: "toc", el: e.currentTarget })} endIcon={<ExpandMoreRoundedIcon />} sx={{ borderColor: "divider", minHeight: 44 }}>{t.rpContents}</Button>
            <Button variant="outlined" color="inherit" aria-haspopup="menu" aria-expanded={menu?.kind === "share"} onClick={(e) => setMenu({ kind: "share", el: e.currentTarget })} startIcon={<IosShareRoundedIcon />} endIcon={<ExpandMoreRoundedIcon />} sx={{ borderColor: "divider", minHeight: 44 }}>{t.rpShare}</Button>
            <Button variant="contained" startIcon={<EditNoteRoundedIcon />} onClick={() => setForm(true)} sx={{ minHeight: 44 }}>{t.rpEdit}</Button>
          </Stack>
          <Menu anchorEl={menu?.el} open={menu?.kind === "toc"} onClose={() => setMenu(null)}>
            {heads.map((h, i) => <MenuItem key={i} onClick={() => jump(h)} sx={{ minHeight: 44, maxWidth: 360 }}><ListItemText slotProps={{ primary: { sx: { whiteSpace: "normal" } } }} primary={h.textContent} /></MenuItem>)}
          </Menu>
          <Menu anchorEl={menu?.el} open={menu?.kind === "share"} onClose={() => setMenu(null)}>
            <MenuItem onClick={() => quick("pdf")} disabled={!!busy} sx={{ minHeight: 44 }}>{t.rpPdf}</MenuItem>
            <MenuItem onClick={() => quick("docx")} disabled={!!busy} sx={{ minHeight: 44 }}>{t.rpDocx}</MenuItem>
            <Divider />
            <MenuItem onClick={md} sx={{ minHeight: 44 }}>{t.rpMd}</MenuItem>
            <MenuItem onClick={copy} sx={{ minHeight: 44 }}>{t.rpCopyText}</MenuItem>
          </Menu>
          <Box role="status" sx={status && !busy ? { fontSize: "0.8125rem", color: error ? "error.main" : "text.secondary", mb: 1 } : hidden}>{status}</Box>
          <Box ref={body} role="region" aria-label={t.rpBody} tabIndex={0} sx={{ overflowY: "auto", minHeight: 0, flex: 1, pr: 0.5 }}>
            <AnswerView content={turn.answer?.content ?? ""} references={refs} scope={{ sessionId: session.id, turnId: turn.id }} />
          </Box>
        </>
      )}
      {form && <ReportForm turn={turn} onClose={() => setForm(false)} />}
    </Stack>
  );
}

// variant "panel": fills the wide right aside; "sheet": full-height drawer below lg.
export function ReportPanel({ variant }: { variant: "panel" | "sheet" }) {
  const ref = useReportPanel((s) => s.ref);
  const close = useReportPanel((s) => s.close);
  const session = useChatStoreSession(ref?.sessionId);
  const turn = session?.turns.find((x) => x.id === ref?.turnId);
  const ok = !!session && !!turn?.answer;
  if (variant === "panel") return ok ? <Panel session={session} turn={turn} /> : null;
  return (
    <Drawer anchor="right" open={ok} onClose={close} slotProps={{ paper: { sx: { width: "100%", maxWidth: 560, p: 2, bgcolor: "background.default" } } }}>
      {ok && <Panel session={session} turn={turn} />}
    </Drawer>
  );
}

const useChatStoreSession = (id?: string) => useChatStore((s) => s.sessions.find((x) => x.id === id));
