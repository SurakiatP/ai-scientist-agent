// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskEvent } from "./sse";

const UR = "dddddddd-0000-4000-8000-000000000001";
type Ev = (AskEvent | { type: "analysis_step"; step: string }) & { _seq?: number };
const api = vi.hoisted(() => ({ attaches: [] as number[], scripts: [] as ((signal?: AbortSignal) => AsyncGenerator<unknown>)[], mine: true, runStatus: "running", position: undefined as number | undefined, gets: 0, submit: vi.fn(), cancel: vi.fn(async () => {}) }));
vi.mock("./runs", async (orig) => ({
  ...(await orig<typeof import("./runs")>()),
  submitRun: api.submit, cancelRun: api.cancel,
  getRun: async (id: string) => { api.gets++; return { id, status: api.runStatus, mine: api.mine, position: api.position, eta_seconds: api.position ? 240 : undefined }; },
  attachRun: (_id: string, after: number, signal?: AbortSignal) => { api.attaches.push(after); return (api.scripts.shift() ?? (async function* () {}))(signal); },
}));
const direct = vi.hoisted(() => ({ asks: 0 }));
vi.mock("./sse", async (orig) => ({ ...(await orig<typeof import("./sse")>()), streamAsk: async function* () { direct.asks++; yield { type: "complete" }; } }));
vi.mock("./sync", async (orig) => ({ ...(await orig<typeof import("./sync")>()), refreshNow: vi.fn(async () => true) }));

const gen = (evs: Ev[]) => async function* () { for (const e of evs) yield e; };
const turnRow = (id: string, extra: object = {}) => ({ id, session_id: "s", idx: 0, question: "q", mode: "deep", status: "running", progress: null, created_at: "2026-01-01T00:00:00Z", updated_at: new Date().toISOString(), version: 1, run_id: UR, ...extra });
async function setupWithSync() { const r = await setup(); return { ...r, sync: await import("./sync") }; }
async function setup(shared = true) {
  localStorage.clear(); sessionStorage.clear(); vi.resetModules(); // sessionStorage: runs this tab submitted
  const sync = await import("./sync");
  sync.useSync.setState({ status: shared ? "online" : "disabled" });
  (await import("./prefs")).usePrefs.setState({ reviewPlan: false });
  const chat = (await import("./chat")).useChatStore;
  const run = await import("./run");
  const sid = chat.getState().newSession();
  sync.__versions().set(`session:${sid}`, 1); // the session is already on the server: a submit does not wait for it
  return { chat, run, sid };
}
beforeEach(() => { api.attaches = []; api.scripts = []; api.mine = true; api.runStatus = "running"; api.position = undefined; api.gets = 0; direct.asks = 0; api.submit.mockReset(); api.cancel.mockClear(); });

