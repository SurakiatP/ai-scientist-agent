import { keyframes } from "@emotion/react";

// Shared motion vocabulary. Motion is CSS under no-preference only (the theme also zeroes durations
// under reduce), so SSR / reduced-motion show the finished state. GSAP stays for the one live pulse.
export const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
const NO_PREF = "@media (prefers-reduced-motion: no-preference)";

export const prefersReduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const rise = keyframes`from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; }`;
const slide = keyframes`from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; }`;
const pop = keyframes`from { opacity: 0; transform: scale(0.5) rotate(-30deg); } to { opacity: 1; transform: none; }`;
const flash = keyframes`from { background-color: color-mix(in srgb, var(--mui-palette-primary-main) 34%, transparent); }`;

const once = (k: ReturnType<typeof keyframes>, ms: number) => ({ [NO_PREF]: { animation: `${k} ${ms}ms ${ease} both` } });
export const enterRise = once(rise, 320);
export const enterSlide = once(slide, 280);
export const enterPop = once(pop, 220);
export const enterFlash = once(flash, 1400);
