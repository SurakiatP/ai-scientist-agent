import { useSyncExternalStore } from "react";
import { refusalCode, useChatStore, type Session, type Turn, type TurnAnalysis } from "./chat";
import { newId } from "./history";
import { usePrefs } from "./prefs";
import { emptyProgress, reduce, type Progress } from "./progress";
import { ACTIVE, attachRun, cancelRun, getRun, submitRun, type RunBody, type RunView } from "./runs";
import { streamAnalyze, streamAsk, type AnalyzeEvent, type ApiError, type AskEvent, type AskMode, type HistoryTurn, type MemoryRef, type MemoryTurn, type Reference, type Search } from "./sse";
import { strings } from "./strings";
import { refreshNow, settleSession, toTurn, useSync } from "./sync";

type RunState = { sessionId: string | null; turnId: string | null };
const idle: RunState = { sessionId: null, turnId: null };
let state = idle; // module-level: survives navigation, never persisted
let ac: AbortController | null = null;
let activeRun: string | null = null; // the server run behind this tab's lock, once it has one: Stop cancels it instead of aborting a fetch
const attached = new Map<string, AbortController>(); // turn id -> the one event stream this tab follows for it
const foreign = new Set<string>(); // turns whose run another browser submitted: shown live, never stoppable here
const settledAt = new Map<string, number>(); // run id -> when we last saw it end (stops a stale snapshot from re-attaching in a loop)
const shared = () => useSync.getState().status !== "disabled"; // the runs API exists only with the shared database
let leaving = false; // page unloading: the aborted fetch must not overwrite the stored run, so a reload reads "interrupted"
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true; });
  window.addEventListener("pageshow", (e) => {
    leaving = false;
    if (!e.persisted || state.turnId) return; // bfcache restore with no live run: any turn still stored as running is dead
    for (const s of useChatStore.getState().sessions) for (const t of s.turns) if (t.status === "running" && !t.runId) useChatStore.getState().patchTurn(s.id, t.id, { status: "interrupted" }); // a server run outlives the page
  });
}
const subs = new Set<() => void>();
const setState = (s: RunState) => { state = s; subs.forEach((f) => f()); };

export const useRunState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => idle);
export const canStart = (): { ok: true } | { ok: false; reason: "busy" } => (state.turnId ? { ok: false, reason: "busy" } : { ok: true });
export const stopRun = () => { if (activeRun) void cancelRun(activeRun).catch(() => {}); else ac?.abort(); }; // the stream then ends with the server's "stopped"
export const isAttached = (turnId: string) => attached.has(turnId); // sync.ts: a turn this tab follows keeps its live copy
export const useForeign = (turnId: string) => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => foreign.has(turnId), () => false);
export const runningTurnId = () => state.turnId; // sync.ts: a turn running in THIS tab is never overwritten by a remote copy

// The one place error events become user-facing text (stored in the current language).
export function errorText(e: ApiError): string {
  const t = strings[usePrefs.getState().lang];
  const m = e.runCode === "client_busy" ? t.runClientBusy : e.runCode === "queue_full" ? t.runQueueFull
    : e.code === "network" ? t.network : e.code === "malformed" ? t.malformed
    : e.code === "http" ? `${t.requestFailed}${e.message ? `: ${e.message}` : ""}` : e.message;
  return m.slice(0, 2048); // chat.ts read limit for turn.error
}
/** Text for a start that failed with an API error (queue limits, network); null for anything else. */
export const startError = (e: unknown): string | null => (e && typeof e === "object" && "code" in e && "message" in e ? errorText(e as ApiError) : null);
const cutOffText = () => strings[usePrefs.getState().lang].cutOff;

// Earlier turns are context, not new questions: only completed answers, oldest first, last three.
const historyFrom = (session: Session) =>
  session.turns
    .flatMap((t) => (t.status === "done" && t.answer ? [{ question: t.question, answer: t.answer.content }] : []))
    .slice(-3);

