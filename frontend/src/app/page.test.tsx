// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { landing } from "@/lib/strings";
import { FINAL } from "@/components/RunFigure";
import Home from "./page";

// gsap is mocked: the tests pin when the timeline plays, not how GSAP tweens.
const tl = vi.hoisted(() => {
  const t: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const k of ["fromTo", "to", "set", "time", "play", "pause"]) t[k] = vi.fn(() => t);
  return t;
});
vi.mock("gsap", () => ({
  gsap: {
    timeline: vi.fn(() => tl),
    set: vi.fn(),
    context: (fn: () => void) => { fn(); return { revert: vi.fn() }; },
  },
}));

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn((q: string) => ({
    matches: reduce && q.includes("prefers-reduced-motion"), media: q,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => { Object.values(tl).forEach((f) => f.mockClear()); });

describe("landing page", () => {
  beforeEach(() => mockReducedMotion(false));

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

  it("plays the timeline when motion is allowed", () => {
    render(<Home />);
    expect(tl.play).toHaveBeenCalled();
  });
});

describe("reduced motion", () => {
  beforeEach(() => mockReducedMotion(true));

  it("shows the static final frame and never starts the timeline", () => {
    const { container } = render(<Home />);
    expect(tl.time).toHaveBeenCalledWith(FINAL);
    expect(tl.play).not.toHaveBeenCalled();
    // the finished run is in the markup: answer checks and legend are rendered
    expect(container.querySelectorAll(".m-check")).toHaveLength(3);
    expect(screen.getByText(landing.th.figChecked)).toBeInTheDocument();
  });
});
