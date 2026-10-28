"use client";
import { useEffect, useId, useRef } from "react";
import { Box } from "@mui/material";
import gsap from "gsap";

// The "research scan" pixel-art loop: a lens sweeps over an open document while three data points pulse.
// Decorative only: it is not progress and says nothing the progress text does not. Ported from
// docs/design/ai-scientist-pixel-art/research-scan/motion2code/index.html (measured on the 8 source frames, 4 fps, 2 s).
// One clock: a single GSAP timeline calls apply(pose(t)). pose() is a pure function of t; frame(2) equals frame(0).

const DUR = 2;
type K = readonly (readonly [number, number])[];
// [time, value] keyframes measured on the source frames
const LENS_X: K = [[0, 161], [.25, 204], [.5, 245], [.75, 335], [1, 363], [1.25, 334], [1.5, 214], [1.75, 161], [2, 161]];
const LENS_Y: K = [[0, 256], [.25, 264], [.5, 266], [.75, 271], [1, 283], [1.25, 269], [1.5, 265], [1.75, 259], [2, 256]];
const LENS_S: K = [[0, 99], [.25, 105], [.5, 100], [.75, 104], [1, 112], [1.25, 105], [1.5, 100], [1.75, 99], [2, 99]];
const ARM_DX: K = [[0, -73], [.25, -67], [.5, -78], [.75, -75.5], [1, -81.5], [1.25, -82], [1.5, -70], [1.75, -68], [2, -73]];
const ARM_DY: K = [[0, -1], [.25, -2.5], [.5, 1.5], [.75, 4], [1, 3], [1.25, 7], [1.5, 0], [1.75, -4.5], [2, -1]];
const DOTS: readonly K[] = [
  [[0, 0], [.25, .73], [.5, .24], [.75, .98], [1, .03], [1.25, .96], [1.5, .08], [1.75, .07], [2, 0]],
  [[0, .68], [.25, 1], [.5, 1], [.75, .31], [1, .44], [1.25, 1], [1.5, .96], [1.75, 1], [2, .68]],
  [[0, .06], [.25, .66], [.5, .52], [.75, .94], [1, .03], [1.25, .6], [1.5, .6], [1.75, .05], [2, .06]],
];
const BOB: K = [[0, 0], [.25, -6], [.5, -6], [.75, 0], [1, 0], [1.25, -6], [1.5, 0], [1.75, 0], [2, 0]];
const DIM = ["#048090", "#027C8F"], BRIGHT = ["#2AF9F9", "#10E1DD"]; // [head, trail]

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const kf = (t: number, k: K) => { for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])); return k[k.length - 1][1]; };
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, p: number) => { const A = hex(a), B = hex(b); return "#" + A.map((x, i) => Math.round(lerp(x, B[i], p)).toString(16).padStart(2, "0")).join(""); };
const n = (v: number) => String(Math.round(v * 10) / 10);

export function pose(t: number) {
  const x = kf(t, LENS_X), y = kf(t, LENS_Y), s = kf(t, LENS_S), h = s / 2, gh = h - 18, bob = kf(t, BOB);
  const jx = x + kf(t, ARM_DX), jy = y + kf(t, ARM_DY);
  return { x, y, h, gh, jx, jy, dots: DOTS.map((d, i) => { const b = kf(t, d); return { dy: i === 1 ? bob : bob * 0.4, head: mix(DIM[0], BRIGHT[0], b), trail: mix(DIM[1], BRIGHT[1], b) }; }) };
}

