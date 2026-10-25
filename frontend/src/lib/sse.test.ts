import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAsk, type AskEvent, type AskOptions } from "./sse";

const enc = new TextEncoder();
function mockFetch(chunks: string[], init: { status?: number; json?: unknown } = {}) {
  const status = init.status ?? 200;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
  const f = vi.fn(async (...args: [string, RequestInit]) => {
    void args; // tests inspect the request through f.mock.calls
    return status === 200
      ? new Response(body, { status })
      : new Response(JSON.stringify(init.json ?? {}), { status });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
async function collect(signal = new AbortController().signal, opts?: AskOptions) {
  const out: AskEvent[] = [];
  for await (const e of streamAsk("q", signal, opts)) out.push(e);
  return out;
}
afterEach(() => vi.unstubAllGlobals());

describe("streamAsk", () => {
  it("parses events split across chunk boundaries", async () => {
    const s = 'data: {"type":"waiting","position":2}\n\ndata: {"type":"complete"}\n\n';
    mockFetch([s.slice(0, 10), s.slice(10, 41), s.slice(41, 60), s.slice(60)]);
    expect(await collect()).toEqual([{ type: "waiting", position: 2 }, { type: "complete" }]);
  });
  it("handles multibyte characters split mid-sequence", async () => {
    const bytes = enc.encode('data: {"type":"refused","reason":"นอกขอบเขต"}\n\n');
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 40));
        c.enqueue(bytes.slice(40));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    expect(await collect()).toEqual([{ type: "refused", reason: "นอกขอบเขต" }]);
  });
  it("ignores comment and blank lines", async () => {
    mockFetch([": ping\n\n", "\n\n", 'data: {"type":"complete"}\n\n', ": ping\n\n"]);
    expect(await collect()).toEqual([{ type: "complete" }]);
  });
  it("yields an error event on malformed JSON instead of throwing", async () => {
    mockFetch(["data: {nope\n\n", 'data: {"type":"complete"}\n\n']);
    const out = await collect();
    expect(out[0].type).toBe("error");
    expect(out[1]).toEqual({ type: "complete" });
  });
  it("yields an error with the detail on a non-200 response", async () => {
    mockFetch([], { status: 422, json: { detail: [{ msg: "too long" }] } });
    expect(await collect()).toEqual([{ type: "error", message: "too long", code: "http" }]);
  });
  it("stops when aborted", async () => {
    const ac = new AbortController();
    mockFetch(['data: {"type":"waiting","position":1}\n\n', 'data: {"type":"complete"}\n\n']);
    const out: AskEvent[] = [];
    for await (const e of streamAsk("q", ac.signal)) {
      out.push(e);
      ac.abort();
    }
    expect(out).toEqual([{ type: "waiting", position: 1 }]);
  });
  it("normalises \\r\\n and lone \\r split across chunks", async () => {
    mockFetch(['data: {"type":"waiting","position":1}\r', '\n\r', '\ndata: {"type":"complete"}\r\r']);
    expect(await collect()).toEqual([{ type: "waiting", position: 1 }, { type: "complete" }]);
  });
  it("does not yield buffered events after abort, and no error on abort", async () => {
    const ac = new AbortController();
    mockFetch(['data: {"type":"waiting","position":1}\n\ndata: {"type":"waiting","position":2}\n\ndata: {"type":"complete"}\n\n']);
    const out: AskEvent[] = [];
    for await (const e of streamAsk("q", ac.signal)) { out.push(e); ac.abort(); }
    expect(out).toEqual([{ type: "waiting", position: 1 }]);
  });
  it("sends non-default mode, history, plan and plan_only", async () => {
    const f = mockFetch(['data: {"type":"complete"}\n\n']);
    await collect(undefined, {
      mode: "quick",
      history: [{ question: "q0", answer: "a0" }],
      plan: [{ term: "t", instructions: "i" }],
      planOnly: true,
    });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({
      question: "q", mode: "quick", history: [{ question: "q0", answer: "a0" }],
      plan: [{ term: "t", instructions: "i" }], plan_only: true,
    });
  });
  it("omits deep mode, empty history/plan and plan_only", async () => {
    const f = mockFetch(['data: {"type":"complete"}\n\n']);
    await collect(undefined, { mode: "deep", history: [], plan: [], planOnly: false });
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ question: "q" });
  });
});
