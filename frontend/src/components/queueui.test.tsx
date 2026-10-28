// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMessage } from "@/components/chat/AgentMessage";
import { ProgressCard } from "@/components/research/ProgressCard";
import { ServerLoad } from "@/components/shell/Sidebar";
import { useChatStore, type Turn } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress } from "@/lib/progress";
import { strings } from "@/lib/strings";
import { useSync } from "@/lib/sync";
import { useLoad } from "@/lib/runs";

const status = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/run", () => ({ useSending: () => false, useStoppable: () => false, stopTurn: vi.fn(async () => true),  useRunState: () => ({ sessionId: null, turnId: null }), useForeign: (id: string) => id === "other", startRun: vi.fn(), startAnalysis: vi.fn(), startError: () => null, approvePlan: vi.fn(), cancelPlan: vi.fn(), stopRun: vi.fn(async () => true), canStart: () => ({ ok: true }) }));

const waiting = (n: number, eta?: number): Turn => ({ id: "t", question: "q", createdAt: Date.now(), status: "running", progress: { ...emptyProgress, phase: "waiting", waiting: n, ...(eta !== undefined ? { eta } : {}) } });
afterEach(cleanup);
beforeEach(() => { usePrefs.setState({ lang: "th" }); });

describe("queue copy", () => {
  it.each([
    [150, "th", "คิวที่ 2 · รอประมาณ 3 นาที"], [30, "th", "คิวที่ 2 · น้อยกว่า 1 นาที"], [undefined, "th", "คิวที่ 2"],
    [150, "en", "Queue 2 · about 3 min"], [30, "en", "Queue 2 · under a minute"], [undefined, "en", "Queue 2"],
  ] as const)("waiting row eta=%s %s", (eta, lang, text) => {
    usePrefs.setState({ lang });
    render(<ProgressCard turn={waiting(2, eta)} />);
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });
  it("a run on another device says so", () => {
    render(<ProgressCard turn={{ ...waiting(1), id: "other" }} />);
    expect(screen.getByText(strings.th.otherDevice)).toBeInTheDocument();
    cleanup();
    render(<ProgressCard turn={waiting(1)} />);
    expect(screen.queryByText(strings.th.otherDevice)).toBeNull();
  });
  it("server error codes are localised at render time, with the English text as fallback", () => {
    const sid = useChatStore.getState().newSession();
    const mk = (extra: Partial<Turn>): Turn => ({ id: "e", question: "q", createdAt: 1, status: "error", progress: emptyProgress, error: "Run failed", ...extra });
    const { rerender } = render(<AgentMessage sessionId={sid} turn={mk({ errCode: "cut_off" })} />);
    expect(screen.getByText(strings.th.cutOff)).toBeInTheDocument();
    usePrefs.setState({ lang: "en" });
    rerender(<AgentMessage sessionId={sid} turn={mk({ errCode: "failed" })} />);
    expect(screen.getByText(strings.en.runFailed)).toBeInTheDocument();
    rerender(<AgentMessage sessionId={sid} turn={mk({})} />);
    expect(screen.getByText("Run failed")).toBeInTheDocument();
  });
});

describe("server load line", () => {
  const q = { research: { running: 1, limit: 4, queued: 2 }, analysis: { running: 0, limit: 3, queued: 0 } };
  let visible = "visible";
  beforeEach(() => {
    vi.useFakeTimers();
    status.fn.mockReset(); status.fn.mockResolvedValue(q);
    // the shared poller calls fetch itself: count only the status requests
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { if (!String(u).endsWith("/v1/runs/status")) return new Response("{}"); return new Response(JSON.stringify(await status.fn())); }));
    useLoad.setState({ q: null });
    visible = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
    useSync.setState({ status: "online" });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); useSync.setState({ status: "disabled" }); });

  it("shows the research pool, polls every 15 s, and pauses while hidden", async () => {
    render(<ServerLoad />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("กำลังทำ 1/4 · รอ 2")).toBeInTheDocument();
    expect(screen.getByText("กำลังทำ 1/4 · รอ 2")).toHaveAttribute("aria-live", "off");
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(status.fn).toHaveBeenCalledTimes(2);
    visible = "hidden";
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(status.fn).toHaveBeenCalledTimes(2);
    visible = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(status.fn).toHaveBeenCalledTimes(3);
  });
  it("is absent in browser-only mode and never calls the API", async () => {
    useSync.setState({ status: "disabled" });
    const { container } = render(<ServerLoad />);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(container).toBeEmptyDOMElement();
    expect(status.fn).not.toHaveBeenCalled();
  });
  it("adds analysis only when it has work", async () => {
    status.fn.mockResolvedValue({ ...q, analysis: { running: 1, limit: 3, queued: 1 } });
    usePrefs.setState({ lang: "en" });
    render(<ServerLoad />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Running 1/4 · 2 waiting · Analysis 1/3 · 1 waiting")).toBeInTheDocument();
  });
});