// "Answer research" memory: this session's own finished answers, oldest first. Same caps as the backend defaults
// (it clamps again); newest turns win. Nothing leaves the browser except in the request that asks the question.
export const MEMORY_TURNS = 8, MEMORY_ANSWER = 6000, MEMORY_REFS = 40;
const memRef = (r: Reference): MemoryRef => ({ id: r.id, title: r.paper.title, authors: r.paper.authors, year: r.paper.year, doi: r.paper.doi, pmid: r.paper.pmid, url: r.paper.url, status: r.status });
export function memoryFrom(session: Session): MemoryTurn[] {
  let budget = MEMORY_REFS;
  return session.turns
    .filter((t) => t.status === "done" && !!t.answer?.content.trim())
    .slice(-MEMORY_TURNS)
    .reverse() // newest first so they get the reference budget
    .map((t) => {
      const references = t.answer!.references.slice(0, budget).map(memRef);
      budget -= references.length;
      return { question: t.question, answer: t.answer!.content.slice(0, MEMORY_ANSWER), references };
    })
    .reverse();
}

type Patch = Partial<Turn>;

// How one event ends a run. The queue's cancel and restart come as error events with a code: they are not failures.
const errorOutcome = (e: ApiError): Patch =>
  e.code === "stopped" ? { status: "stopped" } : e.code === "interrupted" ? { status: "interrupted" } : { status: "error", error: errorText(e) };
const askOutcome = (e: AskEvent): Patch | null =>
  e.type === "final_answer" ? { status: "done", answer: { content: e.content, references: e.references } }
  : e.type === "refused" ? { status: "refused", refused: e.reason, refusedCode: refusalCode(e.code) }
  : e.type === "error" ? errorOutcome(e) : null;

// The real ask stream, shared by startRun (direct runs) and approvePlan (a reviewed plan).
async function runAsk(question: string, c: AbortController, opts: { mode: AskMode; history: HistoryTurn[]; plan?: Search[]; memory?: MemoryTurn[] }, patch: (p: Patch) => void): Promise<void> {
  let progress: Progress = emptyProgress;
  let answer: Patch["answer"];
  let outcome: Patch | null = null;
  try {
    for await (const e of streamAsk(question, c.signal, opts)) {
      progress = reduce(progress, e);
      outcome = askOutcome(e) ?? outcome;
      if (e.type === "final_answer") answer = outcome?.answer;
      patch(answer && e.type === "final_answer" ? { progress, answer } : { progress });
    }
    patch({ progress, ...(outcome ?? (c.signal.aborted ? { status: "stopped" as const } : { status: "error" as const, error: cutOffText() })) });
  } catch {
    patch({ progress, status: c.signal.aborted ? "stopped" : "error", ...(c.signal.aborted ? {} : { error: cutOffText() }) });
  }
}

// --- server-owned runs (shared mode) ----------------------------------------------------------------------------------
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((r) => { const id = setTimeout(r, ms); signal.addEventListener("abort", () => { clearTimeout(id); r(); }, { once: true }); });
const notify = () => subs.forEach((f) => f());
const analysisOutcome = (e: AnalyzeEvent, prev: Patch | null): Patch | null =>
  e.type === "analysis_result" || e.type === "complete" ? prev ?? { status: "done" }
  : e.type === "refused" ? { status: "refused", refused: e.reason, refusedCode: refusalCode(e.code) }
  : e.type === "error" ? errorOutcome(e) : prev;

