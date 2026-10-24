"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import ReplyRoundedIcon from "@mui/icons-material/ReplyRounded";
import { AnswerView } from "@/components/AnswerView";
import { ReferenceList } from "@/components/ReferenceList";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { startRun, useRunState } from "@/lib/run";
import { focusComposer } from "./Composer";
import { Starters } from "./EmptyChat";
import { Time } from "./UserMessage";

export function AgentMessage({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const busy = !!useRunState().turnId;
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const { status, progress: p } = turn;
  const copy = async () => {
    let r: "ok" | "fail" = "ok";
    try { await navigator.clipboard.writeText(turn.answer?.content ?? ""); } catch { r = "fail"; }
    setCopied(r);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };
  const retry = () => { startRun(sessionId, turn.question).catch(() => {}); };
  // Real phase only: no fabricated steps. ponytail: replaced by ProgressCard in T5.
  const live = status === "running"
    ? p.phase === "waiting" ? `${t.waiting} ${p.waiting ?? ""}` : p.phase === "planning" ? t.planning : p.phase === "searching" ? t.searching : t.writing
    : "";
  const text = status === "refused" ? turn.refused : status === "error" ? turn.error : status === "interrupted" ? t.interrupted : status === "stopped" ? t.stoppedHelp : "";
  return (
    <Box sx={{ px: 0.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline", mb: 0.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "primary.main" }}>{t.brand}</Typography>
        <Time ts={turn.createdAt} />
      </Box>
      {status === "running" && <Typography aria-live="polite" sx={{ color: "text.secondary" }}>{live}</Typography>}
      {status === "done" && turn.answer && (
        <>
          <AnswerView content={turn.answer.content} references={turn.answer.references} />
          {turn.answer.references.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.references}</Typography>
              <ReferenceList references={turn.answer.references} t={t} />
            </Box>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
            <Button variant="outlined" startIcon={<ReplyRoundedIcon />} onClick={focusComposer}>{t.askFollowUp}</Button>
            <Button variant="outlined" color="inherit" startIcon={<ContentCopyRoundedIcon />} onClick={copy}>{copied === "ok" ? t.copied : copied === "fail" ? t.copyFailed : t.copy}</Button>
            {/* T5: report / export slot */}
          </Stack>
        </>
      )}
      {text && <Typography aria-live="polite" sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{text}</Typography>}
      {status === "refused" && <Box sx={{ mt: 2 }}><Typography sx={{ mb: 1, color: "text.secondary", fontSize: "0.875rem" }}>{t.backToResearch}</Typography><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>}
      {(status === "error" || status === "interrupted" || status === "stopped") && (
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outlined" startIcon={<ReplayRoundedIcon />} onClick={retry} disabled={busy}>{t.retry}</Button>
          {busy && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t.retryBusy}</Typography>}
        </Stack>
      )}
    </Box>
  );
}
