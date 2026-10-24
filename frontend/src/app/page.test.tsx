// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "gsap";
import { landing } from "@/lib/strings";
import { FINAL } from "@/components/RunFigure";
import Home from "./page";

// gsap is mocked: the tests pin when the timeline is built, played, paused and killed, not how GSAP tweens.
const m = vi.hoisted(() => {
  const tl: Record<string, ReturnType<typeof import("vitest").vi.fn>> = {};
  return { tl, revert: null as unknown as ReturnType<typeof import("vitest").vi.fn> };
});
vi.mock("gsap", async () => {
  const { vi } = await import("vitest");
  for (const k of ["fromTo", "to", "set", "time", "play", "pause", "kill"]) m.tl[k] = vi.fn(() => m.tl);
  m.revert = vi.fn();
  return {
    gsap: {
      timeline: vi.fn(() => m.tl),
      set: vi.fn(),
      context: vi.fn((fn: () => void) => { fn(); return { revert: m.revert }; }),
    },
  };
});
const tl = m.tl;

// matchMedia whose "reduce" answer can flip at runtime
let mq: { matches: boolean; listeners: Set<() => void>; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
function mockReducedMotion(reduce: boolean) {
  const listeners = new Set<() => void>();
  mq = {
    matches: reduce, listeners,
    addEventListener: vi.fn((_: string, f: () => void) => listeners.add(f)),
    removeEventListener: vi.fn((_: string, f: () => void) => listeners.delete(f)),
  };
  window.matchMedia = vi.fn(() => mq) as unknown as typeof window.matchMedia;
}

// IntersectionObserver whose callback the test drives
let io: { cb: (e: { isIntersecting: boolean }[]) => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } | null;
function FakeIO(cb: (e: { isIntersecting: boolean }[]) => void) {
  io = { cb, observe: vi.fn(), disconnect: vi.fn() };
  return io;
}
const intersect = (v: boolean) => act(() => io!.cb([{ isIntersecting: v }]));

beforeEach(() => {
  vi.clearAllMocks();
  io = null;
  vi.stubGlobal("IntersectionObserver", FakeIO);
  mockReducedMotion(false);
});

const pauseButton = () => screen.getByRole("button", { name: new RegExp(landing.en.pause) });
const lastPlayOrPause = () => {
  const p = Math.max(-1, ...tl.play.mock.invocationCallOrder);
  const q = Math.max(-1, ...tl.pause.mock.invocationCallOrder);
  return p > q ? "play" : "pause";
};

describe("landing page", () => {
  it("has exactly one h1", () => {
    render(<Home />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("every CTA links to /ask", () => {
    render(<Home />);
    const ctas = screen.getAllByRole("link", { name: new RegExp(landing.th.cta) });
    expect(ctas.length).toBeGreaterThan(0);
    for (const a of ctas) expect(a).toHaveAttribute("href", "/ask");
  });

  it("links nowhere external and never to javascript:", () => {
    const { container } = render(<Home />);
    for (const a of container.querySelectorAll("a")) {
      const href = a.getAttribute("href") ?? "";
      expect(href).not.toMatch(/^javascript:/i);
      if (/^https?:/i.test(href)) expect(a.getAttribute("rel")).toContain("noopener");
    }
    expect(container.innerHTML).not.toMatch(/(src|href)="(https?:)?\/\//);
  });

  it("hides the animation from assistive tech and describes it in text", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("figure [aria-hidden='true'] svg")).not.toBeNull();
    expect(container.querySelector("figcaption")).toHaveTextContent(landing.en.figCaption);
  });

  it("marks Latin terms inside Thai text as English", () => {
    const { container } = render(<Home />);
    const marked = [...container.querySelectorAll("[lang='th'] span[lang='en']")].map((e) => e.textContent);
    expect(marked).toEqual(expect.arrayContaining(["arXiv", "PMID"]));
  });

  it("shows a flagged reference in the figure, not only verified ones", () => {
    const { container } = render(<Home />);
    expect(container.querySelectorAll(".m-check .warn")).toHaveLength(1);
    expect(container.querySelectorAll(".m-check .ok")).toHaveLength(2);
  });
});

describe("motion lifecycle", () => {
  it("plays when motion is allowed and the figure is on screen", () => {
    render(<Home />);
    expect(gsap.timeline).toHaveBeenCalledTimes(1);
    expect(lastPlayOrPause()).toBe("play");
  });

  it("pauses off screen and resumes on screen", () => {
    render(<Home />);
    intersect(false);
    expect(lastPlayOrPause()).toBe("pause");
    intersect(true);
    expect(lastPlayOrPause()).toBe("play");
  });

  it("pause button toggles play/pause, and the observer never undoes a user pause", () => {
    render(<Home />);
    const b = pauseButton();
    expect(b).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(lastPlayOrPause()).toBe("pause");
    expect(tl.time).not.toHaveBeenCalledWith(0); // holds the current frame, no jump
    intersect(false); intersect(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(lastPlayOrPause()).toBe("pause");
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-pressed", "false");
    expect(lastPlayOrPause()).toBe("play");
  });

  it("a live switch to reduced motion stops the loop on the final frame", () => {
    render(<Home />);
    tl.play.mockClear();
    act(() => { mq.matches = true; mq.listeners.forEach((f) => f()); });
    expect(tl.time).toHaveBeenLastCalledWith(FINAL);
    expect(tl.kill).toHaveBeenCalled();
    expect(tl.play).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: new RegExp(landing.en.pause) })).toBeNull();
  });

  it("unmount kills the timeline and removes listeners and the observer", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<Home />);
    unmount();
    expect(m.revert).toHaveBeenCalled();
    expect(io!.disconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(mq.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect((window as { anim?: unknown }).anim).toBeUndefined();
  });
});

describe("reduced motion", () => {
  beforeEach(() => mockReducedMotion(true));

  it("builds no timeline and renders the final frame statically", () => {
    const { container } = render(<Home />);
    expect(gsap.timeline).not.toHaveBeenCalled();
    expect(gsap.context).not.toHaveBeenCalled();
    // final frame in plain markup: question fully typed, every stage bar lit, nothing faded out by script
    for (const r of container.querySelectorAll("[class*='m-type-']")) expect(r).toHaveAttribute("width", "224");
    for (const e of container.querySelectorAll("[class*='m-']")) expect((e as HTMLElement).style.opacity).toBe("");
    expect(screen.getByText(landing.th.figFlagged)).toBeInTheDocument();
    expect(screen.getByText(landing.th.figChecked)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(landing.en.pause) })).toBeNull();
  });
});

it("layout skip link has its #content target on every page", () => {
  const src = readFileSync("src/app/layout.tsx", "utf8");
  expect(readFileSync("src/components/SkipLink.tsx", "utf8")).toContain('href="#content"');
  expect(src).toContain("<SkipLink />");
  expect(src).toMatch(/id="content"[^>]*>\{children\}/); // the target wraps every route, not only /
});
