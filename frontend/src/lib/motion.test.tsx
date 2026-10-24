// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { gsap } from "gsap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressCard } from "@/components/research/ProgressCard";
import { emptyProgress } from "@/lib/progress";
import { prefersReduced } from "./motion";

const mm = (reduce: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
const turn = { id: "t", question: "Q", createdAt: Date.now(), status: "running" as const, progress: { ...emptyProgress, phase: "searching" as const } };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("motion", () => {
  it("prefersReduced follows the media query", () => {
    mm(true); expect(prefersReduced()).toBe(true);
    mm(false); expect(prefersReduced()).toBe(false);
  });
  it("reduced motion builds no tween; content is in the markup either way", () => {
    const ctx = vi.spyOn(gsap, "context");
    mm(true);
    render(<ProgressCard turn={turn} />);
    expect(ctx).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
  it("no-preference builds the single stage pulse", () => {
    const ctx = vi.spyOn(gsap, "context");
    mm(false);
    render(<ProgressCard turn={turn} />);
    expect(ctx).toHaveBeenCalledTimes(1);
  });
});