// Follow one run's events into its local turn until the server ends it. A dropped stream resumes after the last event
// seen; a run we cannot follow any more is read back from the shared store. Never cancels anything.
async function follow(sessionId: string, base: Turn, runId: string, c: AbortController): Promise<void> {
  const turnId = base.id;
  const patch = (p: Patch) => { if (leaving) return; try { useChatStore.getState().patchTurn(sessionId, turnId, p); } catch {} };
  const isAnalysis = base.kind === "analysis";
  let progress: Progress = emptyProgress, seq = 0;
  let analysis = base.analysis && analysisFrom(base.analysis.fileId, base.analysis.fileName);
  let outcome: Patch | null = null;
  try {
    for (let tries = 0; !outcome && !c.signal.aborted && tries < 6; tries++) {
      if (tries) await sleep(Math.min(tries, 5) * 1000, c.signal);
      for await (const e of attachRun(runId, seq, c.signal)) {
        if (e.type === "error" && (e.code === "network" || e.code === "malformed" || e.code === "http")) { if (e.status === 404) tries = 99; break; } // lost the stream, not the run
        if (e._seq !== undefined) seq = e._seq;
        if (isAnalysis) {
          if (analysis) analysis = reduceAnalysis(analysis, e as AnalyzeEvent);
          progress = e.type === "waiting" ? reduce(progress, e) : progress.phase === "waiting" ? emptyProgress : progress;
          outcome = analysisOutcome(e as AnalyzeEvent, outcome);
          patch({ progress, ...(analysis ? { analysis } : {}) });
        } else {
          progress = reduce(progress, e as AskEvent);
          const o = askOutcome(e as AskEvent);
          outcome = o ?? outcome;
          patch(o?.answer ? { progress, answer: o.answer } : { progress });
        }
      }
    }
    if (outcome) patch({ ...(isAnalysis ? { progress, ...(analysis ? { analysis } : {}) } : { progress }), ...outcome });
  } finally {
    attached.delete(turnId); foreign.delete(turnId); settledAt.set(runId, Date.now()); notify();
  }
  if (!outcome && !c.signal.aborted) await refreshNow(); // could not follow it to the end: the shared store knows the real state
}

/** Every running turn with a server run gets one event stream in this tab, whoever submitted it. Called after each snapshot. */
export function attachRunning(): void {
  if (!shared()) return;
  for (const s of useChatStore.getState().sessions) for (const t of s.turns) {
    if (t.status !== "running" || !t.runId || attached.has(t.id) || Date.now() - (settledAt.get(t.runId) ?? 0) < 10_000) continue;
    void reattach(s.id, t).catch(() => {});
  }
}
async function reattach(sessionId: string, t: Turn): Promise<void> {
  const runId = t.runId!;
  const c = new AbortController();
  attached.set(t.id, c); // claimed before any await: one stream per run
  let run: RunView;
  try { run = await getRun(runId); } catch (e) {
    attached.delete(t.id);
    if ((e as ApiError).status === 404) { settledAt.set(runId, Date.now()); try { useChatStore.getState().patchTurn(sessionId, t.id, { status: "interrupted" }); } catch {} } // no such run any more: nothing will finish this turn
    return; // unreachable: the next snapshot tries again
  }
  if (!ACTIVE.includes(run.status)) { attached.delete(t.id); settledAt.set(runId, Date.now()); await refreshNow(); return; } // ended meanwhile: the stored turn is the result
  const lock = run.mine && !state.turnId; // our own run found again after a reload: Stop works as before
  if (!run.mine) foreign.add(t.id);
  if (lock) { activeRun = runId; setState({ sessionId, turnId: t.id }); } else notify();
  try { await follow(sessionId, t, runId, c); } finally { if (lock) { activeRun = null; setState(idle); } }
}

// Submit to the queue and follow the run. The server writes the turn; `existing` = the turn is already here (an approved plan).
async function sharedRun(sessionId: string, body: RunBody, existing: boolean, c: AbortController): Promise<void> {
  await settleSession(sessionId); // the session (and a reviewed turn) must be on the server before a run can point at it
  const f = new AbortController();
  attached.set(body.turn_id, f); // claimed first, so a snapshot arriving mid-submit cannot replace or double-attach the turn
  let t: Turn | null, runId = "";
  try {
    const sub = await submitRun(body, c.signal);
    t = toTurn(sub.turn);
    if (!t) throw { message: "", code: "malformed" } satisfies ApiError;
    if (body.kind === "analyze" && !t.analysis) t = { ...t, kind: "analysis", analysis: analysisFrom(body.file_id ?? "", body.file_name) };
    activeRun = runId = sub.run.id;
    if (existing) useChatStore.getState().patchTurn(sessionId, t.id, t);
    else useChatStore.getState().addTurn(sessionId, t);
  } catch (e) {
    attached.delete(body.turn_id);
    throw e;
  }
  await follow(sessionId, t, runId, f);
}

