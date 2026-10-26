"use client";
import { memo, useState } from "react";
import { Box, Button, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from "@mui/material";
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
import type { RefusalCode, Turn } from "@/lib/chat";
import { useReportPanel } from "@/lib/exportReport";
import { useInspector } from "@/lib/inspector";
import { useT } from "@/lib/prefs";
import { strings, type Strings } from "@/lib/strings";
import { LogoMark } from "@/components/landing/Dropdown";
import { approvePlan, cancelPlan, startAnalysis, startError, startRun, useRunState } from "@/lib/run";
import { focusComposer, useMode } from "./Composer";
import { Starters } from "./EmptyChat";
import { avatarSx, Time } from "./UserMessage";

// refusal code -> localized text key; out_of_scope has none (it keeps the generic message)
const REFUSAL_TEXT: Partial<Record<RefusalCode, keyof Strings>> = {
  injection: "refusedInjection", needs_search: "refusedNeedsSearch", use_research: "refusedUseResearch", empty_memory: "refusedEmptyMemory",
  too_long: "refusedTooLong", unsafe_request: "refusedUnsafe", not_about_data: "refusedNotData", check_failed: "refusedCheckFailed",
};

function AgentMessageBase({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const openReport = useReportPanel((s) => s.open);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [wasRunning] = useState(turn.status === "running"); // only an answer that arrives live is revealed part by part; reloads render at once
  const copy = async () => { try { await navigator.clipboard.writeText(turn.answer?.content ?? ""); setCopied("ok"); } catch { setCopied("fail"); } setTimeout(() => setCopied(null), 2000); };
  const busy = !!useRunState().turnId;
  const { status } = turn;
  const analysis = turn.analysis;
  const [planErr, setPlanErr] = useState<string | null>(null); // approval can still fail (a run started elsewhere): say so, never idle silently
  const [retryErr, setRetryErr] = useState<string | null>(null); // a full queue answers the retry too: say why nothing started
  const retry = () => {
    setRetryErr(null);
    const fail = (e: unknown) => setRetryErr(startError(e));
    if (analysis) startAnalysis(sessionId, turn.question, analysis.fileId, analysis.fileName).catch(fail);
    else startRun(sessionId, turn.question, { mode: turn.mode }).catch(fail);
  };
  const scope = { sessionId, turnId: turn.id };
  // the backend reason is English-only; Thai UI shows the localized scope message instead
  const coded = status === "refused" && turn.refusedCode ? REFUSAL_TEXT[turn.refusedCode] : undefined;
  const errText = turn.errCode === "cut_off" ? t.cutOff : turn.errCode === "failed" ? t.runFailed : turn.errCode === "interrupted" ? t.interrupted : turn.errCode === "stopped" ? t.stoppedHelp : undefined; // the server's neutral English `error` is the fallback
  const text = status === "refused" ? (coded ? t[coded] : t === strings.th ? t.refused : turn.refused) : status === "error" ? errText ?? turn.error : status === "interrupted" ? t.interrupted : status === "stopped" ? t.stoppedHelp : "";
  const refs = turn.answer?.references ?? [];
  const [tab, setTab] = useState<"answer" | "sources">("answer");
  const openInspector = useInspector((x) => x.open);
  return (
    <Box sx={{ px: 0.5 }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
        <Box aria-hidden sx={avatarSx}><LogoMark size={24} /></Box>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{t.brand}</Typography>
        {/* the mode is metadata, not an action: quiet muted text with a small icon, no outlined pill */}
        {!analysis && (turn.mode === "chat" || turn.mode === "deep" || turn.mode === "quick") && (
          <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, color: "text.secondary", fontSize: "0.8125rem" }}>
            <Box component="span" aria-hidden sx={{ opacity: 0.6 }}>·</Box>
            {turn.mode === "chat" ? <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 15 }} /> : <LayersOutlinedIcon sx={{ fontSize: 15 }} />}
            {turn.mode === "chat" ? t.modeChat : turn.mode === "deep" ? t.modeDeep : t.modeQuick}
            <Box component="span" aria-hidden sx={{ opacity: 0.6 }}>·</Box>
          </Box>
        )}
        <Time ts={turn.createdAt} />
      </Box>
      {analysis ? <AnalysisArtifact turn={turn} /> : status === "awaiting_plan" && !!turn.plan ? (
        // Plan review holds the turn: the plan card stands in for the progress strip until the user decides.
        <Stack spacing={1.5}>
          <PlanCard
            searches={turn.plan} editable
            onApprove={(plan: PlanSearch[]) => { setPlanErr(null); approvePlan(sessionId, turn.id, plan).catch((e) => setPlanErr(startError(e) ?? t.startFailed)); }}
            onCancel={() => { setPlanErr(null); try { cancelPlan(sessionId, turn.id); } catch {} }}
          />
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", overflowWrap: "anywhere" }}>{t.awaitPlanNote}</Typography>
          {planErr && <Typography role="status" sx={{ fontSize: "0.8125rem", color: "error.main" }}>{planErr}</Typography>}
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
      {status === "refused" && (turn.refusedCode === "needs_search" || turn.refusedCode === "use_research") && (
        <Button variant="outlined" onClick={() => { useMode.getState().set("deep"); focusComposer(); }} sx={{ mt: 1.5 }}>{t.switchTo} {t.modeDeep}</Button>
      )}
      {status === "refused" && !analysis && <Box sx={{ mt: 2 }}><Typography sx={{ mb: 1, color: "text.secondary", fontSize: "0.875rem" }}>{t.backToResearch}</Typography><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>}
      {(status === "error" || status === "interrupted" || status === "stopped") && (
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 1.5, alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="outlined" startIcon={<ReplayRoundedIcon />} onClick={retry} disabled={busy}>{t.retry}</Button>
          {busy && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t.retryBusy}</Typography>}
          {retryErr && <Typography role="status" sx={{ fontSize: "0.8125rem", color: "error.main" }}>{retryErr}</Typography>}
        </Stack>
      )}
    </Box>
  );
}

export const AgentMessage = memo(AgentMessageBase);
