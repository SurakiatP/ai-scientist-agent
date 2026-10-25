// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPane } from "@/components/research/PreviewPane";
import { skeletonBar } from "@/lib/motion";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { DEBOUNCE_MS, usePreview } from "./preview";
import type { PreviewEvent } from "./sse";

const streams: { payload: unknown; signal: AbortSignal; push: (e: PreviewEvent) => void; end: () => void }[] = [];
vi.mock("./sse", () => ({
  streamPreview: (payload: unknown, signal: AbortSignal) => {
    const q: PreviewEvent[] = [];
    let wake: (() => void) | null = null;
    let done = false;
    streams.push({ payload, signal, push: (e) => { q.push(e); wake?.(); }, end: () => { done = true; wake?.(); } });
    return (async function* () {
      for (;;) {
        if (q.length) yield q.shift()!;
        else if (done) return;
        else await new Promise<void>((r) => { wake = r; });
      }
    })();
  },
}));

const t = strings.en;
let n = 0;
const created: string[] = [];
const revoked: string[] = [];
beforeEach(() => {
  streams.length = 0; created.length = 0; revoked.length = 0; n = 0;
  usePrefs.setState({ lang: "en" });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => { const u = `blob:x/${++n}`; created.push(u); return u; }, revokeObjectURL: (u: string) => revoked.push(u) }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF")));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const ready = (id: string, pages = 2): PreviewEvent => ({ type: "preview_ready", id, pages, bytes: 4 });

describe("usePreview", () => {
  it("starts at once, then debounces edits and aborts the previous stream", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ p }) => usePreview(p), { initialProps: { p: { v: 1 } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(streams).toHaveLength(1);
    rerender({ p: { v: 2 } });
    rerender({ p: { v: 3 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1); });
    expect(streams).toHaveLength(1); // still waiting for the edits to settle
    expect(streams[0].signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(streams).toHaveLength(2);
    expect(streams[1].payload).toEqual({ v: 3 });
  });

  it("ignores the result of a stale stream and shows the blob of the current one", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ p }) => usePreview(p), { initialProps: { p: { v: 1 } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    rerender({ p: { v: 2 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    await act(async () => { streams[0].push(ready("a")); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.url).toBeNull();
    await act(async () => { streams[1].push({ type: "preview_status", stage: "rendering" }); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.stage).toBe("rendering");
    await act(async () => { streams[1].push(ready("b", 3)); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toMatchObject({ url: "blob:x/1", pages: 3, busy: false });
    expect(vi.mocked(fetch).mock.calls.map((c) => c[0])).toEqual([expect.stringContaining("/v1/reports/preview/b")]);
  });

  it("keeps the previous PDF while rebuilding, revokes it when replaced, and revokes on unmount", async () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ p }) => usePreview(p), { initialProps: { p: { v: 1 } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); streams[0].push(ready("a")); await vi.advanceTimersByTimeAsync(0); });
    rerender({ p: { v: 2 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); });
    expect(result.current).toMatchObject({ busy: true, url: "blob:x/1" });
    await act(async () => { streams[1].push(ready("b")); await vi.advanceTimersByTimeAsync(0); });
    expect(revoked).toEqual(["blob:x/1"]);
    unmount();
    expect(revoked).toEqual(["blob:x/1", "blob:x/2"]);
  });

  it("maps errors, keeps the form payload, and retries at once", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePreview({ v: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); streams[0].push({ type: "error", message: "", code: "http", status: 429 }); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toMatchObject({ busy: false, error: "429" });
    act(() => result.current.retry());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(streams).toHaveLength(2);
    await act(async () => { streams[1].push(ready("a")); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current).toMatchObject({ error: null, url: "blob:x/1" });
  });

  it("makes no request while the payload is null", async () => {
    vi.useFakeTimers();
    renderHook(() => usePreview(null));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(streams).toHaveLength(0);
  });
});

const base = { busy: false, stage: null, url: null, pages: 0, error: null, retry: () => {} } as const;

describe("PreviewPane", () => {
  it("shows the skeleton page and the real stage while the first PDF renders", () => {
    render(<PreviewPane p={{ ...base, busy: true, stage: "queued" }} issue={false} />);
    expect(screen.getByTestId("preview-skeleton")).toBeInTheDocument();
    expect(screen.getByText(t.pvQueued)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.pvBuilding);
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("ready: a titled iframe on the blob URL, announced with the page count", () => {
    render(<PreviewPane p={{ ...base, url: "blob:x/1", pages: 2 }} issue={false} />);
    const f = screen.getByTitle(t.pvFrame);
    expect(f.getAttribute("src")).toBe("blob:x/1");
    expect(screen.getByRole("status")).toHaveTextContent("Preview ready (2 pages)");
    expect(screen.getByRole("link", { name: t.pvOpen })).toBeInTheDocument();
  });
  it("error: plain message and a Retry button", () => {
    const retry = vi.fn();
    render(<PreviewPane p={{ ...base, error: "503", retry }} issue={false} />);
    expect(screen.getByRole("alert")).toHaveTextContent(t.pvErr503);
    screen.getByRole("button", { name: t.pvRetry }).click();
    expect(retry).toHaveBeenCalled();
  });
  it("the skeleton bar is static: animation exists only under prefers-reduced-motion: no-preference", () => {
    const bar = skeletonBar(1) as Record<string, unknown>;
    expect(Object.keys(bar).filter((k) => /anim/i.test(k))).toEqual([]);
    expect(JSON.stringify(bar[`@media (prefers-reduced-motion: no-preference)`])).toContain("animation");
  });
});
