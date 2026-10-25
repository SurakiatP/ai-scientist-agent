import { useSyncExternalStore } from "react";
import { useChatStore, type TurnAnalysis } from "./chat";
import { newId } from "./history";
import { usePrefs } from "./prefs";
import { emptyProgress, reduce, type Progress } from "./progress";
import { streamAnalyze, streamAsk, type AnalyzeEvent, type ApiError, type AskMode, type HistoryTurn, type Reference } from "./sse";
import { strings } from "./strings";

type RunState = { sessionId: string | null; turnId: string | null };
const idle: RunState = { sessionId: null, turnId: null };
let state = idle; // module-level: survives navigation, never persisted
let ac: AbortController | null = null;
let leaving = false; // page unloading: the aborted fetch must not overwrite the stored run, so a reload reads "interrupted"
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true; });
  window.addEventListener("pageshow", (e) => {
    leaving = false;
    if (!e.persisted || state.turnId) return; // bfcache restore with no live run: any turn still stored as running is dead
    for (const s of useChatStore.getState().sessions) for (const t of s.turns) if (t.status === "running") useChatStore.getState().patchTurn(s.id, t.id, { status: "interrupted" });
  });
}
const subs = new Set<() => void>();
const setState = (s: RunState) => { state = s; subs.forEach((f) => f()); };

export const useRunState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => idle);
export const canStart = (): { ok: true } | { ok: false; reason: "busy" } => (state.turnId ? { ok: false, reason: "busy" } : { ok: true });
export const stopRun = () => ac?.abort();

// The one place error events become user-facing text (stored in the current language).
export function errorText(e: ApiError): string {
  const t = strings[usePrefs.getState().lang];
  const m = e.code === "network" ? t.network : e.code === "malformed" ? t.malformed
    : e.code === "http" ? `${t.requestFailed}${e.message ? `: ${e.message}` : ""}` : e.message;
  return m.slice(0, 2048); // chat.ts read limit for turn.error
}
const cutOffText = () => strings[usePrefs.getState().lang].cutOff;

export async function startRun(sessionId: string, question: string, opts: { mode?: AskMode } = {}): Promise<void> {
  if (!canStart().ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  if (!session) throw new Error("no such session"); // before any state or stream
  const mode: AskMode = opts.mode === "quick" ? "quick" : "deep";
  // Earlier turns are context, not new questions: only completed answers, oldest first, last three.
  const history: HistoryTurn[] = session.turns
    .flatMap((t) => (t.status === "done" && t.answer ? [{ question: t.question, answer: t.answer.content }] : []))
    .slice(-3);
  const turnId = newId();
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, mode });
  setState({ sessionId, turnId });
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} }; // storage must never abort a run
  let progress: Progress = emptyProgress;
  let final: { content: string; references: Reference[] } | null = null;
  let outcome: Parameters<typeof patch>[0] | null = null;
  try {
    for await (const e of streamAsk(question, c.signal, { mode, history })) {
      progress = reduce(progress, e);
      if (e.type === "final_answer") { final = { content: e.content, references: e.references }; outcome = { status: "done", answer: final }; }
      else if (e.type === "refused") outcome = { status: "refused", refused: e.reason };
      else if (e.type === "error") outcome = { status: "error", error: errorText(e) };
      patch(final && e.type === "final_answer" ? { progress, answer: final } : { progress });
    }
    patch({ progress, ...(outcome ?? (c.signal.aborted ? { status: "stopped" as const } : { status: "error" as const, error: cutOffText() })) });
  } catch {
    patch({ progress, status: c.signal.aborted ? "stopped" : "error", ...(c.signal.aborted ? {} : { error: cutOffText() }) });
  } finally {
    ac = null;
    setState(idle);
  }
}

const analysisFrom = (fileId: string, fileName?: string): TurnAnalysis => ({ fileId, ...(fileName ? { fileName } : {}), steps: [] });

function reduceAnalysis(a: TurnAnalysis, e: AnalyzeEvent): TurnAnalysis {
  switch (e.type) {
    case "analysis_step": return a.steps.includes(e.step) ? a : { ...a, steps: [...a.steps, e.step] };
    case "analysis_script": return { ...a, script: e.code };
    case "analysis_result": return {
      ...a, quality: e.quality, tables: e.tables, findings: e.findings, timings: e.timings, artifacts: e.artifacts,
    };
    default: return a;
  }
}

// Same single-run controller as startRun: one active turn, Stop aborts it, a reload reads the stored turn as interrupted.
export async function startAnalysis(sessionId: string, question: string, fileId: string, fileName?: string): Promise<void> {
  if (!canStart().ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  if (!session) throw new Error("no such session"); // before any state or stream
  if (!fileId) throw new Error("no file"); // before any state or stream
  const turnId = newId();
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  let analysis = analysisFrom(fileId, fileName);
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, kind: "analysis", analysis });
  setState({ sessionId, turnId });
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} };
  let outcome: Parameters<typeof patch>[0] | null = null;
  try {
    for await (const e of streamAnalyze(fileId, question, c.signal)) {
      analysis = reduceAnalysis(analysis, e);
      if (e.type === "analysis_result" || e.type === "complete") outcome = outcome ?? { status: "done" };
      else if (e.type === "refused") outcome = { status: "refused", refused: e.reason };
      else if (e.type === "error") outcome = { status: "error", error: errorText(e) };
      patch({ analysis, ...(outcome ?? {}) });
    }
    patch({ analysis, ...(outcome ?? (c.signal.aborted ? { status: "stopped" as const } : { status: "error" as const, error: cutOffText() })) });
  } catch {
    patch({ analysis, status: c.signal.aborted ? "stopped" : "error", ...(c.signal.aborted ? {} : { error: cutOffText() }) });
  } finally {
    ac = null;
    setState(idle);
  }
}