describe("shared mode runs", () => {
  it("startRun submits to the queue (not the old stream) and shows the events as they come", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, mine: true }, turn: turnRow(b.turn_id) }));
    api.scripts.push(gen([{ type: "waiting", position: 2, eta_seconds: 120, _seq: 0 }, { type: "final_answer", content: "ans", references: [], _seq: 1 }, { type: "complete", _seq: 2 }]));
    await run.startRun(sid, "q");
    expect(direct.asks).toBe(0);
    expect(api.submit.mock.calls[0][0]).toMatchObject({ session_id: sid, kind: "ask", question: "q", mode: "deep" });
    expect(chat.getState().sessions[0].turns.at(-1)).toMatchObject({ status: "done", runId: UR, answer: { content: "ans" } });
    expect(run.canStart(sid)).toEqual({ ok: true });
  });
  it("browser-only mode still uses the old stream", async () => {
    const { run, sid } = await setup(false);
    await run.startRun(sid, "q");
    expect(direct.asks).toBe(1);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it("a refused submit (429 client_busy) throws with its code and leaves no turn and no lock", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockRejectedValue({ message: "", code: "http", status: 429, runCode: "client_busy" });
    const err = await run.startRun(sid, "q").catch((e) => e);
    expect(run.startError(err)).toBe((await import("./strings")).strings.th.runClientBusy);
    expect(chat.getState().sessions[0].turns).toHaveLength(0);
    expect(run.canStart(sid)).toEqual({ ok: true });
  });
  it("stopped and interrupted error codes become statuses, not errors", async () => {
    for (const code of ["stopped", "interrupted"] as const) {
      const { chat, run, sid } = await setup();
      api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, mine: true }, turn: turnRow(b.turn_id) }));
      api.scripts.push(gen([{ type: "error", message: code, code, _seq: 0 } as never]));
      await run.startRun(sid, "q");
      const t = chat.getState().sessions[0].turns.at(-1)!;
      expect(t.status).toBe(code);
      expect(t.error).toBeUndefined();
    }
  });
  it("Stop cancels the server run; the stream then ends with stopped", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, mine: true }, turn: turnRow(b.turn_id) }));
    let end!: () => void;
    api.scripts.push(async function* () { yield { type: "waiting", position: 1, _seq: 0 }; await new Promise<void>((r) => (end = r)); yield { type: "error", message: "stopped", code: "stopped", _seq: 1 }; });
    const p = run.startRun(sid, "q");
    await vi.waitFor(() => expect(chat.getState().sessions[0].turns.at(-1)?.progress.phase).toBe("waiting"));
    run.stopRun(sid);
    expect(api.cancel).toHaveBeenCalledWith(UR);
    end();
    await p;
    expect(chat.getState().sessions[0].turns.at(-1)!.status).toBe("stopped");
  });
  it("a dropped stream resumes after the last seq seen", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, mine: true }, turn: turnRow(b.turn_id) }));
    api.scripts.push(gen([{ type: "waiting", position: 1, _seq: 3 }, { type: "error", message: "", code: "network" } as never]));
    api.scripts.push(gen([{ type: "final_answer", content: "x", references: [], _seq: 4 }, { type: "complete", _seq: 5 }]));
    await run.startRun(sid, "q");
    expect(api.attaches).toEqual([0, 3]);
    expect(chat.getState().sessions[0].turns.at(-1)!.status).toBe("done");
  });
});

describe("429 copy", () => {
  it.each([["client_busy", "runClientBusy"], ["queue_full", "runQueueFull"]] as const)("%s has its own copy in both languages", async (code, key) => {
    const { run } = await setup();
    const { strings } = await import("./strings");
    const { usePrefs } = await import("./prefs");
    for (const lang of ["th", "en"] as const) { usePrefs.setState({ lang }); expect(run.startError({ message: "", code: "http", status: 429, runCode: code })).toBe(strings[lang][key]); }
    expect(strings.en.runClientBusy).toBe("You already have the maximum jobs waiting. Wait for one to finish.");
    expect(strings.en.runQueueFull).toBe("The queue is full. Try again shortly.");
  });
  it("rate_limited keeps the existing request-failed copy with the server detail", async () => {
    const { run } = await setup();
    expect(run.startError({ message: "slow down", code: "http", status: 429, runCode: "rate_limited" })).toMatch(/slow down/);
  });
});

