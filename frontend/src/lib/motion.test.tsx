// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressCard } from "@/components/research/ProgressCard";
import type { Turn } from "@/lib/chat";
import { emptyProgress, type Progress } from "@/lib/progress";
import { prefersReduced } from "./motion";

const mm = (reduce: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
const prog = (phase: Progress["phase"]): Progress => ({ ...emptyProgress, phase });
const turn = (phase: Progress["phase"]): Turn => ({ id: "t", question: "Q", createdAt: Date.now(), status: "running", progress: prog(phase) });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const states = (c: HTMLElement) => [...c.querySelectorAll("[data-stage]")].map((x) => x.getAttribute("data-state"));
const fills = (c: HTMLElement) => [...c.querySelectorAll("[data-seg]")].map((x) => x.getAttribute("data-fill"));
const segAnims = (c: HTMLElement) => [...c.querySelectorAll("[data-seg]")].map((x) => x.querySelector("[data-anim]") !== null);
const nodeAnims = (c: HTMLElement) => [...c.querySelectorAll("[data-stage]")].map((x) => x.querySelector(":scope > [data-anim]") !== null);
const checks = (c: HTMLElement) => [...c.querySelectorAll("[data-stage]")].filter((x) => x.querySelector("svg")).length;

describe("motion", () => {
  it("prefersReduced follows the media query", () => {
    mm(true); expect(prefersReduced()).toBe(true);
    mm(false); expect(prefersReduced()).toBe(false);
  });

  it("node states, live step, check icons and track fill proportion per phase", () => {
    mm(false);
    const run = (phase: Progress["phase"]) => { const r = render(<ProgressCard turn={turn(phase)} />); const out = [states(r.container), checks(r.container), fills(r.container), r.container.querySelectorAll('[aria-current="step"]').length]; r.unmount(); return out; };
    expect(run("planning")).toEqual([["active", "todo", "todo", "todo"], 0, ["0", "0", "0"], 1]);
    expect(run("searching")).toEqual([["done", "active", "todo", "todo"], 1, ["1", "0", "0"], 1]);
    expect(run("writing")).toEqual([["done", "done", "active", "todo"], 2, ["1", "1", "0"], 1]);
    expect(run("done")).toEqual([["done", "done", "done", "done"], 4, ["1", "1", "1"], 0]);
  });

  it("content is in the ordered-list markup either way; only the active step is current", () => {
    mm(false);
    render(<ProgressCard turn={turn("done")} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items.map((x) => x.getAttribute("aria-current"))).toEqual([null, null, null, null]);
  });

  it("anything complete at mount is static (rows0 rule); a fresh completion animates only its node and outgoing segment", () => {
    mm(false);
    const { container, rerender } = render(<ProgressCard turn={turn("searching")} />);
    expect(container.querySelectorAll("[data-anim]")).toHaveLength(0); // mounted mid-run: node 0 + segment 0 already complete → final state, no animation
    expect(checks(container)).toBe(1);
    rerender(<ProgressCard turn={turn("writing")} />);
    expect(nodeAnims(container)).toEqual([false, true, false, false]);
    expect(segAnims(container)).toEqual([false, true, false]);
    rerender(<ProgressCard turn={turn("done")} />);
    expect(nodeAnims(container)).toEqual([false, false, true, true]);
    expect(segAnims(container)).toEqual([false, false, true]);
    expect(fills(container)).toEqual(["1", "1", "1"]);
    expect(checks(container)).toBe(4);
  });

  it("reduced motion: no animation markers on fresh completions, static states still advance", () => {
    mm(true);
    const { container, rerender } = render(<ProgressCard turn={turn("searching")} />);
    expect(container.querySelectorAll("[data-anim]")).toHaveLength(0);
    expect(checks(container)).toBe(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    rerender(<ProgressCard turn={turn("writing")} />);
    expect(container.querySelectorAll("[data-anim]")).toHaveLength(0);
    expect(states(container)).toEqual(["done", "done", "active", "todo"]);
    expect(fills(container)).toEqual(["1", "1", "0"]);
    expect(checks(container)).toBe(2);
  });
});
