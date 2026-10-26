import { API_BASE } from "./config";
import { stream, type AskEvent, type AnalyzeEvent, type ApiError, type AskMode, type HistoryTurn, type MemoryTurn, type Search } from "./sse";

// Client for the server-side run queue (/v1/runs). The client id only orders the queue fairly; it is not a login.
const ID_KEY = "scientist-client-v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function clientId(): string {
  try {
    const have = localStorage.getItem(ID_KEY);
    if (isUuid(have)) return have;
    const id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID()); // storage blocked: stable for this page load
  }
}
let memoryId: string | undefined;

export type RunCode = "client_busy" | "queue_full" | "rate_limited";
export type RunView = {
  id: string; session_id: string; turn_id: string; kind: "ask" | "analyze";
  status: "queued" | "running" | "done" | "error" | "stopped" | "interrupted";
  mine: boolean; position?: number; eta_seconds?: number;
};
export type RunBody = {
  session_id: string; turn_id: string; kind: "ask" | "analyze"; question: string;
  mode?: AskMode; history?: HistoryTurn[]; memory?: MemoryTurn[]; plan?: Search[]; file_id?: string; file_name?: string;
};
export type QueueStatus = Record<"research" | "analysis", { running: number; limit: number; queued: number }>;
export const ACTIVE: RunView["status"][] = ["queued", "running"];

async function call(method: string, path: string, init: { body?: unknown; signal?: AbortSignal; id?: boolean } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method, signal: init.signal,
      headers: { Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.id ? { "X-Client-Id": clientId() } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw { message: "", code: "network" } satisfies ApiError;
  }
  let json: unknown = null;
  try { json = await res.json(); } catch {}
  const b = (json && typeof json === "object" ? json : {}) as { detail?: unknown; code?: unknown };
  if (!res.ok) {
    const runCode = typeof b.code === "string" ? b.code : undefined;
    throw { message: typeof b.detail === "string" ? b.detail : "", code: "http", status: res.status, ...(runCode ? { runCode } : {}) } satisfies ApiError;
  }
  return json;
}

const obj = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  throw { message: "", code: "malformed" } satisfies ApiError;
};

export function toRunView(v: unknown): RunView {
  const r = obj(v);
  if (!isUuid(r.id)) throw { message: "", code: "malformed" } satisfies ApiError;
  return r as unknown as RunView;
}

/** 202: the run is queued (or running) and the server has written the turn row. */
export async function submitRun(body: RunBody, signal?: AbortSignal): Promise<{ run: RunView; turn: Record<string, unknown> }> {
  const r = obj(await call("POST", "/v1/runs", { body, signal, id: true }));
  return { run: toRunView(r.run), turn: obj(r.turn) };
}
export const getRun = async (runId: string): Promise<RunView> => toRunView(await call("GET", `/v1/runs/${runId}`, { id: true }));
export const cancelRun = async (runId: string): Promise<void> => { await call("POST", `/v1/runs/${runId}/cancel`, { body: {}, id: true }); };
export const queueStatus = async (): Promise<QueueStatus> => obj(await call("GET", "/v1/runs/status")) as unknown as QueueStatus;

/** Replay events after `after` (their ids), then live ones, until the run ends. Each event carries `_seq` when the server sent an id. */
export async function* attachRun(runId: string, after: number, signal: AbortSignal): AsyncGenerator<(AskEvent | AnalyzeEvent) & { _seq?: number }> {
  const init: RequestInit = { method: "GET", headers: { Accept: "text/event-stream" }, signal };
  for await (const e of stream(`${API_BASE}/v1/runs/${runId}/events?after=${after}`, init, signal)) yield e as AskEvent & { _seq?: number };
}

/** The 429 reasons of the queue, in the user's strings. */
export const RUN_CODES: readonly string[] = ["client_busy", "queue_full", "rate_limited"];