describe("re-attach", () => {
  async function loaded(mine: boolean) {
    const { chat, run, sid } = await setup();
    api.mine = mine;
    chat.getState().addTurn(sid, { id: "t1", question: "q", createdAt: 1, status: "running", progress: (await import("./progress")).emptyProgress, runId: UR });
    return { chat, run, sid };
  }
  it("attaches once per run, whoever started it, and finishes the turn", async () => {
    const { chat, run } = await loaded(false);
    api.scripts.push(gen([{ type: "waiting", position: 1, _seq: 0 }, { type: "final_answer", content: "a", references: [], _seq: 1 }, { type: "complete", _seq: 2 }]));
    run.attachRunning(); run.attachRunning();
    await vi.waitFor(() => expect(chat.getState().sessions[0].turns[0].status).toBe("done"));
    expect(api.attaches).toEqual([0]);
  });
  it("Stop does nothing for a run another device started; ours found again is stoppable from its card without taking the lock", async () => {
    let end!: () => void;
    const hang = async function* () { await new Promise<void>((r) => (end = r)); };
    const a = await loaded(false); const sid = a.sid;
    api.scripts.push(hang);
    a.run.attachRunning();
    await vi.waitFor(() => expect(a.run.isAttached("t1")).toBe(true));
    await vi.waitFor(() => expect(api.attaches).toHaveLength(1));
    a.run.stopRun(sid);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(a.run.canStart(sid)).toEqual({ ok: true }); // viewing someone else's run does not take this tab's lock
    end();
    const b = await loaded(true);
    api.attaches = []; api.scripts.push(hang);
    b.run.attachRunning();
    await vi.waitFor(() => expect(api.attaches).toHaveLength(1));
    expect(b.run.canStart(sid)).toEqual({ ok: true }); // found again after a reload: watched, the tab stays free for a new question
    expect(await b.run.stopTurn("t1")).toBe(true); // ...and Stop on its card still cancels it (the server allows the submitter)
    expect(api.cancel).toHaveBeenCalledWith(UR);
    end();
  });
  it("a turn without a runId still becomes interrupted on bfcache restore; one with a runId does not", async () => {
    const { chat, sid } = await loaded(true);
    const { emptyProgress } = await import("./progress");
    chat.getState().addTurn(sid, { id: "t2", question: "q", createdAt: 1, status: "running", progress: emptyProgress });
    const ev = new Event("pageshow"); Object.assign(ev, { persisted: true });
    window.dispatchEvent(ev);
    const ts = chat.getState().sessions[0].turns;
    expect(ts.find((t) => t.id === "t2")!.status).toBe("interrupted");
    expect(ts.find((t) => t.id === "t1")!.status).toBe("running");
  });
});

describe("queue fixes", () => {
  it("the question shows at once, marked sending, before the server has answered", async () => {
    const { chat, run, sid } = await setup();
    let accept!: (v: unknown) => void;
    api.submit.mockImplementation((b: { turn_id: string }) => new Promise((r) => (accept = () => r({ run: { id: UR, status: "queued", mine: true }, turn: turnRow(b.turn_id) }))));
    api.scripts.push(gen([{ type: "final_answer", content: "a", references: [], _seq: 1 }, { type: "complete", _seq: 2 }]));
    const p = run.startRun(sid, "เร็ว");
    await vi.waitFor(() => expect(api.submit).toHaveBeenCalled());
    const shown = chat.getState().sessions[0].turns.at(-1)!;
    expect(shown).toMatchObject({ question: "เร็ว", status: "running" });
    accept(null);
    await p;
    const id = api.submit.mock.calls[0][0].turn_id;
    expect(chat.getState().sessions[0].turns.filter((t) => t.id === id)).toHaveLength(1); // never added twice
    expect(chat.getState().sessions[0].turns.at(-1)!.status).toBe("done");
  });
  it("a failed submit takes the shown question away again and throws (the composer restores it)", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockRejectedValue({ message: "", code: "http", status: 503 }); // refused: the server has no run
    await expect(run.startRun(sid, "หาย?")).rejects.toMatchObject({ status: 503 });
    expect(chat.getState().sessions[0].turns).toHaveLength(0);
    expect(run.canStart(sid)).toEqual({ ok: true });
  });
  it("a queued run found again shows its position and wait from the run view", async () => {
    const { chat, run, sid } = await setup();
    api.position = 2; api.runStatus = "queued";
    let end!: () => void;
    api.scripts.push(async function* () { await new Promise<void>((r) => (end = r)); });
    chat.getState().addTurn(sid, { id: "t1", question: "q", createdAt: 1, status: "running", progress: (await import("./progress")).emptyProgress, runId: UR });
    run.attachRunning();
    await vi.waitFor(() => expect(chat.getState().sessions[0].turns[0].progress).toMatchObject({ phase: "waiting", waiting: 2, eta: 240 }));
    end();
  });
  it("a stream that closes cleanly with no ending asks the server once and stops following an ended run at once", async () => {
    const { run, sid } = await setup();
    api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, status: "running", mine: true }, turn: turnRow(b.turn_id) }));
    api.scripts.push(gen([{ type: "strategy", reasoning: "r", searches: [], _seq: 1 } as never]));
    api.runStatus = "error";
    const t0 = Date.now();
    await run.startRun(sid, "q");
    expect(Date.now() - t0).toBeLessThan(900); // no backoff sleeps for a clean close
    expect(api.attaches).toEqual([0]);
    expect(api.gets).toBe(1);
  });
  it("opening another session drops streams of runs that are neither in it nor ours", async () => {
    const { chat, run, sid } = await setup();
    api.mine = false;
    let aborted = false;
    api.scripts.push(async function* (signal?: AbortSignal) { await new Promise<void>((r) => signal?.addEventListener("abort", () => { aborted = true; r(); })); });
    chat.getState().addTurn(sid, { id: "t1", question: "q", createdAt: 1, status: "running", progress: (await import("./progress")).emptyProgress, runId: UR });
    run.attachRunning();
    await vi.waitFor(() => expect(run.isAttached("t1")).toBe(true));
    chat.getState().newSession(); // the active session changes
    await vi.waitFor(() => expect(aborted).toBe(true));
    await vi.waitFor(() => expect(run.isAttached("t1")).toBe(false));
  });
});

