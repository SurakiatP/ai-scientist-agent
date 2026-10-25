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
export type AskMode = "deep" | "quick";
export type HistoryTurn = { question: string; answer: string };
export type AskOptions = { mode?: AskMode; history?: HistoryTurn[]; plan?: Search[]; planOnly?: boolean };

export type AskEvent =
  | { type: "refused"; reason: string }
  | { type: "waiting"; position: number }
  | { type: "strategy"; reasoning: string; searches: Search[] }
  | { type: "sources"; term: string; papers: Paper[] }
  | { type: "answer"; term: string; content: string }
  | { type: "final_answer"; content: string; references: Reference[] }
  | { type: "complete" }
  | { type: "error"; message: string; code?: "malformed" | "network" | "http" }; // code set by streamAsk itself; backend errors have none

function parse(block: string): AskEvent | null {
  const data = block
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null; // comment (": ping") or blank block
  try {
    const ev = JSON.parse(data);
    if (ev && typeof ev.type === "string") return ev as AskEvent;
  } catch {}
  return { type: "error", message: "", code: "malformed" };
}

const clean = (m: string) => m.replace(/^Value error, /, "");

export async function* streamAsk(question: string, signal: AbortSignal, opts: AskOptions = {}): AsyncGenerator<AskEvent> {
  // Send only what differs from the backend defaults.
  const body: { question: string; mode?: AskMode; history?: HistoryTurn[]; plan?: Search[]; plan_only?: boolean } = { question };
  if (opts.mode === "quick") body.mode = "quick";
  if (opts.history?.length) body.history = opts.history;
  if (opts.plan?.length) body.plan = opts.plan;
  if (opts.planOnly) body.plan_only = true;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/async/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (!signal.aborted) yield { type: "error", message: "", code: "network" };
    return;
  }
  if (!res.ok || !res.body) {
    let message = "";
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = clean(body.detail);
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) message = clean(String(body.detail[0].msg));
    } catch {}
    yield { type: "error", message, code: "http" };
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
