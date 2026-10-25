import { API_BASE } from "./config";

export type Paper = {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  pmid: string | null;
  url: string;
};
export type Reference = { id: string; paper: Paper; status: "verified" | "unverified" | "unknown" };
export type Search = { term: string; instructions: string };
export type AskMode = "deep" | "quick" | "chat"; // chat = answer from the session's own earlier results, no search
export type HistoryTurn = { question: string; answer: string };
export type MemoryRef = { id: string; title: string; authors: string[]; year: number | null; doi: string | null; pmid: string | null; url: string; status: Reference["status"] };
export type MemoryTurn = { question: string; answer: string; references: MemoryRef[] };
export type AskOptions = { mode?: AskMode; history?: HistoryTurn[]; plan?: Search[]; planOnly?: boolean; memory?: MemoryTurn[] };

export type StreamCode = "malformed" | "network" | "http";
export type ApiError = { message: string; code?: StreamCode; status?: number };
export type StreamError = ApiError & { type: "error" };

export type AskEvent =
  | { type: "refused"; reason: string; code?: string }
  | { type: "waiting"; position: number }
  | { type: "strategy"; reasoning: string; searches: Search[] }
  | { type: "sources"; term: string; papers: Paper[] }
  | { type: "answer"; term: string; content: string }
  | { type: "final_answer"; content: string; references: Reference[] }
  | { type: "complete" }
  | StreamError;

export type UploadedFile = { id: string; name: string; size: number; kind: string };

export type AnalysisStep = "profiling" | "writing_script" | "running" | "repairing" | "storing";
export type AnalysisArtifact = { id: string; name: string; kind: "figure" | "csv"; url: string };
export type AnalysisColumn = { name: string; dtype: string; null_pct: number };
export type AnalysisQuality = { rows: number; columns: number; truncated?: boolean; columns_info?: AnalysisColumn[] };
export type AnalysisTable = { name: string; columns: string[]; rows: unknown[][]; truncated?: boolean };
export type AnalysisResult = {
  quality: AnalysisQuality;
  tables: AnalysisTable[];
  findings: string[];
  timings: Record<string, number>;
  artifacts: AnalysisArtifact[];
};

export type AnalyzeEvent =
  | { type: "waiting"; position: number }
  | { type: "refused"; reason: string; code?: string }
  | { type: "analysis_step"; step: AnalysisStep }
  | { type: "analysis_script"; code: string }
  | ({ type: "analysis_result" } & AnalysisResult)
  | { type: "complete" }
  | StreamError;

type RawEvent = { type: string; [key: string]: unknown };

function parse(block: string): RawEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null; // comment (": ping") or blank block
  try {
    const ev: unknown = JSON.parse(data);
    if (ev && typeof ev === "object" && typeof (ev as { type?: unknown }).type === "string") return ev as RawEvent;
  } catch {}
  return { type: "error", message: "", code: "malformed" };
}

const clean = (m: string) => m.replace(/^Value error, /, "");

async function failureDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return clean(body.detail);
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return clean(String(body.detail[0].msg));
  } catch {}
  return "";
}

// One reader for both streams: identical malformed / network / HTTP handling and abort semantics.
async function* stream(url: string, init: RequestInit, signal: AbortSignal): AsyncGenerator<RawEvent> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    if (!signal.aborted) yield { type: "error", message: "", code: "network" };
    return;
  }
  if (!res.ok || !res.body) {
    yield { type: "error", message: await failureDetail(res), code: "http", status: res.status };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let pendingCR = ""; // a trailing "\r" may be the first half of "\r\n" split across chunks
  try {
    for (;;) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      let raw = pendingCR + decoder.decode(value, { stream: true });
      pendingCR = raw.endsWith("\r") ? "\r" : "";
      raw = raw.slice(0, raw.length - pendingCR.length);
      buf += raw.replace(/\r\n?/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = parse(buf.slice(0, i));
        buf = buf.slice(i + 2);
        if (signal.aborted) return;
        if (ev) yield ev;
      }
    }
    const ev = parse(buf + (pendingCR ? "\n" : ""));
    if (ev && !signal.aborted) yield ev;
  } catch {
    if (!signal.aborted) yield { type: "error", message: "", code: "network" };
  } finally {
    reader.cancel().catch(() => {});
  }
}

export async function* streamAsk(question: string, signal: AbortSignal, opts: AskOptions = {}): AsyncGenerator<AskEvent> {
  // Send only what differs from the backend defaults.
  const body: { question: string; mode?: AskMode; history?: HistoryTurn[]; plan?: Search[]; plan_only?: boolean; memory?: MemoryTurn[] } = { question };
  if (opts.mode === "quick" || opts.mode === "chat") body.mode = opts.mode;
  if (opts.mode === "chat" && opts.memory?.length) body.memory = opts.memory;
  if (opts.history?.length) body.history = opts.history;
  if (opts.plan?.length) body.plan = opts.plan;
  if (opts.planOnly) body.plan_only = true;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  };
  for await (const e of stream(`${API_BASE}/v1/async/ask`, init, signal)) yield e as AskEvent;
}

export async function* streamAnalyze(fileId: string, question: string, signal: AbortSignal): AsyncGenerator<AnalyzeEvent> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ file_id: fileId, question }),
    signal,
  };
  for await (const e of stream(`${API_BASE}/v1/async/analyze`, init, signal)) yield e as AnalyzeEvent;
}

export class UploadError extends Error {
  readonly code: StreamCode;
  constructor(code: StreamCode, message = "") {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }
}

export async function uploadFile(file: File, signal: AbortSignal): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/files`, { method: "POST", headers: { Accept: "application/json" }, body: form, signal });
  } catch {
    throw new UploadError("network");
  }
  if (!res.ok) throw new UploadError("http", await failureDetail(res));
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new UploadError("malformed");
  }
  const data = body as Record<string, unknown> | null;
  if (
    !data || typeof data.id !== "string" || data.id === "" ||
    typeof data.name !== "string" || data.name === "" ||
    typeof data.size !== "number" || !Number.isFinite(data.size) || data.size < 0
  ) {
    throw new UploadError("malformed");
  }
  const kind = typeof data.kind === "string" ? data.kind : typeof data.content_type === "string" ? data.content_type : "";
  return { id: data.id, name: data.name, size: data.size, kind };
}

export type PreviewStage = "queued" | "preparing" | "layout" | "rendering";
export type PreviewEvent = { type: "preview_status"; stage: PreviewStage } | { type: "preview_ready"; id: string; pages: number; bytes: number } | StreamError;

export async function* streamPreview(payload: unknown, signal: AbortSignal): AsyncGenerator<PreviewEvent> {
  const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(payload), signal };
  for await (const e of stream(`${API_BASE}/v1/async/reports/preview`, init, signal)) yield e as PreviewEvent;
}
