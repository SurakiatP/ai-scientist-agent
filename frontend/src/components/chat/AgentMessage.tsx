"use client";
import { memo, useState } from "react";
import { Box, Button, Chip, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
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
import { AnswerSkeleton } from "@/components/research/AnswerSkeleton";
import { ReportArtifact, reportId } from "@/components/research/ReportArtifact";
import type { Turn } from "@/lib/chat";
import { useReportPanel } from "@/lib/exportReport";
import { useInspector } from "@/lib/inspector";
import { useT } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { LogoMark } from "@/components/landing/Dropdown";
import { approvePlan, cancelPlan, startAnalysis, startRun, useRunState } from "@/lib/run";
import { focusComposer, useMode } from "./Composer";
import { Starters } from "./EmptyChat";
import { avatarSx, Time } from "./UserMessage";

function AgentMessageBase({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const openReport = useReportPanel((s) => s.open);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [wasRunning] = useState(turn.status === "running"); // only an answer that arrives live is revealed part by part; reloads render at once
  const copy = async () => { try { await navigator.clipboard.writeText(turn.answer?.content ?? ""); setCopied("ok"); } catch { setCopied("fail"); } setTimeout(() => setCopied(null), 2000); };
  const busy = !!useRunState().turnId;
  const { status } = turn;
  const analysis = turn.analysis;
  const [planErr, setPlanErr] = useState(false); // approval can still fail (a run started elsewhere): say so, never idle silently
  const retry = () => {
    if (analysis) startAnalysis(sessionId, turn.question, analysis.fileId, analysis.fileName).catch(() => {});
    else startRun(sessionId, turn.question, { mode: turn.mode }).catch(() => {});
  };
  const scope = { sessionId, turnId: turn.id };
  // the backend reason is English-only; Thai UI shows the localized scope message instead
  const text = status === "refused" ? (t === strings.th ? t.refused : turn.refused) : status === "error" ? turn.error : status === "interrupted" ? t.interrupted : status === "stopped" ? t.stoppedHelp : "";
  const refs = turn.answer?.references ?? [];
  const [tab, setTab] = useState<"answer" | "sources">("answer");
  const openInspector = useInspector((x) => x.open);
  return (
    <Box sx={{ px: 0.5 }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
        <Box aria-hidden sx={avatarSx}><LogoMark size={24} /></Box>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{t.brand}</Typography>
        {turn.mode === "chat" && !analysis && <Chip size="small" variant="outlined" icon={<ChatBubbleOutlineRoundedIcon />} label={t.modeChat} sx={{ borderRadius: 999, borderColor: "primary.main", "& .MuiChip-icon": { color: "primary.main" } }} />}
        {turn.mode === "deep" && !analysis && <Chip size="small" variant="outlined" icon={<LayersOutlinedIcon />} label={t.modeDeep} sx={{ borderRadius: 999, "& .MuiChip-icon": { color: "primary.main" } }} />}
        <Time ts={turn.createdAt} />
      </Box>
      {analysis ? <AnalysisArtifact turn={turn} /> : status === "awaiting_plan" && !!turn.plan ? (
        // Plan review holds the turn: the plan card stands in for the progress strip until the user decides.
        <Stack spacing={1.5}>
          <PlanCard
            searches={turn.plan} editable
            onApprove={(plan: PlanSearch[]) => { setPlanErr(false); approvePlan(sessionId, turn.id, plan).catch(() => setPlanErr(true)); }}
            onCancel={() => { setPlanErr(false); try { cancelPlan(sessionId, turn.id); } catch {} }}
          />
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", overflowWrap: "anywhere" }}>{t.awaitPlanNote}</Typography>
          {planErr && <Typography role="status" sx={{ fontSize: "0.8125rem", color: "error.main" }}>{t.startFailed}</Typography>}
        </Stack>
      ) : status === "running" && (
        turn.mode === "chat" ? <AnswerSkeleton phase="writing" /> : ( // no search stages to show: the answer is written straight from memory
          <>
            <ProgressCard turn={turn} />
            {(turn.progress.phase === "searching" || turn.progress.phase === "writing") && <AnswerSkeleton phase={turn.progress.phase} />}
          </>
        )
      )}
      {status === "done" && !analysis && turn.answer && (
        <>
          <Typography sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5, fontSize: "0.8125rem", color: "text.secondary" }}>
            <CheckRoundedIcon aria-hidden sx={{ fontSize: 16 }} />{t.finished}
          </Typography>
          {refs.length > 0 && (
            <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label={t.tabsAria} sx={{ minHeight: 44, mb: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Tab value="answer" id={`tab-answer-${turn.id}`} aria-controls={`panel-answer-${turn.id}`} label={t.tabAnswer} sx={{ minHeight: 44 }} />
              <Tab value="sources" id={`tab-sources-${turn.id}`} aria-controls={`panel-sources-${turn.id}`} label={t.tabSources.replace("{n}", String(refs.length))} sx={{ minHeight: 44 }} />
            </Tabs>
          )}
          {turn.mode === "chat" && <Typography sx={{ mb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t.chatCaption}</Typography>}
          <Box role={refs.length ? "tabpanel" : undefined} id={`panel-answer-${turn.id}`} aria-labelledby={refs.length ? `tab-answer-${turn.id}` : undefined} hidden={tab !== "answer"}>
            <AnswerView content={turn.answer.content} references={turn.answer.references} scope={scope} reveal={wasRunning} />
          </Box>
          {refs.length > 0 && (
            <Box role="tabpanel" id={`panel-sources-${turn.id}`} aria-labelledby={`tab-sources-${turn.id}`} hidden={tab !== "sources"}>
              <ReferenceList references={refs} t={t} scope={scope} />
            </Box>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
            <Button variant="contained" startIcon={<ChatBubbleOutlineRoundedIcon />} onClick={() => { useMode.getState().set("chat"); focusComposer(); }}>{t.askFollowUp}</Button>
            <Button variant="outlined" color="inherit" startIcon={<ArticleOutlinedIcon />} disabled={refs.length === 0} sx={{ borderColor: "divider" }}
              onClick={(e) => openInspector({ ...scope, refId: refs[0].id }, e.currentTarget)}>{t.openEvidence}</Button>
            {turn.mode !== "chat" && <Button variant="outlined" color="inherit" startIcon={<BarChartRoundedIcon />} sx={{ borderColor: "divider" }} aria-controls={reportId(turn.id)} onClick={() => openReport(sessionId, turn.id)}>{t.makeReport}</Button>}
            <Tooltip title={copied === "fail" ? t.copyFailed : copied === "ok" ? t.copied : t.copyAnswer}>
              <IconButton aria-label={t.copyAnswer} onClick={copy} sx={{ width: 44, height: 44, color: "text.secondary" }}><ContentCopyRoundedIcon fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title={busy ? t.retryBusy : t.regen}>
              <span><IconButton aria-label={t.regen} onClick={retry} disabled={busy} sx={{ width: 44, height: 44, color: "text.secondary" }}><ReplayRoundedIcon fontSize="small" /></IconButton></span>
            </Tooltip>
          </Stack>
          <Box role="status" sx={{ fontSize: "0.75rem", color: "text.secondary", minHeight: copied ? undefined : 0 }}>{copied === "fail" ? t.copyFailed : copied === "ok" ? t.copied : ""}</Box>
          {turn.mode !== "chat" && <ReportArtifact sessionId={sessionId} turn={turn} />} {/* a memory answer is not a research report */}
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
