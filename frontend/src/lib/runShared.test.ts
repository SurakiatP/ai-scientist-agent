// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskEvent } from "./sse";

const UR = "dddddddd-0000-4000-8000-000000000001";
type Ev = (AskEvent | { type: "analysis_step"; step: string }) & { _seq?: number };
const api = vi.hoisted(() => ({ attaches: [] as number[], scripts: [] as (() => AsyncGenerator<unknown>)[], mine: true, runStatus: "running", submit: vi.fn(), cancel: vi.fn(async () => {}) }));
vi.mock("./runs", async (orig) => ({
  ...(await orig<typeof import("./runs")>()),
  submitRun: api.submit, cancelRun: api.cancel,
  getRun: async (id: string) => ({ id, status: api.runStatus, mine: api.mine }),
  attachRun: (_id: string, after: number) => { api.attaches.push(after); return (api.scripts.shift() ?? (async function* () {}))(); },
}));
const direct = vi.hoisted(() => ({ asks: 0 }));
vi.mock("./sse", async (orig) => ({ ...(await orig<typeof import("./sse")>()), streamAsk: async function* () { direct.asks++; yield { type: "complete" }; } }));
vi.mock("./sync", async (orig) => ({ ...(await orig<typeof import("./sync")>()), refreshNow: vi.fn(async () => true) }));

const gen = (evs: Ev[]) => async function* () { for (const e of evs) yield e; };
const turnRow = (id: string, extra: object = {}) => ({ id, session_id: "s", idx: 0, question: "q", mode: "deep", status: "running", progress: null, created_at: "2026-01-01T00:00:00Z", updated_at: new Date().toISOString(), version: 1, run_id: UR, ...extra });
async function setup(shared = true) {
  localStorage.clear(); vi.resetModules();
  const sync = await import("./sync");
  sync.useSync.setState({ status: shared ? "online" : "disabled" });
  (await import("./prefs")).usePrefs.setState({ reviewPlan: false });
  const chat = (await import("./chat")).useChatStore;
  const run = await import("./run");
  return { chat, run, sid: chat.getState().newSession() };
}
beforeEach(() => { api.attaches = []; api.scripts = []; api.mine = true; api.runStatus = "running"; direct.asks = 0; api.submit.mockReset(); api.cancel.mockClear(); });

describe("shared mode runs", () => {
  it("startRun submits to the queue (not the old stream) and shows the events as they come", async () => {
    const { chat, run, sid } = await setup();
    api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, mine: true }, turn: turnRow(b.turn_id) }));
    api.scripts.push(gen([{ type: "waiting", position: 2, eta_seconds: 120, _seq: 0 }, { type: "final_answer", content: "ans", references: [], _seq: 1 }, { type: "complete", _seq: 2 }]));
    await run.startRun(sid, "q");
    expect(direct.asks).toBe(0);
    expect(api.submit.mock.calls[0][0]).toMatchObject({ session_id: sid, kind: "ask", question: "q", mode: "deep" });
    expect(chat.getState().sessions[0].turns.at(-1)).toMatchObject({ status: "done", runId: UR, answer: { content: "ans" } });
    expect(run.canStart()).toEqual({ ok: true });
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
    expect(run.canStart()).toEqual({ ok: true });
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
    run.stopRun();
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
  it("Stop does nothing for a run another device started, and cancels one that is ours", async () => {
    let end!: () => void;
    const hang = async function* () { await new Promise<void>((r) => (end = r)); };
    const a = await loaded(false);
    api.scripts.push(hang);
    a.run.attachRunning();
    await vi.waitFor(() => expect(a.run.isAttached("t1")).toBe(true));
    await vi.waitFor(() => expect(api.attaches).toHaveLength(1));
    a.run.stopRun();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(a.run.canStart()).toEqual({ ok: true }); // viewing someone else's run does not take this tab's lock
    end();
    const b = await loaded(true);
    api.attaches = []; api.scripts.push(hang);
    b.run.attachRunning();
    await vi.waitFor(() => expect(b.run.canStart().ok).toBe(false));
    b.run.stopRun();
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
