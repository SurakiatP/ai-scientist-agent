"use client";
import { useEffect, useRef } from "react";
import { Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { gsap } from "gsap";
import type { AskEvent, Search } from "@/lib/sse";
import type { Strings } from "@/lib/strings";
import { palette } from "@/theme";

export type Progress = {
  waiting: number | null;
  reasoning: string;
  searches: Search[];
  sources: Record<string, number>; // term -> papers found
  answered: string[]; // terms summarised
  writing: boolean;
  phase: "waiting" | "planning" | "searching" | "writing" | "done";
};

// Backend sends all `sources` before any `answer`, so the first `answer` means writing has started.
export function reduce(p: Progress, e: AskEvent): Progress {
  switch (e.type) {
    case "waiting": return { ...p, waiting: e.position, phase: "waiting" };
    case "strategy": return { ...p, reasoning: e.reasoning, searches: e.searches, phase: "searching" };
    case "sources": return { ...p, sources: { ...p.sources, [e.term]: (p.sources[e.term] ?? 0) + e.papers.length }, phase: p.phase === "writing" ? p.phase : "searching" };
    case "answer": return { ...p, answered: [...p.answered, e.term], writing: true, phase: "writing" };
    case "final_answer": case "complete": return { ...p, writing: false, phase: "done" };
    default: return p;
  }
}

export const emptyProgress: Progress = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };

// Four nodes on one rail. The rail width is state-driven; only the active node pulses,
// on a single GSAP clock, and the pulse is never built under reduced motion.
function RunTrace({ phase, running, t }: { phase: Progress["phase"]; running: boolean; t: Strings }) {
  const root = useRef<HTMLDivElement>(null);
  const steps = [t.stepPlan, t.stepSearch, t.stepWrite, t.stepCheck];
  const idx = phase === "waiting" || phase === "planning" ? 0 : phase === "searching" ? 1 : phase === "writing" ? 2 : 3;
  const done = phase === "done";
  const fill = done ? 100 : idx * (100 / 3);

  useEffect(() => {
    const el = root.current;
    if (!el || !running) return;
    const reduce = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : undefined;
    if (reduce?.matches) return;
    if (!el.querySelector(".run-node-active")) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".run-node-active", { scale: 1 }, {
        scale: 1.4, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "50% 50%",
      });
    }, el);
    return () => ctx.revert();
  }, [running, idx]);

  return (
    <Box ref={root} aria-hidden="true">
      <Box sx={{ position: "relative", mx: "12.5%", height: 2, bgcolor: "divider", borderRadius: 2 }}>
        <Box sx={{
          position: "absolute", inset: "0 auto 0 0", width: `${fill}%`, bgcolor: palette.primary, borderRadius: 2,
          transition: "width 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", mt: "-5px" }}>
        {steps.map((label, i) => {
          const passed = done || i < idx;
          const active = !done && i === idx;
          return (
            <Box key={label} sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <Box
                className={active ? "run-node-active" : undefined}
                sx={{
                  position: "relative", zIndex: 1, width: 10, height: 10, borderRadius: "2px",
                  bgcolor: passed || active ? palette.primary : palette.surface,
                  border: `1px solid ${passed || active ? palette.primary : palette.border}`,
                }}
              />
              <Typography sx={{
                fontSize: "0.6875rem", lineHeight: 1.3, textAlign: "center",
                color: passed || active ? "text.primary" : "text.secondary",
                fontWeight: active ? 600 : 400,
              }}>{label}</Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export function ProgressPanel({ p, running, t }: { p: Progress; running: boolean; t: Strings }) {
  const status = p.phase === "waiting" ? `${t.waiting} ${p.waiting}` : p.phase === "planning" ? t.planning : p.phase === "writing" ? t.writing : p.phase === "done" ? t.done : t.searching;
  return (
    <Stack spacing={2.25}>
      {/* announces phase changes only, not every paper */}
      <Box role="status" aria-live="polite" sx={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{status}</Box>

      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
        {running && (
          // MUI's spinner is a CSS animation; hide it for users who prefer reduced motion
          <CircularProgress size={15} thickness={5} sx={{ color: palette.teal, "@media (prefers-reduced-motion: reduce)": { display: "none" } }} />
        )}
        <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{running ? status : t.progress}</Typography>
      </Stack>

      <RunTrace phase={p.phase} running={running} t={t} />

      {p.reasoning && (
        <Box sx={{ bgcolor: palette.background, borderRadius: 1.5, px: 1.75, py: 1.5 }}>
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", letterSpacing: "0.03em" }}>{t.plan}</Typography>
          <Typography sx={{ mt: 0.5, fontSize: "0.875rem", lineHeight: 1.7, color: "text.secondary" }}>{p.reasoning}</Typography>
        </Box>
      )}

      {p.searches.length > 0 && (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
          {p.searches.map((s, i) => (
            <Stack
              component="li" key={`${s.term}#${i}`} direction="row" spacing={1.5} useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center", py: 1.25, borderTop: i === 0 ? 0 : 1, borderColor: "divider" }}
            >
              <Typography sx={{ width: 20, flexShrink: 0, fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {String(i + 1).padStart(2, "0")}
              </Typography>
              <Typography sx={{ flex: { xs: "1 1 calc(100% - 32px)", sm: "1 1 180px" }, fontSize: "0.875rem", lineHeight: 1.5 }}>{s.term}</Typography>
              <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", gap: 1, ml: { xs: "32px", sm: 0 } }}>
                {s.term in p.sources && <Chip size="small" variant="outlined" label={`${t.found} ${p.sources[s.term]} ${p.sources[s.term] === 1 ? t.paper : t.papers}`} />}
                {p.answered.includes(s.term) && (
                  <Chip size="small" variant="outlined" icon={<CheckRoundedIcon />} label={t.branchDone} sx={{ borderColor: palette.tealLight, bgcolor: palette.tealLight, color: palette.teal, "& .MuiChip-icon": { color: palette.teal, fontSize: 14 } }} />
                )}
              </Stack>
            </Stack>
          ))}
        </Box>
      )}
    </Stack>
  );
}
