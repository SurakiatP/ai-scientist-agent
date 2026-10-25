// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskEvent } from "./sse";

let script: (signal: AbortSignal) => AsyncGenerator<AskEvent>;
vi.mock("./sse", () => ({ streamAsk: (_q: string, signal: AbortSignal) => script(signal) }));

const ref = { id: "R1", status: "verified", paper: { title: "P", authors: [], year: null, doi: null, pmid: null, url: "u" } } as never;
const gen = (evs: AskEvent[]) => async function* () { for (const e of evs) yield e; };
async function setup() {
  localStorage.clear(); vi.resetModules();
  const chat = (await import("./chat")).useChatStore;
  const run = await import("./run");
  return { chat, run, sid: chat.getState().newSession() };
}
const last = (chat: Awaited<ReturnType<typeof setup>>["chat"]) => chat.getState().sessions[0].turns.at(-1)!;

beforeEach(() => { script = gen([]); });

describe("run controller", () => {
  it("done run stores answer and references", async () => {
    const { chat, run, sid } = await setup();
    const evs: AskEvent[] = [{ type: "strategy", reasoning: "r", searches: [{ term: "a", instructions: "" }] }, { type: "final_answer", content: "ans", references: [ref] }, { type: "complete" }];
    script = gen(evs);
    await run.startRun(sid, "q");
    expect(last(chat)).toMatchObject({ status: "done", answer: { content: "ans", references: [ref] } });
    expect(run.canStart()).toEqual({ ok: true });
  });
  it("progress equals folding reduce over events", async () => {
    const { chat, run, sid } = await setup();
    const { reduce, emptyProgress } = await import("./progress");
    const evs: AskEvent[] = [{ type: "waiting", position: 2 }, { type: "strategy", reasoning: "r", searches: [{ term: "a", instructions: "" }] },
      { type: "sources", term: "a", papers: [] }, { type: "answer", term: "a", content: "c" }, { type: "final_answer", content: "x", references: [] }, { type: "complete" }];
    script = gen(evs);
    await run.startRun(sid, "q");
    expect(last(chat).progress).toEqual(evs.reduce(reduce, emptyProgress));
  });
  it("refused stores the reason", async () => {
    const { chat, run, sid } = await setup();
    script = gen([{ type: "refused", reason: "off topic" }]);
    await run.startRun(sid, "q");
    expect(last(chat)).toMatchObject({ status: "refused", refused: "off topic" });
  });
  it("error event stores text", async () => {
    const { chat, run, sid } = await setup();
    script = gen([{ type: "error", message: "", code: "network" }]);
    await run.startRun(sid, "q");
    expect(last(chat).status).toBe("error");
    expect(last(chat).error).toBe("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  });
  it("stream ending without terminal event is cut off", async () => {
    const { chat, run, sid } = await setup();
    script = gen([{ type: "waiting", position: 1 }]);
    await run.startRun(sid, "q");
    expect(last(chat)).toMatchObject({ status: "error", error: "การเชื่อมต่อสิ้นสุดก่อนที่คำตอบจะเสร็จสมบูรณ์" });
  });
  it("abort ends stopped", async () => {
    const { chat, run, sid } = await setup();
    script = async function* (signal) { yield { type: "waiting", position: 1 }; await new Promise((r) => (signal.aborted ? r(0) : signal.addEventListener("abort", r))); };
    const p = run.startRun(sid, "q");
    await Promise.resolve();
    run.stopRun();
    await p;
    expect(last(chat).status).toBe("stopped");
  });
  it("page unload leaves the stored run running so a reload reads interrupted", async () => {
    const { chat, run, sid } = await setup();
    script = async function* (signal) { await new Promise((r) => signal.addEventListener("abort", r)); throw new Error("network"); };
    const p = run.startRun(sid, "q");
    await Promise.resolve();
    window.dispatchEvent(new Event("pagehide"));
    run.stopRun();
    await p;
    try {
      expect(last(chat).status).toBe("running");
      const ev = new Event("pageshow"); Object.assign(ev, { persisted: true });
      window.dispatchEvent(ev); // bfcache restore, no live run: stored "running" becomes interrupted
      expect(last(chat).status).toBe("interrupted");
    } finally { window.dispatchEvent(new Event("pageshow")); }
  });
  it("second run while running rejects busy and adds no turn", async () => {
    const { chat, run, sid } = await setup();
    let release!: () => void;
    script = async function* () { await new Promise<void>((r) => (release = r)); yield { type: "complete" }; };
    const p = run.startRun(sid, "q1");
    expect(run.canStart()).toEqual({ ok: false, reason: "busy" });
    await expect(run.startRun(sid, "q2")).rejects.toThrow("busy");
    expect(chat.getState().sessions[0].turns).toHaveLength(1);
    release();
    await p;
  });
  it("unknown session rejects without streaming or busy state", async () => {
    const { run } = await setup();
    const spy = vi.fn(gen([{ type: "complete" }]));
    script = spy;
    await expect(run.startRun("nope", "q")).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    expect(run.canStart()).toEqual({ ok: true });
  });
  it("throwing storage does not abort a run", async () => {
    const { chat, run, sid } = await setup();
    script = gen([{ type: "final_answer", content: "ans", references: [] }, { type: "complete" }]);
    const orig = chat.getState().patchTurn;
    chat.setState({ patchTurn: () => { throw new Error("quota"); } });
    await expect(run.startRun(sid, "q")).resolves.toBeUndefined();
    chat.setState({ patchTurn: orig });
    expect(run.canStart()).toEqual({ ok: true });
  });
  it("useRunState follows the run", async () => {
    const { run, sid } = await setup();
    const { renderHook, act } = await import("@testing-library/react");
    const { result } = renderHook(() => run.useRunState());
    expect(result.current.turnId).toBeNull();
    let release!: () => void;
    script = async function* () { await new Promise<void>((r) => (release = r)); yield { type: "complete" }; };
    let p!: Promise<void>;
    act(() => { p = run.startRun(sid, "q"); });
    expect(result.current).toMatchObject({ sessionId: sid });
    expect(result.current.turnId).not.toBeNull();
    await act(async () => { release(); await p; });
    expect(result.current.turnId).toBeNull();
  });
});
