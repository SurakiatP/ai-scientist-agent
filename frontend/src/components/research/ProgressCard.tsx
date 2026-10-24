"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { gsap } from "gsap";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import type { Progress } from "@/lib/progress";
import { ease, enterRise, prefersReduced } from "@/lib/motion";
import type { Strings } from "@/lib/strings";

// Backend has no separate "check" phase: stage 4 is only reached when the run is done.
export const stageIndex = (p: Progress) => (p.phase === "waiting" || p.phase === "planning" ? 0 : p.phase === "searching" ? 1 : p.phase === "writing" ? 2 : 3);
export const stagesDone = (p: Progress) => (p.phase === "done" ? 4 : stageIndex(p));
export const statusText = (p: Progress, t: Strings) =>
  p.phase === "waiting" ? `${t.waiting} ${p.waiting ?? ""}`.trim() : p.phase === "planning" ? t.planning : p.phase === "writing" ? t.writing : p.phase === "done" ? t.done : t.searching;

const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// One pulse on the active node, on a single GSAP clock; never built under reduced motion.
function Stages({ p, running }: { p: Progress; running: boolean }) {
  const t = useT();
  const root = useRef<HTMLOListElement>(null);
  const steps = [t.stepPlan, t.stepSearch, t.stepWrite, t.stepCheck];
  const idx = stageIndex(p), done = p.phase === "done";
  useEffect(() => {
    const el = root.current;
    if (!el || !running || done) return;
    if (prefersReduced()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-state='active'] .node", { scale: 1 }, { scale: 1.4, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%" });
    }, el);
    return () => ctx.revert();
  }, [running, done, idx]);
  return (
    <Box component="ol" ref={root} sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.5 }}>
      {steps.map((label, i) => {
        const state = done || i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <Box component="li" key={label} data-stage={i} data-state={state} aria-current={state === "active" ? "step" : undefined}
            sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
            <Box className="node" sx={{
              width: 10, height: 10, borderRadius: "2px",
              bgcolor: state === "todo" ? "surface.raised" : "primary.main",
              border: 1, borderColor: state === "todo" ? "divider" : "primary.main",
              transition: `background-color 240ms ${ease}, border-color 240ms ${ease}`,
            }} />
            <Typography sx={{ fontSize: "0.6875rem", lineHeight: 1.3, textAlign: "center", color: state === "todo" ? "text.secondary" : "text.primary", fontWeight: state === "active" ? 700 : 400 }}>{label}</Typography>
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
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", p: { xs: 1.5, sm: 2 } }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          {/* the only live region: announces phase changes, not every paper or tick */}
          <Typography role="status" aria-live="polite" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{running ? statusText(p, t) : t.progress}</Typography>
          {running && <Elapsed since={turn.createdAt} />}
        </Stack>
        <Stages p={p} running={running} />
        {(p.reasoning || p.searches.length > 0) && (
          <Box>
            <Typography component="h3" sx={{ fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", letterSpacing: "0.03em" }}>{t.researchPlan}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>{t.planNote}</Typography>
            {p.reasoning && <Typography sx={{ mt: 1, fontSize: "0.875rem", lineHeight: 1.7, color: "text.secondary", overflowWrap: "anywhere" }}>{p.reasoning}</Typography>}
            {p.searches.length > 0 && (
              <Box component="ul" sx={{ m: 0, mt: 1, p: 0, listStyle: "none" }}>
                {p.searches.map((s, i) => (
                  <Stack component="li" key={`${s.term}#${i}`} direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", gap: 1, py: 1, borderTop: i === 0 ? 0 : 1, borderColor: "divider", ...enterRise }}>
                    <Typography sx={{ width: 20, flexShrink: 0, fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</Typography>
                    <Typography sx={{ flex: "1 1 160px", minWidth: 0, fontSize: "0.875rem", lineHeight: 1.5, overflowWrap: "anywhere" }}>{s.term}</Typography>
                    {s.term in p.sources && <Chip size="small" variant="outlined" label={`${t.found} ${p.sources[s.term]} ${p.sources[s.term] === 1 ? t.paper : t.papers}`} />}
                    {p.answered.includes(s.term) && <Chip size="small" variant="outlined" icon={<CheckRoundedIcon />} label={t.branchDone} sx={{ color: "evidence.verified", borderColor: "evidence.verified", "& .MuiChip-icon": { color: "inherit", fontSize: 14 } }} />}
                  </Stack>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
