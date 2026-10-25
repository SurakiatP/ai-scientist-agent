import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAnalyze, streamAsk, uploadFile, UploadError, type AnalyzeEvent, type AskEvent, type AskOptions } from "./sse";

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

describe("streamAnalyze", () => {
  async function collectAnalyze(signal = new AbortController().signal) {
    const out: AnalyzeEvent[] = [];
    for await (const e of streamAnalyze("f".repeat(32), "what?", signal)) out.push(e);
    return out;
  }

  it("posts file_id and question, then parses every analysis event", async () => {
    const events = [
      'data: {"type":"waiting","position":1}\n\n',
      'data: {"type":"analysis_step","step":"profiling"}\n\n',
      'data: {"type":"analysis_script","code":"finding(df.a.mean())"}\n\n',
      'data: {"type":"analysis_result","quality":{"rows":3,"columns":2,"columns_info":[{"name":"a","dtype":"int64","null_pct":0}]},"tables":[{"name":"t","columns":["x"],"rows":[[1]]}],"findings":["mean 2"],"timings":{"total_s":0.1},"artifacts":[{"id":"a1","name":"fig-1.png","kind":"figure","url":"/v1/artifacts/a1"}]}\n\n',
      'data: {"type":"complete"}\n\n',
    ];
    const f = mockFetch(events);
    const out = await collectAnalyze();
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ file_id: "f".repeat(32), question: "what?" });
    expect(f.mock.calls[0][0]).toMatch(/\/v1\/async\/analyze$/);
    expect(out.map((e) => e.type)).toEqual(["waiting", "analysis_step", "analysis_script", "analysis_result", "complete"]);
    expect(out[3]).toMatchObject({ quality: { rows: 3 }, findings: ["mean 2"], timings: { total_s: 0.1 } });
  });

  it("yields the same malformed, network and HTTP errors as streamAsk", async () => {
    mockFetch(["data: {nope\n\n"]);
    expect((await collectAnalyze())[0]).toEqual({ type: "error", message: "", code: "malformed" });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect((await collectAnalyze())[0]).toEqual({ type: "error", message: "", code: "network" });

    mockFetch([], { status: 422, json: { detail: [{ msg: "Value error, question is empty" }] } });
    expect((await collectAnalyze())[0]).toEqual({ type: "error", message: "question is empty", code: "http" });
  });

  it("stops yielding after abort", async () => {
    const ac = new AbortController();
    mockFetch(['data: {"type":"analysis_step","step":"running"}\n\n', 'data: {"type":"complete"}\n\n']);
    const out: AnalyzeEvent[] = [];
    for await (const e of streamAnalyze("f".repeat(32), "q", ac.signal)) { out.push(e); ac.abort(); }
    expect(out).toEqual([{ type: "analysis_step", step: "running" }]);
  });
});

describe("uploadFile", () => {
  const file = () => new File(["a,b\n1,2\n"], "data.csv", { type: "text/csv" });

  it("posts one multipart file field and returns the upload", async () => {
    const f = mockFetchJson({ id: "a".repeat(32), name: "data.csv", size: 8, kind: "csv" });
    await expect(uploadFile(file(), new AbortController().signal)).resolves.toEqual({ id: "a".repeat(32), name: "data.csv", size: 8, kind: "csv" });
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/files$/);
    expect(init?.method).toBe("POST");
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("data.csv");
  });

  it("accepts the backend's content_type as the kind", async () => {
    mockFetchJson({ id: "b".repeat(32), name: "data.csv", size: 8, content_type: "text/csv" });
    await expect(uploadFile(file(), new AbortController().signal)).resolves.toMatchObject({ kind: "text/csv" });
  });

  it("keeps the backend's plain 413/415/503 messages", async () => {
    for (const [status, detail] of [[413, "request too large"], [415, "unsupported file type"], [503, "file storage unavailable"]] as const) {
      mockFetchJson({ detail }, status);
      const e = await uploadFile(file(), new AbortController().signal).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(UploadError);
      expect(e).toMatchObject({ code: "http", message: detail });
    }
  });

  it("reports network and malformed responses without throwing raw errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(uploadFile(file(), new AbortController().signal)).rejects.toMatchObject({ code: "network" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    await expect(uploadFile(file(), new AbortController().signal)).rejects.toMatchObject({ code: "malformed" });

    mockFetchJson({ id: "x" });
    await expect(uploadFile(file(), new AbortController().signal)).rejects.toMatchObject({ code: "malformed" });
  });
});

function mockFetchJson(body: unknown, status = 200) {
  const f = vi.fn(async (...args: [string, RequestInit]) => {
    void args;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", f);
  return f;
}
