"use client";
import { memo } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import ReplyRoundedIcon from "@mui/icons-material/ReplyRounded";
import { AnswerView } from "@/components/AnswerView";
import { ReferenceList } from "@/components/ReferenceList";
import { AnalysisArtifact } from "@/components/research/AnalysisArtifact";
import { ProgressCard } from "@/components/research/ProgressCard";
import { ReportActions } from "@/components/research/ReportActions";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { startAnalysis, startRun, useRunState } from "@/lib/run";
import { focusComposer } from "./Composer";
import { Starters } from "./EmptyChat";
import { Time } from "./UserMessage";

function AgentMessageBase({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const busy = !!useRunState().turnId;
  const { status } = turn;
  const analysis = turn.analysis;
  const retry = () => {
    if (analysis) startAnalysis(sessionId, turn.question, analysis.fileId, analysis.fileName).catch(() => {});
    else startRun(sessionId, turn.question).catch(() => {});
  };
  const scope = { sessionId, turnId: turn.id };
  const text = status === "refused" ? turn.refused : status === "error" ? turn.error : status === "interrupted" ? t.interrupted : status === "stopped" ? t.stoppedHelp : "";
  return (
    <Box sx={{ px: 0.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline", mb: 0.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: "primary.main" }}>{t.brand}</Typography>
        <Time ts={turn.createdAt} />
      </Box>
      {analysis ? <AnalysisArtifact turn={turn} /> : status === "running" && <ProgressCard turn={turn} />}
      {status === "done" && !analysis && turn.answer && (
        <>
          <AnswerView content={turn.answer.content} references={turn.answer.references} scope={scope} />
          {turn.answer.references.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.references}</Typography>
              <ReferenceList references={turn.answer.references} t={t} scope={scope} />
            </Box>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
            <Button variant="outlined" startIcon={<ReplyRoundedIcon />} onClick={focusComposer}>{t.askFollowUp}</Button>
          </Stack>
          <ReportActions sessionId={sessionId} turn={turn} />
        </>
      )}
      {text && <Typography aria-live="polite" sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{text}</Typography>}
      {status === "refused" && !analysis && <Box sx={{ mt: 2 }}><Typography sx={{ mb: 1, color: "text.secondary", fontSize: "0.875rem" }}>{t.backToResearch}</Typography><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>}
      {(status === "error" || status === "interrupted" || status === "stopped") && (
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outlined" startIcon={<ReplayRoundedIcon />} onClick={retry} disabled={busy}>{t.retry}</Button>
          {busy && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t.retryBusy}</Typography>}
        </Stack>
      )}
    </Box>
  );
}

export const AgentMessage = memo(AgentMessageBase);
