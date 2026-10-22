"use client";
import { useEffect, useRef, useState } from "react";
import { Box, Button } from "@mui/material";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { gsap } from "gsap";
import { landing } from "@/lib/strings";

const th = landing.th;
const en = landing.en;

// One GSAP timeline is the only clock (motion2code). Times are absolute seconds.
export const DUR = 12;
export const FINAL = 10.6; // inside the end hold: the finished run. Server markup and reduced motion show this frame.

// Opening frame, defined once; the reset at 11.75 s sets exactly these values so the loop seam is exact.
const OPEN = {
  type: { attr: { width: 0 } },
  ask: { opacity: 0.45, scale: 1 },
  row: { opacity: 0, x: -10 },
  fade: { opacity: 0 },
  bar: { scaleX: 0 },
  check: { scale: 0 },
  now: { scaleX: 0, opacity: 1 },
  layer: { opacity: 1 },
};

function build(tl: gsap.core.Timeline) {
  gsap.set(".m-bar", { transformOrigin: "0% 50%" });
  gsap.set(".m-check, .m-ask", { transformOrigin: "50% 50%" });
  const now = (i: number, from: number, to: number) =>
    tl.fromTo(`.m-now-${i}`, OPEN.now, { scaleX: 1, duration: to - from, ease: "none" }, from);

  // 0.2-2.3 s: the question is typed, then "ask" is pressed
  now(0, 0.2, 2.3);
  [0.2, 0.9, 1.4].forEach((at, i) =>
    tl.fromTo(`.m-type-${i}`, OPEN.type, { attr: { width: 224 }, duration: i === 2 ? 0.4 : 0.6, ease: "none" }, at));
  tl.fromTo(".m-ask", { opacity: OPEN.ask.opacity }, { opacity: 1, duration: 0.25 }, 1.8)
    .fromTo(".m-ask", { scale: 1 }, { scale: 0.94, duration: 0.1, ease: "power2.in" }, 2.05)
    .fromTo(".m-ask", { scale: 0.94 }, { scale: 1, duration: 0.25, ease: "back.out(3)", immediateRender: false }, 2.15);

  // 2.4-4.2 s: the plan appears, one search term at a time
  now(1, 2.4, 4.2);
  tl.fromTo(".m-plan", OPEN.row, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", stagger: 0.3 }, 2.5);

  // 4.2-7.0 s: papers stream in; each search's count lands as its papers arrive
  now(2, 4.2, 7.0);
  tl.fromTo(".m-paper", OPEN.row, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out", stagger: 0.42 }, 4.3)
    .fromTo(".m-count", OPEN.fade, { opacity: 1, duration: 0.25, stagger: 0.45 }, 4.6);

  // 7.0-10.2 s: the comparative answer is written, then each reference is checked
  now(3, 7.0, 10.2);
  tl.fromTo(".m-head", OPEN.fade, { opacity: 1, duration: 0.3 }, 7.1)
    .fromTo(".m-bar", OPEN.bar, { scaleX: 1, duration: 0.45, ease: "power2.out", stagger: 0.14 }, 7.3)
    .fromTo(".m-cite", OPEN.fade, { opacity: 1, duration: 0.2, stagger: 0.15 }, 8.4)
    .fromTo(".m-ref", OPEN.fade, { opacity: 1, duration: 0.3, stagger: 0.25 }, 8.8)
    .fromTo(".m-check", OPEN.check, { scale: 1, duration: 0.35, ease: "back.out(2.5)", stagger: 0.35 }, 9.3)
    .fromTo(".m-legend", OPEN.fade, { opacity: 1, duration: 0.3 }, 10.0);

  // 10.2-11.2 s: hold on the finished run. 11.2-11.7 s: fade back. 11.75 s: opening values, invisible behind the fade.
  tl.fromTo(".m-layer, .m-now", { opacity: 1 }, { opacity: 0, duration: 0.5, ease: "power1.in", immediateRender: false }, 11.2)
    .fromTo(".m-ask", { opacity: 1 }, { opacity: OPEN.ask.opacity, duration: 0.5, immediateRender: false }, 11.2)
    .set("[class*='m-type-']", OPEN.type, 11.75)
    .set(".m-plan, .m-paper", OPEN.row, 11.75)
    .set(".m-count, .m-head, .m-cite, .m-ref, .m-legend", OPEN.fade, 11.75)
    .set(".m-bar", OPEN.bar, 11.75)
    .set(".m-check", OPEN.check, 11.75)
    .set(".m-now", OPEN.now, 11.75)
    .set(".m-layer", OPEN.layer, 11.75)
    .set({}, {}, DUR);
}

type Anim = { tl: gsap.core.Timeline; duration: number; seek(t: number): void; play(from?: number): void; pause(): void };

export function RunFigure() {
  const root = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const sync = useRef<() => void>(() => {});
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false); // reduced motion: no timeline, so no pause control either

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const dev = process.env.NODE_ENV !== "production";
    const w = window as unknown as { anim?: Anim };
    let onScreen = true;
    let tl: gsap.core.Timeline | undefined;
    let ctx: gsap.Context | undefined;

    const stop = (revert: boolean) => {
      if (revert) ctx?.revert();
      else tl?.time(FINAL); // leave the finished frame on screen
      tl?.kill();
      tl = ctx = undefined;
      if (dev) delete w.anim;
    };
    sync.current = () => {
      if (reduce?.matches) { // static final frame; a timeline is never built
        if (tl) stop(false);
        setStill(true);
        return;
      }
      setStill(false);
      if (!tl) {
        const t = gsap.timeline({ paused: true, repeat: -1 });
        ctx = gsap.context(() => { build(t); t.time(FINAL); }, el); // start on the finished frame the server rendered: no flash
        tl = t;
        // motion2code page contract, for checking the loop seam and seek determinism from the console in dev
        if (dev) w.anim = { tl: t, duration: DUR, seek: (s) => { t.pause(); t.time(s); }, play: (f = 0) => t.play(f), pause: () => t.pause() };
      }
      if (onScreen && !document.hidden && !userPaused.current) tl?.play();
      else tl?.pause();
    };
    const run = () => sync.current();
    const io = typeof IntersectionObserver === "undefined" ? null
      : new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; run(); });
    io?.observe(el);
    document.addEventListener("visibilitychange", run);
    reduce?.addEventListener?.("change", run);
    run();
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", run);
      reduce?.removeEventListener?.("change", run);
      stop(true);
    };
  }, []);

  const togglePause = () => {
    userPaused.current = !userPaused.current;
    setPaused(userPaused.current);
    sync.current(); // pausing holds the current frame; play resumes from it
  };

  return (
    <>
      <Box
        ref={root}
        aria-hidden="true"
        sx={(theme) => {
          const p = (theme.vars ?? theme).palette;
          return {
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
            gap: { xs: 3, md: 3 },
            "& svg": { display: "block", width: "100%", height: "auto", overflow: "visible", maxWidth: { xs: 320, sm: "none" } },
            "& .ink": { fill: p.text.primary },
            "& .ink2": { fill: p.text.secondary },
            "& .accent": { fill: p.primary.main },
            "& .on-accent": { fill: p.primary.contrastText },
            "& .tint": { fill: p.primary.light },
            "& .ok": { fill: p.success.main },
            "& .warn": { fill: "none", stroke: p.warning.main, strokeWidth: 2 },
            "& .warn-mark": { stroke: p.warning.main, strokeWidth: 2, strokeLinecap: "round", fill: "none" },
            "& .tick": { stroke: p.background.paper, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" },
            "& .rule": { stroke: p.divider, fill: "none" },
            "& .field": { fill: p.background.default, stroke: p.divider },
            "& .bar": { fill: p.text.secondary, fillOpacity: 0.3 },
            "& text": { fontSize: 12 },
          };
        }}
      >
        {th.stages.map((label, i) => (
          <Box key={label}>
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
              <Box component="span" sx={{ color: "text.secondary", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{i + 1}</Box>
              <Box component="span" lang="th" sx={{ fontWeight: 600 }}>{label}</Box>
              <Box component="span" lang="en" sx={{ color: "text.secondary", fontSize: "0.8125rem" }}>{en.stages[i]}</Box>
            </Box>
            {/* the "now" bar: lit while this stage runs */}
            <Box sx={{ height: 3, bgcolor: "divider", borderRadius: 2, overflow: "hidden", mt: 1, mb: 2 }}>
              <Box className={`m-now m-now-${i}`} sx={{ height: 1, bgcolor: "primary.main", transformOrigin: "0 50%" }} />
            </Box>
            {STAGES[i]}
          </Box>
        ))}
      </Box>
      {!still && (
        <Button
          variant="text" color="inherit" aria-pressed={paused} onClick={togglePause}
          startIcon={paused ? <PlayArrowIcon /> : <PauseIcon />}
          sx={{
            mt: 2, minHeight: 44, px: 1.5, borderRadius: 1, color: "text.secondary", fontWeight: 500,
            "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 2 },
          }}
        >
          <span lang="th">{th.pause}</span>
          <Box component="span" lang="en" sx={{ ml: 0.75 }}>/ {en.pause}</Box>
        </Button>
      )}
    </>
  );
}

const VB = "0 0 240 192";

const question = (
  <svg viewBox={VB} key="q">
    <defs>
      {th.figQuestion.map((_, i) => (
        <clipPath id={`m-q${i}`} key={i}><rect className={`m-type-${i}`} x={10} y={14 + i * 24} width={224} height={24} /></clipPath>
      ))}
    </defs>
    <rect className="field" x={1} y={1} width={238} height={118} rx={10} />
    <g className="m-layer">
      {th.figQuestion.map((line, i) => (
        <text key={i} className="ink" x={14} y={32 + i * 24} clipPath={`url(#m-q${i})`} style={{ fontSize: 13 }}>{line}</text>
      ))}
    </g>
    <g className="m-ask">
      <rect className="accent" x={164} y={132} width={74} height={36} rx={8} />
      <text className="on-accent" x={201} y={155} textAnchor="middle" style={{ fontSize: 13, fontWeight: 600 }}>{th.figAsk}</text>
    </g>
  </svg>
);

const COUNTS = [14, 9, 11, 6, 8]; // synthetic
const plan = (
  <svg viewBox={VB} key="p">
    <g className="m-layer">
      {th.figQueries.map((q, i) => (
        <g className="m-plan" key={q}>
          <rect className="tint" x={0} y={2 + i * 34} width={240} height={28} rx={14} />
          <text className="ink" x={14} y={20 + i * 34}>{q}</text>
          <text className="ink2 m-count" x={226} y={20 + i * 34} textAnchor="end">{COUNTS[i]}</text>
        </g>
      ))}
    </g>
  </svg>
);

const W = [[150, 110], [138, 96], [156, 120], [128, 88], [146, 104], [134, 116]]; // title line lengths, synthetic
const papers = (
  <svg viewBox={VB} key="s">
    <g className="m-layer">
      {W.map(([a, b], i) => (
        <g className="m-paper" key={i}>
          <rect className="rule" x={0.5} y={2.5 + i * 28} width={64} height={22} rx={5} />
          <text className="ink2" x={32.5} y={17.5 + i * 28} textAnchor="middle" style={{ fontSize: 11 }}>{th.figSources[i % 5]}</text>
          <rect className="bar" x={76} y={6 + i * 28} width={a} height={5} rx={2.5} />
          <rect className="bar" x={76} y={15 + i * 28} width={b} height={5} rx={2.5} />
        </g>
      ))}
    </g>
  </svg>
);

const COLS = [[96, 80, 60], [100, 72, 84]];
const REFS = [150, 132, 142];
const FLAGGED = 2; // synthetic: reference [3] could not be confirmed, so the figure never implies everything verifies
// verified: filled check; flagged: outlined ring with "!" (differs by shape, not only colour)
const okMark = (<><circle className="ok" r={8} /><path className="tick" d="M-3.6 0 L-1 2.7 L3.6 -2.7" /></>);
const warnMark = (<><circle className="warn" r={7} /><path className="warn-mark" d="M0 -3.4 L0 0.8 M0 3.4 L0 3.5" /></>);
const answer = (
  <svg viewBox={VB} key="a">
    <g className="m-layer">
      <g className="m-head">
        <text className="ink" x={0} y={13} style={{ fontWeight: 600 }}>{th.figColumns[0]}</text>
        <text className="ink" x={126} y={13} style={{ fontWeight: 600 }}>{th.figColumns[1]}</text>
        <line className="rule" x1={118.5} y1={2} x2={118.5} y2={62} />
      </g>
      {COLS.map((col, c) => col.map((w, r) => (
        <rect key={`${c}${r}`} className="bar m-bar" x={c ? 126 : 0} y={24 + r * 13} width={w} height={5} rx={2.5} />
      )))}
      <text className="accent m-cite" x={84} y={42} style={{ fontSize: 10 }}>[1]</text>
      <text className="accent m-cite" x={64} y={55} style={{ fontSize: 10 }}>[3]</text>
      <text className="accent m-cite" x={214} y={55} style={{ fontSize: 10 }}>[2]</text>
      {REFS.map((w, i) => (
        <g key={i}>
          <g className="m-ref">
            <text className="ink2" x={0} y={88 + i * 24} style={{ fontSize: 10 }}>[{i + 1}]</text>
            <rect className="bar" x={22} y={81 + i * 24} width={w} height={5} rx={2.5} />
          </g>
          <g className="m-check" transform={`translate(228 ${84 + i * 24})`}>{i === FLAGGED ? warnMark : okMark}</g>
        </g>
      ))}
      <g className="m-legend">
        <g transform="translate(7 162) scale(0.8)">{okMark}</g>
        <text className="ink2" x={20} y={166} style={{ fontSize: 11 }}>{th.figChecked}</text>
        <g transform="translate(7 182) scale(0.8)">{warnMark}</g>
        <text className="ink2" x={20} y={186} style={{ fontSize: 11 }}>{th.figFlagged}</text>
      </g>
    </g>
  </svg>
);

const STAGES = [question, plan, papers, answer];