describe("queue fixes, round 2", () => {
  it("a network loss after the POST went out keeps the turn (same id as the server's) instead of removing it", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockRejectedValue({ message: "", code: "network" });
    await expect(run.startRun(sid, "อาจถึงแล้ว")).rejects.toMatchObject({ code: "network", uncertain: true });
    const ts = chat.getState().sessions[0].turns;
    expect(ts).toHaveLength(1);
    expect(ts[0]).toMatchObject({ question: "อาจถึงแล้ว", status: "interrupted" });
  });
  it("a definite refusal (an http status) removes the shown question", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockRejectedValue({ message: "", code: "http", status: 429, runCode: "queue_full" });
    await expect(run.startRun(sid, "ไม่รับ")).rejects.toMatchObject({ status: 429 });
    expect(chat.getState().sessions[0].turns).toHaveLength(0);
  });
  it("a viewer stream dropped on session switch re-attaches at once when the session is opened again", async () => {
    const { chat, run, sid } = await setup();
    api.mine = false;
    const hang = async function* (signal?: AbortSignal) { await new Promise<void>((r) => signal?.addEventListener("abort", () => r())); };
    api.scripts.push(hang, hang);
    chat.getState().addTurn(sid, { id: "t1", question: "q", createdAt: 1, status: "running", progress: (await import("./progress")).emptyProgress, runId: UR });
    run.attachRunning();
    await vi.waitFor(() => expect(api.attaches).toHaveLength(1));
    chat.getState().newSession();
    await vi.waitFor(() => expect(run.isAttached("t1")).toBe(false));
    chat.getState().setActive(sid);
    await vi.waitFor(() => expect(api.attaches).toHaveLength(2)); // not held back by a "recently ended" mark
  });
});

describe("queue fixes, round 3", () => {
  it("re-attaching replays from the start onto empty progress, so counts are not doubled", async () => {
    const { chat, run, sid } = await setup();
    const { emptyProgress } = await import("./progress");
    const paper = { title: "p", authors: [], url: "https://x.org/p" };
    chat.getState().addTurn(sid, { id: "t1", question: "q", createdAt: 1, status: "running", runId: UR,
      progress: { ...emptyProgress, phase: "searching", searches: [{ term: "a", instructions: "" }], sources: { a: 1 } } }); // what the store already shows
    api.scripts.push(gen([
      { type: "strategy", reasoning: "r", searches: [{ term: "a", instructions: "" }], _seq: 1 } as never,
      { type: "sources", term: "a", papers: [paper], _seq: 2 } as never,
      { type: "final_answer", content: "x", references: [], _seq: 3 },
      { type: "complete", _seq: 4 },
    ]));
    run.attachRunning();
    await vi.waitFor(() => expect(chat.getState().sessions[0].turns[0].status).toBe("done"));
    expect(chat.getState().sessions[0].turns[0].progress.sources).toEqual({ a: 1 });
  });
  it("does not post while the session is still not on the server", async () => {
    const { run, sid, sync } = await setupWithSync();
    sync.__versions().delete(`session:${sid}`);
    sync.useSync.setState({ status: "online" });
    await expect(run.startRun(sid, "q")).rejects.toMatchObject({ status: 409 });
    expect(api.submit).not.toHaveBeenCalled();
  }, 10_000);
});
