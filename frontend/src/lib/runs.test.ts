// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachRun, cancelRun, clientId, queueStatus, submitRun } from "./runs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RID = "dddddddd-0000-4000-8000-000000000001";
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => vi.fn(async (...args: [string, RequestInit]) => (void args, new Response(JSON.stringify(body), { status })));

describe("client id", () => {
  it("is created once and persists", () => {
    const a = clientId();
    expect(a).toMatch(UUID);
    expect(clientId()).toBe(a);
    expect(localStorage.getItem("scientist-client-v1")).toBe(a);
  });
  it("works on plain http where crypto.randomUUID does not exist", () => {
    localStorage.clear();
    const orig = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    try { expect(clientId()).toMatch(UUID); } finally { Object.defineProperty(crypto, "randomUUID", { configurable: true, value: orig }); }
  });
  it("is regenerated when the stored value is not a uuid", () => {
    localStorage.setItem("scientist-client-v1", "nope");
    const a = clientId();
    expect(a).toMatch(UUID);
    expect(localStorage.getItem("scientist-client-v1")).toBe(a);
  });
});

describe("runs API", () => {
  it("submit sends X-Client-Id and returns run and turn", async () => {
    const f = reply(202, { run: { id: RID, status: "queued", mine: true }, turn: { id: "t" } });
    vi.stubGlobal("fetch", f);
    const r = await submitRun({ session_id: "s", turn_id: "t", kind: "ask", question: "q" });
    expect(r.run.id).toBe(RID);
    const [url, init] = f.mock.calls[0];
    expect(url).toMatch(/\/v1\/runs$/);
    expect((init.headers as Record<string, string>)["X-Client-Id"]).toBe(clientId());
  });
  it.each(["client_busy", "queue_full", "rate_limited"])("429 %s keeps its code", async (code) => {
    vi.stubGlobal("fetch", reply(429, { detail: "d", code }));
    await expect(submitRun({ session_id: "s", turn_id: "t", kind: "ask", question: "q" })).rejects.toMatchObject({ code: "http", status: 429, runCode: code });
  });
  it("cancel posts with the client id; status needs none", async () => {
    const f = reply(200, { research: { running: 1, limit: 4, queued: 0 } });
    vi.stubGlobal("fetch", f);
    await cancelRun(RID);
    expect(f.mock.calls[0][0]).toMatch(new RegExp(`/v1/runs/${RID}/cancel$`));
    expect((f.mock.calls[0][1].headers as Record<string, string>)["X-Client-Id"]).toBe(clientId());
    expect((await queueStatus()).research.limit).toBe(4);
    expect((f.mock.calls[1][1].headers as Record<string, string>)["X-Client-Id"]).toBeUndefined();
  });
  it("attach resumes with ?after= and exposes each event's seq", async () => {
    const f = vi.fn(async (...args: [string, RequestInit]) => (void args, new Response('id: 4\ndata: {"type":"waiting","position":1,"eta_seconds":90}\n\ndata: {"type":"waiting","position":1}\n\nid: 5\ndata: {"type":"complete"}\n\n')));
    vi.stubGlobal("fetch", f);
    const out = [];
    for await (const e of attachRun(RID, 3, new AbortController().signal)) out.push(e);
    expect(f.mock.calls[0][0]).toMatch(new RegExp(`/v1/runs/${RID}/events\\?after=3$`));
    expect(out).toEqual([{ type: "waiting", position: 1, eta_seconds: 90, _seq: 4 }, { type: "waiting", position: 1 }, { type: "complete", _seq: 5 }]);
  });
});