function apply(root: SVGSVGElement, t: number) {
  const p = pose(t), q = (r: string) => root.querySelector(`[data-r="${r}"]`)!, all = (r: string) => root.querySelectorAll(`[data-r="${r}"]`);
  const box = (el: Element, o: number, w: number) => { el.setAttribute("x", n(-o)); el.setAttribute("y", n(-o)); el.setAttribute("width", n(w)); el.setAttribute("height", n(w)); };
  q("lens").setAttribute("transform", `translate(${n(p.x)} ${n(p.y)})`);
  all("outer").forEach((e) => box(e, p.h, p.h * 2));
  all("glass").forEach((e) => box(e, p.gh, p.gh * 2));
  q("glassContent").setAttribute("transform", `translate(${n(-p.x)} ${n(-p.y)})`);
  [[-p.h + 3, -p.h + 3], [p.h - 9, -p.h + 3], [-p.h + 3, p.h - 9], [p.h - 9, p.h - 9]].forEach(([rx, ry], i) => { const e = all("rivet")[i]; e.setAttribute("x", n(rx)); e.setAttribute("y", n(ry)); });
  q("joint").setAttribute("transform", `translate(${n(p.jx)} ${n(p.jy)})`);
  all("arm").forEach((e) => { e.setAttribute("width", n(Math.max(0, p.jx - 72))); e.setAttribute("y", n(p.jy - 14)); });
  const top = p.jy - 14;
  all("postH").forEach((e) => { e.setAttribute("y", n(top)); e.setAttribute("height", n(345 - top)); });
  q("postTop").setAttribute("y", n(top));
  p.dots.forEach((d, i) => {
    const g = q(`dot${i}`);
    g.setAttribute("transform", `translate(0 ${n(d.dy)})`);
    g.querySelector(".head")!.setAttribute("fill", d.head);
    g.querySelectorAll(".trail rect").forEach((r) => r.setAttribute("fill", d.trail));
  });
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// size: CSS width of the square. No backdrop: the scene sits directly on the card in both themes.
export function ResearchScan({ size = 88 }: { size?: number | Record<string, number> }) {
  const ref = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/\W/g, "");
  const cp = `${uid}-glass`, pc = `${uid}-page`;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    apply(el, 0); // the still pose: also what reduced motion shows
    if (reduced()) return;
    const clock = { t: 0 };
    const tl = gsap.timeline({ paused: true, repeat: -1 });
    tl.fromTo(clock, { t: 0 }, { t: DUR, duration: DUR, ease: "none", onUpdate: () => apply(el, clock.t) }, 0);
    const vis = () => (document.hidden ? tl.pause() : tl.play());
    tl.play();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); tl.kill(); };
  }, []);
  const d0 = pose(0);
  return (
    <Box aria-hidden="true" sx={{ width: size, aspectRatio: "1", flexShrink: 0, pointerEvents: "none", userSelect: "none" }}>
      <svg ref={ref} viewBox="0 0 528 528" width="100%" height="100%" shapeRendering="crispEdges" focusable="false" style={{ display: "block" }}>
        <defs>
          <clipPath id={cp}><rect data-r="glass" x={-d0.gh} y={-d0.gh} width={d0.gh * 2} height={d0.gh * 2} /></clipPath>
          <g id={pc}>
            <g fill="#4689A5">
              <rect x="126" y="236" width="116" height="6" /><rect x="126" y="260" width="112" height="6" /><rect x="126" y="286" width="120" height="6" /><rect x="126" y="312" width="104" height="6" /><rect x="126" y="334" width="116" height="6" />
              <rect x="292" y="236" width="112" height="6" /><rect x="292" y="264" width="34" height="6" /><rect x="292" y="288" width="34" height="6" /><rect x="292" y="314" width="34" height="6" /><rect x="292" y="334" width="38" height="6" /><rect x="336" y="334" width="76" height="6" />
            </g>
            <rect x="329" y="258" width="82" height="60" fill="#3F7FA0" />
            <path d="M336 308 L346 290 L356 300 L368 280 L380 296 L390 284 L402 304" fill="none" stroke="#084C66" strokeWidth="6" />
          </g>
        </defs>
        <g data-r="dot0"><rect className="head" x="180" y="108" width="26" height="26" /><g className="trail"><rect x="188" y="151" width="8" height="8" /><rect x="188" y="179" width="8" height="8" /></g></g>
        <g data-r="dot1"><rect className="head" x="252" y="88" width="32" height="32" /><g className="trail"><rect x="262" y="129" width="8" height="8" /><rect x="262" y="155" width="8" height="8" /><rect x="262" y="176" width="8" height="8" /></g></g>
        <g data-r="dot2"><rect className="head" x="327" y="108" width="26" height="26" /><g className="trail"><rect x="337" y="151" width="8" height="8" /><rect x="337" y="179" width="8" height="8" /></g></g>
        <rect x="86" y="368" width="356" height="22" fill="#045467" /><rect x="60" y="388" width="408" height="64" fill="#053C50" /><rect x="112" y="398" width="304" height="48" fill="#033949" /><rect x="132" y="408" width="264" height="12" fill="#031A23" />
        <rect x="56" y="394" width="44" height="58" fill="#033949" /><rect x="56" y="394" width="44" height="6" fill="#066F82" /><rect x="432" y="394" width="44" height="58" fill="#033949" /><rect x="432" y="394" width="44" height="6" fill="#066F82" />
        <rect x="70" y="418" width="14" height="14" fill="#08F1E7" /><rect x="448" y="418" width="14" height="14" fill="#08F1E7" />
        <rect x="212" y="430" width="108" height="14" fill="#031A23" /><g fill="#05DDD5"><rect x="214" y="432" width="14" height="10" /><rect x="232" y="432" width="14" height="10" /><rect x="250" y="432" width="14" height="10" /><rect x="268" y="432" width="14" height="10" /><rect x="286" y="432" width="14" height="10" /><rect x="304" y="432" width="14" height="10" /></g>
        <polygon points="92,232 104,224 104,360 268,386 268,392 100,368 90,350" fill="#045467" /><polygon points="436,236 424,226 424,356 268,386 268,392 432,368 442,350" fill="#045467" /><polygon points="96,356 268,380 440,356 432,376 268,388 104,376" fill="#033949" />
        <polygon points="100,226 264,212 264,366 106,348" fill="#DDEEEB" /><polygon points="268,212 414,222 422,348 268,366" fill="#F1F7F4" /><polygon points="106,348 264,366 264,376 108,358" fill="#BFDADD" /><polygon points="268,366 422,348 420,358 268,376" fill="#BFDADD" /><rect x="262" y="212" width="6" height="168" fill="#93B9BC" />
        <use href={`#${pc}`} />
        <g><rect data-r="postH" x="58" y="256" width="22" height="86" fill="#033949" /><rect data-r="postTop" x="58" y="256" width="22" height="6" fill="#066F82" /><rect data-r="postH" x="58" y="256" width="5" height="86" fill="#045467" /></g>
        <rect x="54" y="332" width="30" height="30" fill="#033949" /><rect x="54" y="332" width="30" height="5" fill="#066F82" />
        <rect data-r="arm" x="72" y="270" width="200" height="28" fill="#01485A" /><rect data-r="arm" x="72" y="270" width="200" height="5" fill="#066E82" />
        <g data-r="joint"><rect x="-19" y="-19" width="38" height="38" fill="#033949" /><rect x="-19" y="-19" width="38" height="5" fill="#066F82" /><rect x="-6" y="-6" width="12" height="12" fill="#19E0DA" /></g>
        <g data-r="lens">
          <rect data-r="outer" x="-49.5" y="-49.5" width="99" height="99" fill="#0D2837" /><rect data-r="outer" x="-49.5" y="-49.5" width="99" height="99" fill="none" stroke="#066F82" strokeWidth="3" />
          <rect data-r="glass" x="-31.5" y="-31.5" width="63" height="63" fill="#DFF0EE" />
          <g clipPath={`url(#${cp})`}><use data-r="glassContent" href={`#${pc}`} /></g>
          <rect data-r="glass" x="-31.5" y="-31.5" width="63" height="63" fill="#19E0DA" opacity="0.12" /><rect data-r="glass" x="-31.5" y="-31.5" width="63" height="63" fill="none" stroke="#19E0DA" strokeWidth="3" />
          <g fill="#10DADB"><rect data-r="rivet" width="6" height="6" /><rect data-r="rivet" width="6" height="6" /><rect data-r="rivet" width="6" height="6" /><rect data-r="rivet" width="6" height="6" /></g>
        </g>
      </svg>
    </Box>
  );
}
