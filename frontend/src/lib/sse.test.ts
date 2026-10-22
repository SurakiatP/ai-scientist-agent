import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAsk, type AskEvent } from "./sse";

const enc = new TextEncoder();
function mockFetch(chunks: string[], init: { status?: number; json?: unknown } = {}) {
  const status = init.status ?? 200;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 200
        ? new Response(body, { status })
        : new Response(JSON.stringify(init.json ?? {}), { status }),
    ),
  );
}
async function collect(signal = new AbortController().signal) {
  const out: AskEvent[] = [];
  for await (const e of streamAsk("q", signal)) out.push(e);
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
    expect(await collect()).toEqual([{ type: "error", message: "too long" }]);
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
});
