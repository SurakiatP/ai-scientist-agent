"use client";
import { useState } from "react";
import { Box, Button, ButtonBase, Chip, IconButton, Stack, Typography } from "@mui/material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { useInspector } from "@/lib/inspector";
import { checkLabel, paperLink, sourceHost } from "@/lib/refs";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { stageIndex, stagesDone } from "./ProgressCard";

const card = { border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", p: 2 };
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";

const tone = (st: "verified" | "unverified" | "unknown") => (st === "verified" ? "evidence.verified" : st === "unknown" ? "evidence.unknown" : "evidence.unverified");

// Finished answer: the real references as cards (status = the existence check only), mirroring the inline citations.
// Collapsed by default: one small card with the source domains stacked as chips; expands to the full list.
function SourcesCompact({ turn, sessionId }: { turn: Turn; sessionId: string }) {
  const t = useT();
  const [openList, setOpenList] = useState(false);
  const refs = turn.answer?.references ?? [];
  const hosts = [...new Set(refs.map((r) => sourceHost(r.paper)).filter(Boolean))];
  return (
    <Box sx={{ ...card, p: 0 }}>
      <ButtonBase aria-expanded={openList} aria-controls={`srcs-${turn.id}`} onClick={() => setOpenList(!openList)}
        sx={{ width: "100%", minHeight: 44, display: "flex", justifyContent: "space-between", textAlign: "left", px: 2, py: 1.25, borderRadius: 2 }}>
        <Typography component="span" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.srcCardTitle.replace("{n}", String(refs.length))}</Typography>
        <ExpandMoreRoundedIcon aria-hidden sx={{ color: "text.secondary", transform: openList ? "rotate(180deg)" : "none" }} />
      </ButtonBase>
      {!openList && hosts.length > 0 && (
        <Stack aria-hidden direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: "wrap", px: 2, pb: 1.5 }}>
          {hosts.slice(0, 6).map((h) => <Chip key={h} size="small" variant="outlined" label={h} sx={{ maxWidth: "100%", fontSize: "0.6875rem", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }} />)}
        </Stack>
      )}
      <Box id={`srcs-${turn.id}`} hidden={!openList} sx={{ px: 2, pb: 2 }}>{openList && <SourcesPanel turn={turn} sessionId={sessionId} bare />}</Box>
    </Box>
  );
}

export function SourcesPanel({ turn, sessionId, bare }: { turn: Turn; sessionId: string; bare?: boolean }) {
  const t = useT();
  const open = useInspector((s) => s.open);
  const refs = turn.answer?.references ?? [];
  return (
    <Stack spacing={1.5} component="section" aria-label={t.references}>
      {!bare && <Typography component="h2" sx={{ fontSize: "1.0625rem", fontWeight: 700 }}>{t.sourcesTitle.replace("{n}", String(refs.length))}</Typography>}
      {refs.map((r) => {
        const link = paperLink(r.paper);
        const meta = [r.paper.authors.slice(0, 2).join(", ") + (r.paper.authors.length > 2 ? ` ${t.etAl}` : ""), r.paper.year].filter(Boolean).join(", ");
        return (
          <Box key={r.id} data-ref={r.id} sx={{ ...card, display: "grid", gap: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                <ArticleOutlinedIcon aria-hidden sx={{ color: "text.secondary" }} />
                <Chip size="small" variant="outlined" label={`[${r.id}]`} sx={{ borderRadius: 999, color: "primary.main", borderColor: "primary.main", fontWeight: 600 }} />
              </Stack>
              <Chip size="small" variant="outlined" label={checkLabel(r, t)} sx={{ borderRadius: 999, color: tone(r.status), borderColor: "currentColor", maxWidth: "70%" }} />
            </Stack>
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.5, overflowWrap: "anywhere" }}>{r.paper.title}</Typography>
            {meta && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{meta}</Typography>}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Button size="small" variant="outlined" color="inherit" sx={{ minHeight: 44, borderColor: "divider" }} aria-label={`${t.openDetails}: ${r.paper.title}`}
                onClick={(e) => open({ sessionId, turnId: turn.id, refId: r.id }, e.currentTarget)}>{t.openDetails}</Button>
              {link && <IconButton component="a" href={link} target="_blank" rel="noopener noreferrer" aria-label={`${t.openSource}: ${r.paper.title}`} sx={{ width: 44, height: 44, color: "text.secondary" }}><OpenInNewRoundedIcon fontSize="small" /></IconButton>}
            </Stack>
          </Box>
        );
      })}
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "flex-start", px: 0.5 }}>
        <InfoOutlinedIcon aria-hidden sx={{ fontSize: 20, color: "text.secondary", mt: 0.25 }} />
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>{t.idCheckNote}</Typography>
      </Stack>
    </Stack>
  );
}

