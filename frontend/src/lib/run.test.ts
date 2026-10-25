// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress } from "./progress";
import type { Turn } from "./chat";
import type { AnalyzeEvent, AskEvent, AskOptions } from "./sse";

let script: (signal: AbortSignal) => AsyncGenerator<AskEvent>;
let analyzeScript: (signal: AbortSignal) => AsyncGenerator<AnalyzeEvent>;
let asks: { question: string; opts: AskOptions | undefined }[] = [];
let analyzes: { fileId: string; question: string }[] = [];
vi.mock("./sse", () => ({
  streamAsk: (question: string, signal: AbortSignal, opts?: AskOptions) => { asks.push({ question, opts }); return script(signal); },
  streamAnalyze: (fileId: string, question: string, signal: AbortSignal) => { analyzes.push({ fileId, question }); return analyzeScript(signal); },
}));

const ref = { id: "R1", status: "verified", paper: { title: "P", authors: [], year: null, doi: null, pmid: null, url: "u" } } as never;
const gen = (evs: AskEvent[]) => async function* () { for (const e of evs) yield e; };
const agen = (evs: AnalyzeEvent[]) => async function* () { for (const e of evs) yield e; };
async function setup(reviewPlan = false) {
  localStorage.clear(); vi.resetModules();
  (await import("./prefs")).usePrefs.setState({ reviewPlan });
  const chat = (await import("./chat")).useChatStore;
  const run = await import("./run");
  return { chat, run, sid: chat.getState().newSession() };
}
const last = (chat: Awaited<ReturnType<typeof setup>>["chat"]) => chat.getState().sessions[0].turns.at(-1)!;
const turnOf = (chat: Awaited<ReturnType<typeof setup>>["chat"], sid: string) =>
  chat.getState().sessions.find((s) => s.id === sid)!.turns.at(-1)!;

beforeEach(() => { script = gen([]); analyzeScript = agen([]); asks = []; analyzes = []; });

