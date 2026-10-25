import { useSyncExternalStore } from "react";
import { useChatStore, type Session, type Turn, type TurnAnalysis } from "./chat";
import { newId } from "./history";
import { usePrefs } from "./prefs";
import { emptyProgress, reduce, type Progress } from "./progress";
import { streamAnalyze, streamAsk, type AnalyzeEvent, type ApiError, type AskMode, type HistoryTurn, type Reference, type Search } from "./sse";
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

// Earlier turns are context, not new questions: only completed answers, oldest first, last three.
const historyFrom = (session: Session) =>
  session.turns
    .flatMap((t) => (t.status === "done" && t.answer ? [{ question: t.question, answer: t.answer.content }] : []))
    .slice(-3);

type Patch = Partial<Turn>;

// The real ask stream, shared by startRun (direct runs) and approvePlan (a reviewed plan).
async function runAsk(question: string, c: AbortController, opts: { mode: AskMode; history: HistoryTurn[]; plan?: Search[] }, patch: (p: Patch) => void): Promise<void> {
  let progress: Progress = emptyProgress;
  let final: { content: string; references: Reference[] } | null = null;
  let outcome: Patch | null = null;
  try {
    for await (const e of streamAsk(question, c.signal, opts)) {
      progress = reduce(progress, e);
      if (e.type === "final_answer") { final = { content: e.content, references: e.references }; outcome = { status: "done", answer: final }; }
      else if (e.type === "refused") outcome = { status: "refused", refused: e.reason };
      else if (e.type === "error") outcome = { status: "error", error: errorText(e) };
      patch(final && e.type === "final_answer" ? { progress, answer: final } : { progress });
    }
    patch({ progress, ...(outcome ?? (c.signal.aborted ? { status: "stopped" as const } : { status: "error" as const, error: cutOffText() })) });
  } catch {
    patch({ progress, status: c.signal.aborted ? "stopped" : "error", ...(c.signal.aborted ? {} : { error: cutOffText() }) });
  }
}

export async function startRun(sessionId: string, question: string, opts: { mode?: AskMode } = {}): Promise<void> {
  if (!canStart().ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  if (!session) throw new Error("no such session"); // before any state or stream
  const mode: AskMode = opts.mode === "quick" ? "quick" : "deep";
  // Deep Research can pause for plan review first; Quick mode never pauses.
  const review = mode === "deep" && usePrefs.getState().reviewPlan;
  const turnId = newId();
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, mode });
  setState({ sessionId, turnId });
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} }; // storage must never abort a run
  try {
    if (review) {
      let plan: Search[] | null = null;
      let outcome: Patch | null = null;
      try {
        for await (const e of streamAsk(question, c.signal, { mode, history: historyFrom(session), planOnly: true })) {
          if (e.type === "strategy") plan = e.searches;
          else if (e.type === "refused") outcome = { status: "refused", refused: e.reason }; // planning asks too: scope can be refused
          else if (e.type === "error") outcome = { status: "error", error: errorText(e) };
        }
      } catch {
        // fall through: the plan stream died the same way a real stream can
      }
      if (c.signal.aborted) patch({ status: "stopped" });
      else if (outcome) patch(outcome);
      else if (!plan || plan.length === 0) patch({ status: "error", error: cutOffText() });
      else {
        patch({ status: "awaiting_plan", plan, progress: emptyProgress }); // nothing has run yet: the empty strip would be a false start
        return; // the plan fetch is done; the single-run lock is NOT held while the user reviews
      }
    } else {
      await runAsk(question, c, { mode, history: historyFrom(session) }, patch);
    }
  } finally {
    ac = null;
    setState(idle);
  }
}

// The reviewed plan runs the real stream on the same turn: from the board straight into the search run.
export async function approvePlan(sessionId: string, turnId: string, plan: Search[]): Promise<void> {
  if (!plan.some((x) => x.term.trim() !== "")) throw new Error("empty plan"); // nothing to run: also keeps the turn reloadable
  if (!canStart().ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  const turn = session?.turns.find((t) => t.id === turnId);
  if (!session || !turn) throw new Error("no such turn"); // before any state or stream
  if (turn.status !== "awaiting_plan") throw new Error("not awaiting");
  const mode: AskMode = turn.mode === "quick" ? "quick" : "deep";
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  setState({ sessionId, turnId });
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} };
  store().patchTurn(sessionId, turnId, { status: "running", progress: emptyProgress, plan });
  try {
    await runAsk(turn.question, c, { mode, history: historyFrom(session), plan }, patch);
  } finally {
    ac = null;
    setState(idle);
  }
}

// Cancelling a review marks the turn stopped; it never touches another status (approve may already have taken over).
export function cancelPlan(sessionId: string, turnId: string): void {
  const turn = useChatStore.getState().sessions.find((x) => x.id === sessionId)?.turns.find((t) => t.id === turnId);
  if (turn?.status !== "awaiting_plan") return;
  try { useChatStore.getState().patchTurn(sessionId, turnId, { status: "stopped" }); } catch {}
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
