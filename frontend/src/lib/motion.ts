import { createElement, forwardRef, useState, type ReactElement } from "react";
import Fade, { type FadeProps } from "@mui/material/Fade";
import { keyframes } from "@emotion/react";

// Shared motion vocabulary. Motion is CSS under no-preference only (the theme also zeroes durations
// under reduce), so SSR / reduced-motion show the finished state. GSAP stays for the one live pulse.
// Motion tokens (transitions.dev scale) live here and nowhere else; theme.ts publishes them as CSS custom
// properties (--duration-quick, --ease-smooth-out, ...) via motionVars for plain-CSS consumers.
// Rules: CLOSE is faster than OPEN; hover-out is never slower than hover-in; blur only on small swaps/reveals.
export const dur = { stagger: 40, micro: 80, quick: 150, fast: 250, medium: 350, slow: 400, verySlow: 500 } as const;
export const easing = { smoothOut: "cubic-bezier(0.22, 1, 0.36, 1)", inOut: "ease-in-out", out: "ease-out", linear: "linear" } as const;
export const dist = { micro: 4, small: 6, base: 8, medium: 12, large: 30 } as const;
export const scale = { large: 0.96, medium: 0.97, small: 0.98, tiny: 0.99 } as const;
export const blur = { small: 2, medium: 3, large: 8 } as const;
export const ease = easing.smoothOut;
export const motionVars: Record<string, string> = {
  ...Object.fromEntries(Object.entries(dur).map(([k, v]) => [`--duration-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, `${v}ms`])),
  "--ease-smooth-out": easing.smoothOut, "--ease-in-out": easing.inOut, "--ease-out": easing.out, "--ease-linear": easing.linear,
  ...Object.fromEntries(Object.entries(dist).map(([k, v]) => [`--distance-${k}`, `${v}px`])),
  ...Object.fromEntries(Object.entries(scale).map(([k, v]) => [`--scale-${k}`, String(v)])),
  ...Object.fromEntries(Object.entries(blur).map(([k, v]) => [`--blur-${k}`, `${v}px`])),
};
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";

export const prefersReduced = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const rise = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; }`;
const slide = keyframes`from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; }`;
const pop = keyframes`from { opacity: 0; transform: scale(0.5) rotate(-30deg); } to { opacity: 1; transform: none; }`;
const flash = keyframes`from { background-color: color-mix(in srgb, var(--mui-palette-primary-main) 34%, transparent); }`;

const once = (k: ReturnType<typeof keyframes>, ms: number) => ({ [NO_PREF]: { animation: `${k} ${ms}ms ${ease} both` } });
const fade = keyframes`from { opacity: 0; }`;
export const enterFade = once(fade, dur.fast);
export const enterRise = once(rise, dur.fast);
export const enterSlide = once(slide, dur.fast);
export const enterPop = once(pop, dur.fast);
export const enterFlash = once(flash, dur.slow);

// Stage strip (Stages in ProgressCard). The completed segment tracks fill with a shape-origin
// scaleX (decelerating out ease), a completed node draws its check on stroke-dashoffset while the
// node itself settles on a closed-form damped oscillation, the active node pings a soft expanding
// ring and a dot drifts along the unfilled next segment. The two loops share a 1.6s period so the
// strip has one clock. Decorative loop layers are opacity 0 outside the no-preference wrapper, so
// reduced motion and SSR show only the finished static states and nothing content-bearing is hidden.
const stageFill = keyframes`from { transform: scaleX(0); } to { transform: scaleX(1); }`;
const stageCheck = keyframes`from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }`;
const stageSettle = keyframes`
  0% { transform: scale(1); animation-timing-function: ${ease}; }
  42% { transform: scale(1.16); animation-timing-function: ease-in-out; }
  64% { transform: scale(0.94); animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1); }
  84% { transform: scale(1.03); }
  100% { transform: none; }
`;
const stageRing = keyframes`
  0% { transform: scale(0.82); opacity: 0.55; animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1); }
  65%, 100% { transform: scale(1.55); opacity: 0; }
`;
const stageDot = keyframes`
  0% { transform: translateX(0); opacity: 0; }
  12%, 84% { opacity: 1; }
  100% { transform: translateX(100%); opacity: 0; }
`;

export const stageFillSx = once(stageFill, dur.slow);
export const stageCheckSx = once(stageCheck, dur.fast);
export const stageSettleSx = once(stageSettle, dur.slow);
export const stageRingSx = { opacity: 0, [NO_PREF]: { opacity: 1, animation: `${stageRing} 1600ms infinite` } };
export const stageDotSx = { opacity: 0, [NO_PREF]: { opacity: 1, animation: `${stageDot} 1600ms linear infinite` } };

// Sessions whose empty state was shown: their first turn rises when the Thread mounts (EmptyChat -> Thread).
export const wasEmpty = new Set<string>();

// Skeleton wave: static grey bars by default (SSR, reduced motion); under no-preference a translucent band sweeps
// left to right on transform only, each line a little later than the one above so the wave rolls down the block.
const sweep = keyframes`from { transform: translateX(-100%); } to { transform: translateX(100%); }`;
export const skeletonBar = (i: number) => ({
  position: "relative", overflow: "hidden", borderRadius: 999, height: 12,
  bgcolor: "color-mix(in srgb, var(--mui-palette-text-primary) 12%, transparent)",
  [NO_PREF]: { "&::after": { content: '""', position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--mui-palette-primary-main) 26%, transparent), transparent)", animation: `${sweep} 1600ms ${easing.linear} ${i * dur.micro}ms infinite` } },
});

// Finished answer: children of the markdown root rise in one after another (presentational stagger, capped).
export const revealStagger = {
  [NO_PREF]: Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`& > :nth-child(${k + 1})`, { animation: `${rise} ${dur.slow}ms ${ease} ${Math.min(k, 7) * dur.stagger}ms both` }])),
};

