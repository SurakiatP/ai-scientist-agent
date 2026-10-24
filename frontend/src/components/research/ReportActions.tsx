"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { useChatStore, type Turn } from "@/lib/chat";
import { usePrefs, useT } from "@/lib/prefs";
import { buildReportMarkdown, downloadText } from "@/lib/report";

export function ReportActions({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    let r: "ok" | "fail" = "ok";
    try { await navigator.clipboard.writeText(turn.answer?.content ?? ""); } catch { r = "fail"; }
    setCopied(r);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };
  const download = () => {
    const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
    if (session) downloadText(`ai-scientist-${turn.id.replace(/[^\w-]/g, "")}.md`, buildReportMarkdown(session, turn, lang));
  };
  return (
    <Stack spacing={1} sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Button variant="outlined" color="inherit" startIcon={<ContentCopyRoundedIcon />} onClick={copy}>{copied === "fail" ? t.copyFailed : copied === "ok" ? t.copied : t.copyAnswer}</Button>
        <Button variant="outlined" color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={download}>{t.downloadMd}</Button>
        {/* ponytail: backend has no PDF/DOCX export; shown disabled with a reason until it does */}
        <Button variant="outlined" color="inherit" disabled aria-describedby={`export-reason-${turn.id}`}>{t.exportPdf}</Button>
        <Button variant="outlined" color="inherit" disabled aria-describedby={`export-reason-${turn.id}`}>{t.exportDocx}</Button>
      </Stack>
      <Box id={`export-reason-${turn.id}`}><Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{`PDF, DOCX: ${t.exportUnsupported}`}</Typography></Box>
    </Stack>
  );
}