describe("run controller", () => {
  it("done run stores answer and references", async () => {
    const { chat, run, sid } = await setup();
    const evs: AskEvent[] = [{ type: "strategy", reasoning: "r", searches: [{ term: "a", instructions: "" }] }, { type: "final_answer", content: "ans", references: [ref] }, { type: "complete" }];
    script = gen(evs);
    await run.startRun(sid, "q");
    expect(last(chat)).toMatchObject({ status: "done", answer: { content: "ans", references: [ref] } });
    expect(run.canStart()).toEqual({ ok: true });
  });
  it("history has the last three answered turns, skipping unfinished ones", async () => {
    const { chat, run, sid } = await setup();
    const add = (q: string, p: Partial<Turn> = {}) =>
      chat.getState().addTurn(sid, { id: q, question: q, createdAt: 1, status: "done", progress: emptyProgress, ...p });
    add("q1", { answer: { content: "a1", references: [] } });
    add("q2", { status: "refused" });
    add("q3", { answer: { content: "a3", references: [] } });
    add("q4"); // done but no answer
    add("q5", { answer: { content: "a5", references: [] } });
    add("q6", { answer: { content: "a6", references: [] } });
    add("q7", { answer: { content: "a7", references: [] } });
    script = gen([{ type: "final_answer", content: "now", references: [] }, { type: "complete" }]);
    await run.startRun(sid, "now");
    expect(asks.at(-1)!.opts).toEqual({
      mode: "deep",
      history: [
        { question: "q5", answer: "a5" },
        { question: "q6", answer: "a6" },
        { question: "q7", answer: "a7" },
      ],
    });
  });
  it("quick mode reaches the stream and is stored on the turn", async () => {
    const { chat, run, sid } = await setup();
    script = gen([{ type: "final_answer", content: "a", references: [] }, { type: "complete" }]);
    await run.startRun(sid, "q", { mode: "quick" });
    expect(asks.at(-1)!.opts).toEqual({ mode: "quick", history: [] });
    expect(last(chat).mode).toBe("quick");
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

describe("analysis controller", () => {
  const result = {
    type: "analysis_result" as const,
    quality: { rows: 2, columns: 1, columns_info: [{ name: "a", dtype: "int64", null_pct: 0 }] },
    tables: [{ name: "t", columns: ["a"], rows: [[1], [2]] }],
    findings: ["mean 1.5"],
    timings: { load_s: 0.1, script_s: 0.2, total_s: 0.3 },
    artifacts: [{ id: "a1", name: "fig-1.png", kind: "figure" as const, url: "/v1/artifacts/a1" }],
  };

  it("stores steps, script and result on a kind=analysis turn", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = agen([
      { type: "waiting", position: 1 },
      { type: "analysis_step", step: "profiling" },
      { type: "analysis_step", step: "writing_script" },
      { type: "analysis_script", code: "finding('x')" },
      { type: "analysis_step", step: "running" },
      result,
      { type: "complete" },
    ]);
    await run.startAnalysis(sid, "what?", "f".repeat(32), "data.csv");
    expect(analyzes).toEqual([{ fileId: "f".repeat(32), question: "what?" }]);
    expect(last(chat)).toMatchObject({
      kind: "analysis", status: "done",
      analysis: {
        fileId: "f".repeat(32), fileName: "data.csv",
        steps: ["profiling", "writing_script", "running"], script: "finding('x')",
        findings: ["mean 1.5"], artifacts: [{ id: "a1", name: "fig-1.png", kind: "figure", url: "/v1/artifacts/a1" }],
      },
    });
    expect(last(chat).answer).toBeUndefined();
    expect(run.canStart()).toEqual({ ok: true });
  });

  it("deduplicates repeated steps and keeps a repaired step", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = agen([
      { type: "analysis_step", step: "profiling" }, { type: "analysis_step", step: "profiling" },
      { type: "analysis_step", step: "repairing" }, { type: "complete" },
    ]);
    await run.startAnalysis(sid, "q", "f".repeat(32));
    expect(last(chat).analysis!.steps).toEqual(["profiling", "repairing"]);
    expect(last(chat).analysis!.fileName).toBeUndefined();
  });

  it("status stays running while the stream is open after analysis_result", async () => {
    const { chat, run, sid } = await setup();
    let release!: () => void;
    analyzeScript = async function* () {
      yield { type: "analysis_result", quality: [], tables: [], findings: [], timings: [], artifacts: [] } as never;
      await new Promise<void>((r) => (release = r));
      yield { type: "complete" };
    };
    const p = run.startAnalysis(sid, "q", "f".repeat(32));
    await vi.waitFor(() => expect(last(chat).analysis?.findings).toEqual([]));
    expect(last(chat).status).toBe("running");
    release(); await p;
    expect(last(chat).status).toBe("done");
  });

  it("a complete without a result still finishes honestly with empty data", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = agen([{ type: "complete" }]);
    await run.startAnalysis(sid, "q", "f".repeat(32));
    expect(last(chat)).toMatchObject({ status: "done", analysis: { steps: [] } });
    expect(last(chat).analysis!.tables).toBeUndefined();
  });

  it("refused and error store their text and keep partial analysis", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = agen([{ type: "analysis_step", step: "profiling" }, { type: "refused", reason: "off topic" }]);
    await run.startAnalysis(sid, "q", "f".repeat(32));
    expect(last(chat)).toMatchObject({ status: "refused", refused: "off topic", analysis: { steps: ["profiling"] } });

    analyzeScript = agen([{ type: "analysis_step", step: "profiling" }, { type: "error", message: "too big" }]);
    await run.startAnalysis(sid, "q", "f".repeat(32));
    expect(last(chat)).toMatchObject({ status: "error", error: "too big", analysis: { steps: ["profiling"] } });
  });

  it("a stream that ends without a terminal event is cut off", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = agen([{ type: "analysis_step", step: "running" }]);
    await run.startAnalysis(sid, "q", "f".repeat(32));
    expect(last(chat)).toMatchObject({ status: "error", error: "การเชื่อมต่อสิ้นสุดก่อนที่คำตอบจะเสร็จสมบูรณ์" });
  });

  it("shares the single-run controller with research runs", async () => {
    const { chat, run, sid } = await setup();
    let release!: () => void;
    analyzeScript = async function* () { await new Promise<void>((r) => (release = r)); yield { type: "complete" }; };
    const p = run.startAnalysis(sid, "q1", "f".repeat(32));
    expect(run.canStart()).toEqual({ ok: false, reason: "busy" });
    await expect(run.startRun(sid, "q2")).rejects.toThrow("busy");
    expect(chat.getState().sessions[0].turns).toHaveLength(1);
    release();
    await p;
  });

  it("stop aborts the analysis and stores stopped", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = async function* (signal) { yield { type: "analysis_step", step: "running" }; await new Promise((r) => (signal.aborted ? r(0) : signal.addEventListener("abort", r))); };
    const p = run.startAnalysis(sid, "q", "f".repeat(32));
    await Promise.resolve();
    run.stopRun();
    await p;
    expect(last(chat)).toMatchObject({ status: "stopped", analysis: { steps: ["running"] } });
  });

  it("rejects an unknown session or missing file before state", async () => {
    const { run, sid } = await setup();
    const spy = vi.fn(agen([{ type: "complete" }]));
    analyzeScript = spy;
    await expect(run.startAnalysis("nope", "q", "f".repeat(32))).rejects.toThrow();
    await expect(run.startAnalysis(sid, "q", "")).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    expect(run.canStart()).toEqual({ ok: true });
  });

  it("page unload leaves the stored analysis running for a reload to read as interrupted", async () => {
    const { chat, run, sid } = await setup();
    analyzeScript = async function* (signal) { yield { type: "analysis_step", step: "running" }; await new Promise((r) => signal.addEventListener("abort", r)); throw new Error("network"); };
    const p = run.startAnalysis(sid, "q", "f".repeat(32));
    await vi.waitFor(() => expect(last(chat).analysis?.steps).toEqual(["running"]));
    window.dispatchEvent(new Event("pagehide"));
    run.stopRun();
    await p;
    try {
      expect(last(chat).status).toBe("running");
      const ev = new Event("pageshow"); Object.assign(ev, { persisted: true });
      window.dispatchEvent(ev);
      expect(last(chat)).toMatchObject({ status: "interrupted", analysis: { steps: ["running"] } });
    } finally { window.dispatchEvent(new Event("pageshow")); }
  });
});