// True only when the browser positively reports no-preference, so jsdom/SSR/reduce all take the instant path.
export const canAnimate = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
// A dialog its parent unmounts on close ({x && <Dialog open/>}): hold it open through MUI's exit fade, then tell the parent.
// Motion off (reduce, SSR, jsdom) keeps the old instant path, so callers expecting a synchronous onClose still get one.
export function useExitClose(onClose: () => void) {
  const [open, setOpen] = useState(true);
  return { open, close: () => (canAnimate() ? setOpen(false) : onClose()), onExited: onClose };
}
// List row entrance: rises with a short stagger (first 8 rows only, 40ms apart).
export const enterRow = (i: number) => ({ [NO_PREF]: { animation: `${rise} ${dur.fast}ms ${ease} ${Math.min(i, 8) * dur.stagger}ms backwards` } });
// List row exit: fades and slides out before the entry is removed (see EXIT_MS).
const leave = keyframes`to { opacity: 0; transform: translateX(-12px); }`;
export const EXIT_MS = dur.quick;
export const leaveRow = { [NO_PREF]: { animation: `${leave} ${EXIT_MS}ms ${ease} forwards` }, pointerEvents: "none" } as const;

// MUI transition for popovers/menus/dialogs/tooltips/toasts: Fade plus a scale (and optional rise/blur) from `from`,
// open `enter` ms, close `exit` ms to `exitTo`. The wrapper owns its timing, so MUI's own timeout prop is ignored.
// Reduced motion is handled by the theme zeroing transition durations; the finished state is the resting state.
type Pop = { from: number; exitTo: number; enter: number; exit: number; y?: number; blur?: number };
export const popTransition = ({ from, exitTo, enter, exit, y = 0, blur: b = 0 }: Pop) => {
  const pre = (sc: number, yy: number, bl: number) => ({ transform: `translateY(${yy}px) scale(${sc})`, filter: bl ? `blur(${bl}px)` : "none" });
  const tr = (ms: number) => `opacity ${ms}ms ${ease}, transform ${ms}ms ${ease}, filter ${ms}ms ${ease}`;
  const set = (n: HTMLElement, v: { transform: string; filter: string }) => { n.style.transform = v.transform; n.style.filter = v.filter; };
  return forwardRef<unknown, FadeProps & { children: ReactElement }>(function PopTransition({ timeout: _t, onEnter, onEntering, onExit, onExiting, ...p }, ref) {
    void _t;
    return createElement(Fade, {
      ref, ...p, timeout: { enter, exit }, easing: ease,
      onEnter: (n: HTMLElement, a: boolean) => { set(n, pre(from, y, b)); n.style.transition = tr(enter); void n.offsetHeight; onEnter?.(n, a); },
      onEntering: (n: HTMLElement, a: boolean) => { set(n, { transform: "none", filter: "none" }); onEntering?.(n, a); },
      onExit: (n: HTMLElement) => { n.style.transition = tr(exit); onExit?.(n); },
      onExiting: (n: HTMLElement) => { set(n, pre(exitTo, 0, 0)); onExiting?.(n); },
    });
  });
};