export async function startRun(sessionId: string, question: string, opts: { mode?: AskMode } = {}): Promise<void> {
  if (!canStart().ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  if (!session) throw new Error("no such session"); // before any state or stream
  const mode: AskMode = opts.mode === "quick" || opts.mode === "chat" ? opts.mode : "deep";
  // Deep Research can pause for plan review first; Quick and Answer-research never pause.
  const review = mode === "deep" && usePrefs.getState().reviewPlan;
  const turnId = newId();
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  if (!review && shared()) { // the server queues, runs and records it; this tab only shows it
    setState({ sessionId, turnId });
    try {
      if (!session.title) store().renameSession(sessionId, question); // the session reaches the server with a title, like the first turn would have
      await sharedRun(sessionId, { session_id: sessionId, turn_id: turnId, kind: "ask", question, mode, ...(mode === "chat" ? { memory: memoryFrom(session) } : { history: historyFrom(session) }) }, false, c);
    } catch (e) {
      if (!c.signal.aborted) throw e; // Stop before the server answered: nothing to show
    } finally {
      ac = null; activeRun = null;
      setState(idle);
    }
    return;
  }
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
          else if (e.type === "refused") outcome = { status: "refused", refused: e.reason, refusedCode: refusalCode(e.code) }; // planning asks too: scope can be refused
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
      await runAsk(question, c, mode === "chat" ? { mode, history: [], memory: memoryFrom(session) } : { mode, history: historyFrom(session) }, patch);
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
  const mode: AskMode = turn.mode === "quick" ? "quick" : "deep"; // a plan is only ever reviewed in deep mode
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  setState({ sessionId, turnId });
  if (shared()) {
    try {
      await sharedRun(sessionId, { session_id: sessionId, turn_id: turnId, kind: "ask", question: turn.question, mode, history: historyFrom(session), plan }, true, c);
    } catch (e) {
      if (!c.signal.aborted) throw e; // the turn stays awaiting its plan; the card says the start failed
    } finally {
      ac = null; activeRun = null;
      setState(idle);
    }
    return;
  }
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} };
  try {
    store().patchTurn(sessionId, turnId, { status: "running", progress: emptyProgress, plan });
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
  if (shared()) {
    setState({ sessionId, turnId });
    try {
      if (!session.title) store().renameSession(sessionId, question);
      await sharedRun(sessionId, { session_id: sessionId, turn_id: turnId, kind: "analyze", question, file_id: fileId, ...(fileName ? { file_name: fileName } : {}) }, false, c);
    } catch (e) {
      if (!c.signal.aborted) throw e;
    } finally {
      ac = null; activeRun = null;
      setState(idle);
    }
    return;
  }
  let analysis = analysisFrom(fileId, fileName);
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, kind: "analysis", analysis });
  setState({ sessionId, turnId });
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} };
  let outcome: Parameters<typeof patch>[0] | null = null;
  try {
    for await (const e of streamAnalyze(fileId, question, c.signal)) {
      analysis = reduceAnalysis(analysis, e);
      if (e.type === "analysis_result" || e.type === "complete") outcome = outcome ?? { status: "done" };
      else if (e.type === "refused") outcome = { status: "refused", refused: e.reason, refusedCode: refusalCode(e.code) };
      else if (e.type === "error") outcome = { status: "error", error: errorText(e) };
      patch({ analysis }); // status settles only after the stream closes, while the run lock is still held
    }
    patch({ analysis, ...(outcome ?? (c.signal.aborted ? { status: "stopped" as const } : { status: "error" as const, error: cutOffText() })) });
  } catch {
    patch({ analysis, status: c.signal.aborted ? "stopped" : "error", ...(c.signal.aborted ? {} : { error: cutOffText() }) });
  } finally {
    ac = null;
    setState(idle);
  }
}