describe("plan review flow", () => {
  const proposed = [{ term: "a", instructions: "" }, { term: "b", instructions: "more" }];
  const strategy: AskEvent = { type: "strategy", reasoning: "why", searches: proposed };
  const planEvs: AskEvent[] = [strategy, { type: "complete" }];
  const edited = [{ term: "a!", instructions: "go" }, { term: "b!", instructions: "" }];

  it("a deep run with reviewPlan stores the proposed plan and waits without a search run", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen(planEvs);
    await run.startRun(sid, "q");
    expect(asks).toHaveLength(1); // exactly the plan fetch: no search stream yet
    expect(asks[0].opts).toEqual({ mode: "deep", history: [], planOnly: true });
    expect(turnOf(chat, sid)).toMatchObject({ status: "awaiting_plan", plan: proposed, mode: "deep" });
    expect(run.canStart()).toEqual({ ok: true }); // the lock was released while waiting
  });

  it("holds the single-run lock only while the plan streams, not while waiting", async () => {
    const { chat, run, sid } = await setup(true);
    let release!: () => void;
    script = async function* () { await new Promise<void>((r) => (release = r)); yield strategy; yield { type: "complete" }; };
    const p = run.startRun(sid, "q");
    await Promise.resolve();
    expect(run.canStart()).toEqual({ ok: false, reason: "busy" }); // the fetch itself is the run
    release();
    await p;
    expect(turnOf(chat, sid).status).toBe("awaiting_plan");
    expect(run.canStart()).toEqual({ ok: true });
    // another session can run while the first waits for review
    const sid2 = chat.getState().newSession();
    script = gen([{ type: "final_answer", content: "x", references: [] }, { type: "complete" }]);
    await run.startRun(sid2, "q2", { mode: "quick" });
    expect(chat.getState().sessions.find((s) => s.id === sid2)!.turns[0].status).toBe("done");
  });

  it("approve runs the real stream with the edited plan in the request body", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen(planEvs);
    await run.startRun(sid, "q");
    const tid = turnOf(chat, sid).id;
    script = gen([{ type: "final_answer", content: "ans", references: [] }, { type: "complete" }]);
    await run.approvePlan(sid, tid, edited);
    expect(asks).toHaveLength(2);
    expect(asks[1].opts).toEqual({ mode: "deep", history: [], plan: edited });
    expect(turnOf(chat, sid)).toMatchObject({ status: "done", answer: { content: "ans" }, plan: edited });
    expect(run.canStart()).toEqual({ ok: true });
  });

  it("a throwing patchTurn in approve still releases the single-run lock", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen(planEvs);
    await run.startRun(sid, "q");
    const tid = turnOf(chat, sid).id;
    const orig = chat.getState().patchTurn;
    chat.setState({ patchTurn: () => { throw new Error("quota"); } });
    await expect(run.approvePlan(sid, tid, edited)).rejects.toThrow("quota");
    chat.setState({ patchTurn: orig });
    expect(run.canStart()).toEqual({ ok: true });
  });

  it("approve streams the last three answered turns as history", async () => {
    const { chat, run, sid } = await setup(true);
    const seed = (q: string) => chat.getState().addTurn(sid, { id: q, question: q, createdAt: 1, status: "done", progress: emptyProgress, answer: { content: `a-${q}`, references: [] } });
    seed("q1"); seed("q2"); seed("q3"); seed("q4");
    script = gen(planEvs);
    await run.startRun(sid, "q");
    script = gen([{ type: "final_answer", content: "x", references: [] }, { type: "complete" }]);
    await run.approvePlan(sid, turnOf(chat, sid).id, edited);
    expect(asks[1].opts?.history).toEqual([
      { question: "q2", answer: "a-q2" }, { question: "q3", answer: "a-q3" }, { question: "q4", answer: "a-q4" },
    ]);
  });

  it("approve is refused while another run holds the lock, and the turn stays waiting", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen(planEvs);
    await run.startRun(sid, "q");
    const tid = turnOf(chat, sid).id;
    const sid2 = chat.getState().newSession();
    let release!: () => void;
    script = async function* () { await new Promise<void>((r) => (release = r)); };
    const p = run.startRun(sid2, "q2"); // plan fetch pending elsewhere
    await Promise.resolve();
    expect(turnOf(chat, sid).status).toBe("awaiting_plan");
    await expect(run.approvePlan(sid, tid, edited)).rejects.toThrow("busy");
    expect(asks).toHaveLength(2); // only the two plan fetches; no search stream started
    release();
    await p;
  });

  it("approve rejects a missing, non-waiting or already-approved turn without streaming", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen(planEvs);
    await run.startRun(sid, "q");
    const tid = turnOf(chat, sid).id;
    await expect(run.approvePlan("no-session", tid, edited)).rejects.toThrow();
    await expect(run.approvePlan(sid, "no-turn", edited)).rejects.toThrow();
    expect(asks).toHaveLength(1);
    script = gen([{ type: "final_answer", content: "x", references: [] }, { type: "complete" }]);
    await run.approvePlan(sid, tid, edited); // firsthand approval succeeds
    expect(turnOf(chat, sid).status).toBe("done");
    script = gen(planEvs); // a second approval of the same turn is guarded, not a live stream
    await expect(run.approvePlan(sid, tid, edited)).rejects.toThrow("not awaiting");
    expect(asks).toHaveLength(2);
  });

  it("cancel marks the waiting turn stopped; it stays stopped and cannot be approved", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen(planEvs);
    await run.startRun(sid, "q");
    const tid = turnOf(chat, sid).id;
    run.cancelPlan(sid, tid);
    expect(turnOf(chat, sid)).toMatchObject({ status: "stopped", plan: proposed });
    script = gen([{ type: "final_answer", content: "x", references: [] }, { type: "complete" }]);
    await expect(run.approvePlan(sid, tid, edited)).rejects.toThrow();
    expect(turnOf(chat, sid).status).toBe("stopped");
    expect(asks).toHaveLength(1);
  });

  it("cancel ignores a turn that is not waiting for review", async () => {
    const { chat, run, sid } = await setup();
    chat.getState().addTurn(sid, { id: "done-1", question: "d", createdAt: 1, status: "done", progress: emptyProgress });
    run.cancelPlan(sid, "done-1");
    expect(chat.getState().sessions[0].turns[0].status).toBe("done");
    run.cancelPlan(sid, "missing");
  });

  it("reviewPlan off skips the pause and streams the search directly", async () => {
    const { chat, run, sid } = await setup(false);
    script = gen(planEvs); // a strategy event arrives as usual for a full run
    await run.startRun(sid, "q");
    expect(asks).toHaveLength(1);
    expect(asks[0].opts).toEqual({ mode: "deep", history: [] });
    expect(turnOf(chat, sid).progress.searches).toEqual(proposed); // folded into live progress, not stored as the plan
    expect(turnOf(chat, sid)).toMatchObject({ status: "error" }); // stream ended without an answer
  });

  it("quick mode never pauses, even with reviewPlan on", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen([{ type: "final_answer", content: "a", references: [] }, { type: "complete" }]);
    await run.startRun(sid, "q", { mode: "quick" });
    expect(asks).toHaveLength(1);
    expect(asks[0].opts).toEqual({ mode: "quick", history: [] });
    expect(turnOf(chat, sid)).toMatchObject({ status: "done", answer: { content: "a" } });
    expect(turnOf(chat, sid).plan).toBeUndefined();
  });

  it("a refused plan stores the refusal", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen([{ type: "refused", reason: "off topic" }]);
    await run.startRun(sid, "q");
    expect(turnOf(chat, sid)).toMatchObject({ status: "refused", refused: "off topic" });
  });

  it("a plan stream that dies without a proposal is cut off", async () => {
    const { chat, run, sid } = await setup(true);
    script = gen([]);
    await run.startRun(sid, "q");
    expect(turnOf(chat, sid)).toMatchObject({ status: "error", error: "การเชื่อมต่อสิ้นสุดก่อนที่คำตอบจะเสร็จสมบูรณ์" });
    script = gen([{ type: "error", message: "", code: "network" }]); // the next question fails the same way
    await run.startRun(sid, "q2");
    expect(turnOf(chat, sid)).toMatchObject({ status: "error", error: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" });
    expect(run.canStart()).toEqual({ ok: true });
  });

  describe("answer research (chat) mode", () => {
    const addDone = (chat: Awaited<ReturnType<typeof setup>>["chat"], sid: string, q: string, content: string, refs = [ref] as never[], status: Turn["status"] = "done") =>
      chat.getState().addTurn(sid, { id: q, question: q, createdAt: 1, status, progress: emptyProgress, answer: { content, references: refs } });
    it("sends only finished answers as memory, oldest first, with no plan pause and no history", async () => {
      const { chat, run, sid } = await setup(true); // review-plan ON must not pause chat
      addDone(chat, sid, "q1", "a1");
      addDone(chat, sid, "q2", "a2", [], "error");
      addDone(chat, sid, "q3", "a3");
      script = gen([{ type: "final_answer", content: "from memory", references: [ref] }, { type: "complete" }]);
      await run.startRun(sid, "shorter", { mode: "chat" });
      expect(asks).toHaveLength(1);
      expect(asks[0].opts).toMatchObject({ mode: "chat", history: [] });
      expect(asks[0].opts?.planOnly).toBeUndefined();
      expect(asks[0].opts?.memory?.map((m) => [m.question, m.answer])).toEqual([["q1", "a1"], ["q3", "a3"]]);
      expect(asks[0].opts?.memory?.[0].references[0]).toEqual({ id: "R1", title: "P", authors: [], year: null, doi: null, pmid: null, url: "u", status: "verified" });
      expect(last(chat)).toMatchObject({ mode: "chat", status: "done", answer: { content: "from memory" } });
    });
    it("clamps memory: newest turns, answer length, reference budget", async () => {
      const { chat, run, sid } = await setup();
      for (let i = 0; i < 10; i++) addDone(chat, sid, `q${i}`, "x".repeat(7000), Array.from({ length: 10 }, (_, k) => ({ ...(ref as object), id: String(k) })) as never[]);
      script = gen([{ type: "complete" }]);
      await run.startRun(sid, "q", { mode: "chat" });
      const mem = asks[0].opts!.memory!;
      expect(mem.map((m) => m.question)).toEqual(["q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"]);
      expect(mem.every((m) => m.answer.length === run.MEMORY_ANSWER)).toBe(true);
      expect(mem.reduce((n, m) => n + m.references.length, 0)).toBe(run.MEMORY_REFS);
      expect(mem.at(-1)!.references).toHaveLength(10); // the budget goes to the newest turns
    });
  });
});
