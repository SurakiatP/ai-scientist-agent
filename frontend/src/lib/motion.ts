import { keyframes } from "@emotion/react";

// Shared motion vocabulary. Motion is CSS under no-preference only (the theme also zeroes durations
// under reduce), so SSR / reduced-motion show the finished state. GSAP stays for the one live pulse.
export const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";

export const prefersReduced = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const rise = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; }`;
const slide = keyframes`from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; }`;
const pop = keyframes`from { opacity: 0; transform: scale(0.5) rotate(-30deg); } to { opacity: 1; transform: none; }`;
const flash = keyframes`from { background-color: color-mix(in srgb, var(--mui-palette-primary-main) 34%, transparent); }`;

const once = (k: ReturnType<typeof keyframes>, ms: number) => ({ [NO_PREF]: { animation: `${k} ${ms}ms ${ease} both` } });
export const enterRise = once(rise, 320);
export const enterSlide = once(slide, 280);
export const enterPop = once(pop, 220);
export const enterFlash = once(flash, 400);

// Stage strip (Stages in ProgressCard). The completed segment tracks fill with a shape-origin
// scaleX (decelerating out ease), a completed node draws its check on stroke-dashoffset while the
// node itself settles on a closed-form damped oscillation, the active node pings a soft expanding
// ring and a dot drifts along the unfilled next segment. The two loops share a 1.6s period so the
// strip has one clock. Decorative loop layers are opacity 0 outside the no-preference wrapper, so
// reduced motion and SSR show only the finished static states and nothing content-bearing is hidden.
const stageFill = keyframes`from { transform: scaleX(0); } to { transform: scaleX(1); }`;
const stageCheck = keyframes`from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }`;
const stageSettle = keyframes`
  0% { transform: scale(1); animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  42% { transform: scale(1.16); animation-timing-function: cubic-bezier(0.33, 0, 0.67, 1); }
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

export const stageFillSx = once(stageFill, 480);
export const stageCheckSx = once(stageCheck, 240);
export const stageSettleSx = once(stageSettle, 440);
export const stageRingSx = { opacity: 0, [NO_PREF]: { opacity: 1, animation: `${stageRing} 1600ms infinite` } };
export const stageDotSx = { opacity: 0, [NO_PREF]: { opacity: 1, animation: `${stageDot} 1600ms linear infinite` } };

// Sessions whose empty state was shown: their first turn rises when the Thread mounts (EmptyChat -> Thread).
export const wasEmpty = new Set<string>();
