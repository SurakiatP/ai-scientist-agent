"use client";
import { memo, useState } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { AnswerView } from "@/components/AnswerView";
import { ReferenceList } from "@/components/ReferenceList";
import { AnalysisArtifact } from "@/components/research/AnalysisArtifact";
import { PlanCard, type PlanSearch } from "@/components/research/PlanCard";
import { ProgressCard } from "@/components/research/ProgressCard";
import { ReportArtifact } from "@/components/research/ReportArtifact";
import type { Turn } from "@/lib/chat";
import { useInspector } from "@/lib/inspector";
import { usePrefs, useT } from "@/lib/prefs";
import { LogoMark } from "@/components/landing/Dropdown";
import { downloadReport } from "@/components/research/ReportActions";
import { approvePlan, cancelPlan, startAnalysis, startRun, useRunState } from "@/lib/run";
import { focusComposer } from "./Composer";
import { Starters } from "./EmptyChat";
import { avatarSx, Time } from "./UserMessage";

function AgentMessageBase({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const lang = usePrefs((x) => x.lang);
  const busy = !!useRunState().turnId;
  const { status } = turn;
  const analysis = turn.analysis;
  const [planErr, setPlanErr] = useState(false); // approval can still fail (a run started elsewhere): say so, never idle silently
  const retry = () => {
    if (analysis) startAnalysis(sessionId, turn.question, analysis.fileId, analysis.fileName).catch(() => {});
    else startRun(sessionId, turn.question).catch(() => {});
  };
  const scope = { sessionId, turnId: turn.id };
  const text = status === "refused" ? turn.refused : status === "error" ? turn.error : status === "interrupted" ? t.interrupted : status === "stopped" ? t.stoppedHelp : "";
  const refs = turn.answer?.references ?? [];
  const openInspector = useInspector((x) => x.open);
  return (
    <Box sx={{ px: 0.5 }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
        <Box aria-hidden sx={avatarSx}><LogoMark size={24} /></Box>
        <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.brand}</Typography>
        {turn.mode === "deep" && !analysis && <Chip size="small" variant="outlined" icon={<LayersOutlinedIcon />} label={t.modeDeep} sx={{ borderRadius: 999, "& .MuiChip-icon": { color: "primary.main" } }} />}
        <Time ts={turn.createdAt} />
        {status === "done" && !analysis && turn.answer && (
          <Chip size="small" variant="outlined" icon={<CheckRoundedIcon />} label={t.researchComplete}
            sx={{ ml: "auto", borderRadius: 999, color: "primary.main", borderColor: "primary.main", "& .MuiChip-icon": { color: "inherit", fontSize: 16 } }} />
        )}
      </Box>
      {analysis ? <AnalysisArtifact turn={turn} /> : status === "awaiting_plan" && !!turn.plan ? (
        // Plan review holds the turn: the plan card stands in for the progress strip until the user decides.
        <Stack spacing={1.5}>
          <PlanCard
            searches={turn.plan} editable
            onApprove={(plan: PlanSearch[]) => { setPlanErr(false); approvePlan(sessionId, turn.id, plan).catch(() => setPlanErr(true)); }}
            onCancel={() => { setPlanErr(false); try { cancelPlan(sessionId, turn.id); } catch {} }}
          />
          <Typography aria-live="polite" sx={{ fontSize: "0.8125rem", color: "text.secondary", overflowWrap: "anywhere" }}>{t.awaitPlanNote}</Typography>
          {planErr && <Typography role="status" sx={{ fontSize: "0.8125rem", color: "error.main" }}>{t.startFailed}</Typography>}
        </Stack>
      ) : status === "running" && <ProgressCard turn={turn} />}
      {status === "done" && !analysis && turn.answer && (
        <>
          <AnswerView content={turn.answer.content} references={turn.answer.references} scope={scope} />
          {turn.answer.references.length > 0 && (
            <Box sx={{ mt: 2, display: { xs: "block", lg: "none" } }}>{/* >= lg the sources panel on the right lists them (and owns the anchors) */}
              <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.references}</Typography>
              <ReferenceList references={turn.answer.references} t={t} scope={scope} />
            </Box>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
            <Button variant="contained" startIcon={<ChatBubbleOutlineRoundedIcon />} onClick={focusComposer}>{t.askFollowUp}</Button>
            <Button variant="outlined" color="inherit" startIcon={<ArticleOutlinedIcon />} disabled={refs.length === 0} sx={{ borderColor: "divider" }}
              onClick={(e) => openInspector({ ...scope, refId: refs[0].id }, e.currentTarget)}>{t.openEvidence}</Button>
            <Button variant="outlined" color="inherit" startIcon={<BarChartRoundedIcon />} sx={{ borderColor: "divider" }} onClick={() => downloadReport(sessionId, turn, lang)}>{t.makeReport}</Button>
          </Stack>
          <ReportArtifact sessionId={sessionId} turn={turn} />
        </>
      )}
      {text && status === "refused" ? (
        <Stack direction="row" spacing={1.5} aria-live="polite" sx={{ alignItems: "center", border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", px: 2, py: 1.5 }}>
          <SearchOffRoundedIcon role="img" aria-label={t.refusedIcon} sx={{ color: "primary.main", fontSize: 28 }} />
          <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{text}</Typography>
        </Stack>
      ) : text && <Typography aria-live="polite" sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{text}</Typography>}
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