// Right-hand panel: every state and number is derived from `turn.progress`; nothing is estimated.
export function ProgressPanel({ turn, sessionId }: { turn: Turn; sessionId?: string }) {
  const t = useT();
  if (sessionId && turn.status === "done" && !turn.analysis && (turn.answer?.references.length ?? 0) > 0) return <SourcesCompact turn={turn} sessionId={sessionId} />;
  const p = turn.progress;
  const found = Object.values(p.sources).reduce((a, b) => a + b, 0);
  const idx = stageIndex(p), done = p.phase === "done";
  const waiting = p.phase === "waiting";
  const steps = [[t.step1Title, t.step1Desc], [t.step2Title, t.step2Desc], [t.step3Title, t.step3Desc], [t.step4Title, t.step4Desc]];
  const rows: [string, string][] = [
    [t.papersFound, String(found)],
    [t.searchesPlanned, String(p.searches.length)],
    [t.searchesSummarised, String(p.answered.length)],
  ];
  return (
    <Stack spacing={2} component="section" aria-label={t.progress}>
      <Typography component="h2" sx={{ fontSize: "1.0625rem", fontWeight: 700 }}>{t.progress}</Typography>
      <Box sx={card}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1.5 }}>
          <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.researchSteps}</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{stagesDone(p)} / 4</Typography>
        </Stack>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {steps.map(([title, desc], i) => {
            const state = done || i < idx ? "done" : i === idx && !waiting ? "active" : "pending";
            const sub = state === "pending" ? (i === 0 && waiting ? `${t.waiting} ${p.waiting ?? ""}`.trim() : t.stepPending) : desc;
            return (
              <Box component="li" key={i} data-step={i} data-state={state} aria-current={state === "active" ? "step" : undefined}
                sx={{ display: "flex", gap: 1.5, position: "relative", pb: i < 3 ? 2 : 0, minHeight: 44,
                  "&:not(:last-child)::before": { content: '""', position: "absolute", left: 13, top: 28, bottom: 0, width: 2, bgcolor: state === "done" ? "evidence.verified" : "divider" } }}>
                <Box className="node" sx={{
                  width: 28, height: 28, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.8125rem", fontWeight: 700, position: "relative",
                  border: 2, borderColor: state === "done" ? "evidence.verified" : state === "active" ? "primary.main" : "divider",
                  color: state === "done" ? "evidence.verified" : state === "active" ? "primary.main" : "text.secondary",
                  bgcolor: "surface.raised",
                  ...(state === "active" && { [NO_PREF]: { "&::after": { content: '""', position: "absolute", inset: -5, borderRadius: "50%", border: 2, borderColor: "transparent", borderTopColor: "primary.main", animation: "ps-spin 1s linear infinite" }, "@keyframes ps-spin": { to: { transform: "rotate(360deg)" } } } }),
                }}>
                  {state === "done" ? <CheckRoundedIcon sx={{ fontSize: 18 }} titleAccess={t.done} /> : i + 1}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.875rem", fontWeight: state === "active" ? 700 : 600, color: state === "pending" ? "text.secondary" : "text.primary" }}>{title}</Typography>
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>{sub}</Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={card}>
        <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, mb: 1 }}>{t.statusSummary}</Typography>
        <Box component="dl" sx={{ m: 0, display: "grid" }}>
          {rows.map(([k, v], i) => (
            <Box key={k} sx={{ display: "flex", justifyContent: "space-between", gap: 2, borderTop: i ? 1 : 0, borderColor: "divider", py: 1 }}>
              <Box component="dt" sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{k}</Box>
              <Box component="dd" sx={{ m: 0, fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</Box>
            </Box>
          ))}
        </Box>
      </Box>
      <Stack direction="row" spacing={1.25} sx={{ ...card, alignItems: "flex-start" }}>
        <LightbulbOutlinedIcon aria-hidden sx={{ fontSize: 20, color: "evidence.unverified", mt: 0.25 }} />
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>{t.idCheckNote}</Typography>
      </Stack>
    </Stack>
  );
}
