"use client";
import { useEffect, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import type { Progress } from "@/lib/progress";
import { ease, enterRise, prefersReduced, stageCheckSx, stageDotSx, stageFillSx, stageRingSx, stageSettleSx } from "@/lib/motion";
import { PlanCard } from "./PlanCard";
import type { Strings } from "@/lib/strings";

// Backend has no separate "check" phase: stage 4 is only reached when the run is done.
export const stageIndex = (p: Progress) => (p.phase === "waiting" || p.phase === "planning" ? 0 : p.phase === "searching" ? 1 : p.phase === "writing" ? 2 : 3);
export const stagesDone = (p: Progress) => (p.phase === "done" ? 4 : stageIndex(p));
export const statusText = (p: Progress, t: Strings) =>
  p.phase === "waiting" ? `${t.waiting} ${p.waiting ?? ""}`.trim() : p.phase === "planning" ? t.planning : p.phase === "writing" ? t.writing : p.phase === "done" ? t.done : t.searching;

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// Progress track: a 22px node per stage on a hairline rail whose completed segments fill with the
// primary colour from their left origin. A completing node settles on a small damped bounce while
// its check draws on stroke-dashoffset, the active node pings a soft expanding ring, and a dot
// drifts along the unfilled part of the next segment. All motion is CSS inside the no-preference
// wrapper from motion.ts (transform/opacity only; one shared 1.6s loop period). Everything already
// complete at mount renders as the finished static state and never animates (rows0 rule).
function Stages({ p, running }: { p: Progress; running: boolean }) {
  const t = useT();
  const steps = [t.stepPlan, t.stepSearch, t.stepWrite, t.stepCheck];
  const idx = stageIndex(p), done = p.phase === "done";
  const [still] = useState(prefersReduced); // reduced motion: render, but never mark anything for animation
  const [seen, setSeen] = useState({ idx, done }); // phase state of the last committed render (render-safe baseline)
  const [win, setWin] = useState({ from: idx, to: idx, fromDone: done, doneNow: done });
  if (seen.idx !== idx || seen.done !== done) {
    // This commit completes stages [from, to): capture the window and advance the baseline in the
    // same render pass (state-from-render), so the marker set is stable across re-renders without refs.
    setWin({ from: seen.idx, to: idx, fromDone: seen.done, doneNow: done });
    setSeen({ idx, done });
  }
  // A node completes "freshly" only for stages inside the transition window; at mount from === to,
  // so rows already complete at first paint carry no animation markers (rows0 rule).
  const fresh = (i: number) => running && !still && !win.fromDone && i >= win.from && (win.doneNow || i < win.to);
  const filled = (j: number) => done || j + 1 <= idx;
  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: 0.75 }}>
      {steps.map((label, i) => {
        const state = done || i < idx ? "done" : i === idx ? "active" : "todo";
        const freshNode = fresh(i);
        return (
          <Box component="li" key={label} data-stage={i} data-state={state} aria-current={state === "active" ? "step" : undefined}
            sx={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
            {i < 3 && (
              <Box aria-hidden data-seg={i} data-fill={filled(i) ? "1" : "0"}
                sx={{ position: "absolute", top: 10, left: "calc(50% + 14px)", right: "calc(-50% + 8px)", height: 2, borderRadius: "999px", bgcolor: "divider", overflowX: "clip", pointerEvents: "none" }}>
                {filled(i) && (
                  <Box data-anim={fresh(i) ? "1" : undefined}
                    sx={{ position: "absolute", inset: 0, borderRadius: "999px", bgcolor: "primary.main", transformOrigin: "0% 50%", ...(fresh(i) ? stageFillSx : {}) }} />
                )}
                {running && state === "active" && (
                  <Box sx={{ position: "absolute", top: "50%", left: 0, width: "100%", height: "6px", marginTop: "-3px", ...stageDotSx, "&::before": { content: '""', position: "absolute", left: 0, top: 0, width: "6px", height: "6px", borderRadius: "50%", bgcolor: "primary.main" } }} />
                )}
              </Box>
            )}
            <Box data-anim={freshNode ? "1" : undefined} sx={{
              position: "relative", width: "22px", height: "22px", borderRadius: "50%", transformOrigin: "50% 50%",
              bgcolor: state === "todo" ? "surface.raised" : "primary.main",
              border: "2px solid", borderColor: state === "todo" ? "divider" : "primary.main",
              transition: `background-color 240ms ${ease}, border-color 240ms ${ease}`,
              ...(freshNode ? stageSettleSx : {}),
            }}>
              {running && state === "active" && <Box aria-hidden sx={{ position: "absolute", inset: -3, borderRadius: "50%", border: "1.5px solid", borderColor: "primary.main", ...stageRingSx }} />}
              {state === "done" && (
                <Box component="svg" aria-hidden viewBox="0 0 22 22" width={22} height={22} sx={{ position: "absolute", inset: 0, display: "block" }}>
                  <Box component="path" d="M6.4 11.4 L9.9 14.9 L15.6 8.2" pathLength={1} fill="none" stroke="var(--mui-palette-primary-contrastText)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} sx={freshNode ? stageCheckSx : {}} />
                </Box>
              )}
            </Box>
            <Typography sx={{ mt: 0.75, fontSize: "0.75rem", lineHeight: 1.25, textAlign: "center", overflowWrap: "anywhere", color: state === "todo" ? "text.secondary" : state === "active" ? "primary.main" : "text.primary", fontWeight: state === "active" ? 700 : state === "done" ? 600 : 400 }}>{label}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

function Elapsed({ since }: { since: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{t.elapsed} {mmss(now - since)}</Typography>;
}

export function ProgressCard({ turn }: { turn: Turn }) {
  const t = useT();
  const p = turn.progress, running = turn.status === "running";
  const [rows0] = useState(p.searches.length); // rows present on mount never animate
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", p: { xs: 1.5, sm: 2 } }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          {/* the only live region: announces phase changes, not every paper or tick */}
          <Typography role="status" aria-live="polite" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{running ? statusText(p, t) : t.progress}</Typography>
          {running && <Elapsed since={turn.createdAt} />}
        </Stack>
        <Stages p={p} running={running} />
        {turn.plan ? (
          // The run goes by the plan the user reviewed: show it read-only, in place of a model-proposed listing.
          <Box>
            <PlanCard searches={turn.plan} editable={false} heading={t.planUsedTitle} onApprove={() => {}} onCancel={() => {}} />
            {p.reasoning && <Typography sx={{ mt: 1.5, fontSize: "0.875rem", lineHeight: 1.7, color: "text.secondary", overflowWrap: "anywhere" }}>{p.reasoning}</Typography>}
          </Box>
        ) : (
          (p.reasoning || p.searches.length > 0) && (
            <Box>
              <Typography component="h3" sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", letterSpacing: "0.03em" }}>{t.researchPlan}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>{t.planNote}</Typography>
              {p.reasoning && <Typography sx={{ mt: 1, fontSize: "0.875rem", lineHeight: 1.7, color: "text.secondary", overflowWrap: "anywhere" }}>{p.reasoning}</Typography>}
              {p.searches.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: "none" }}>
                  {p.searches.map((s, i) => (
                    <Stack component="li" key={`${s.term}#${i}`} direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", gap: 1, py: 1, borderTop: i === 0 ? 0 : 1, borderColor: "divider", ...(i >= rows0 ? enterRise : {}) }}>
                      <Typography sx={{ width: 20, flexShrink: 0, fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</Typography>
                      <Typography sx={{ flex: "1 1 160px", minWidth: 0, fontSize: "0.875rem", lineHeight: 1.5, overflowWrap: "anywhere" }}>{s.term}</Typography>
                      {s.term in p.sources && <Chip size="small" variant="outlined" label={`${t.found} ${p.sources[s.term]} ${p.sources[s.term] === 1 ? t.paper : t.papers}`} />}
                      {p.answered.includes(s.term) && <Chip size="small" variant="outlined" icon={<CheckRoundedIcon />} label={t.branchDone} sx={{ color: "evidence.verified", borderColor: "evidence.verified", "& .MuiChip-icon": { color: "inherit", fontSize: 14 } }} />}
                    </Stack>
                  ))}
                </Box>
              )}
            </Box>
          )
        )}
      </Stack>
    </Box>
  );
}
