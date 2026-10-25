"use client";
import { Box, Stack, Typography } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { stageIndex, stagesDone } from "./ProgressCard";

const card = { border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", p: 2 };
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";

// Right-hand panel: every state and number is derived from `turn.progress`; nothing is estimated.
export function ProgressPanel({ turn }: { turn: Turn }) {
  const t = useT();
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
                  {state === "done" ? <CheckRoundedIcon sx={{ fontSize: 18 }} aria-label={t.done} /> : i + 1}
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
