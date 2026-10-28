import { useMemo, useSyncExternalStore } from "react";
import { refusalCode, useChatStore, type Session, type Turn, type TurnAnalysis } from "./chat";
import { newId } from "./history";
import { usePrefs } from "./prefs";
import { emptyProgress, reduce, type Progress } from "./progress";
import { ACTIVE, attachRun, cancelRun, getRun, refreshLoad, submitRun, type RunBody, type RunView } from "./runs";
import { streamAnalyze, streamAsk, type AnalyzeEvent, type ApiError, type AskEvent, type AskMode, type HistoryTurn, type MemoryRef, type MemoryTurn, type Reference, type Search } from "./sse";
import { strings } from "./strings";
import { recordServerTurn, refreshNow, reprobeSync, settleSession, toTurn, useSync } from "./sync";

type RunState = { sessionId: string | null; turnId: string | null };
// One live run per session in this tab (module-level: survives navigation, never persisted). Different sessions run side by side.
type Lock = { turnId: string; ac: AbortController; activeRun: string | null }; // activeRun: the server run behind it, once it has one: Stop cancels it instead of aborting a fetch
const locks = new Map<string, Lock>();
const attached = new Map<string, AbortController>(); // turn id -> the one event stream this tab follows for it
const owners = new Map<string, boolean>(); // turn id -> true when this browser submitted its run (Stop allowed), false = someone else's
const sending = new Set<string>(); // turns shown before the server has accepted them
const runOf = new Map<string, string>(); // turn id -> run id, for Stop on a turn this tab does not hold the lock for
const settledAt = new Map<string, number>(); // run id -> when we last saw it end (stops a stale snapshot from re-attaching in a loop)
const SETTLED_MAX = 200;
const markSettled = (runId: string) => { settledAt.set(runId, Date.now()); if (settledAt.size > SETTLED_MAX) settledAt.delete(settledAt.keys().next().value!); };
const SUBMITTED = "scientist-runs-v1"; // run ids this tab submitted (sessionStorage): they stay attached after a session switch
const submitted = (): string[] => { try { const v = JSON.parse(sessionStorage.getItem(SUBMITTED) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const addSubmitted = (id: string) => { try { sessionStorage.setItem(SUBMITTED, JSON.stringify([...submitted(), id].slice(-20))); } catch {} };
const shared = () => useSync.getState().status !== "disabled"; // the runs API exists only with the shared database
let leaving = false; // page unloading: the aborted fetch must not overwrite the stored run, so a reload reads "interrupted"
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true; });
  window.addEventListener("pageshow", (e) => {
    leaving = false;
    if (!e.persisted) return; // bfcache restore with no live run: any turn still stored as running is dead
    for (const s of useChatStore.getState().sessions) for (const t of s.turns) if (t.status === "running" && !t.runId && !isRunningHere(t.id)) useChatStore.getState().patchTurn(s.id, t.id, { status: "interrupted" }); // a server run outlives the page
  });
}
const subs = new Set<() => void>();
const notifySubs = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
const take = (sessionId: string, turnId: string, c: AbortController) => { locks.set(sessionId, { turnId, ac: c, activeRun: null }); notifySubs(); };
const release = (sessionId: string) => { locks.delete(sessionId); notifySubs(); };

/** This session's live run in this tab (turnId null when none). */
export function useRunState(sessionId: string | null): RunState {
  const turnId = useSyncExternalStore(subscribe, () => (sessionId ? locks.get(sessionId)?.turnId ?? null : null), () => null);
  return useMemo(() => ({ sessionId, turnId }), [sessionId, turnId]);
}
/** True while this tab holds the live run of this turn. */
export const useTurnLocked = (turnId: string) => useSyncExternalStore(subscribe, () => [...locks.values()].some((l) => l.turnId === turnId), () => false);
export const canStart = (sessionId: string): { ok: true } | { ok: false; reason: "busy" } => (locks.has(sessionId) ? { ok: false, reason: "busy" } : { ok: true });
// With a server run, Stop cancels it and the stream then ends with the server's "stopped". False = the cancel failed (say so).
export async function stopRun(sessionId: string): Promise<boolean> {
  const l = locks.get(sessionId);
  if (!l) return true;
  if (!l.activeRun) { l.ac.abort(); return true; }
  try { await cancelRun(l.activeRun); refreshLoad(); return true; } catch { return false; }
}
export const stopAllRuns = () => { for (const id of [...locks.keys()]) void stopRun(id); };
export async function stopTurn(turnId: string): Promise<boolean> {
  const id = runOf.get(turnId);
  if (!id) return false;
  try { await cancelRun(id); refreshLoad(); return true; } catch { return false; }
}
export const isAttached = (turnId: string) => attached.has(turnId); // sync.ts: a turn this tab follows keeps its live copy
const useOwner = (turnId: string, v: boolean) => useSyncExternalStore(subscribe, () => owners.get(turnId) === v, () => false);
export const useForeign = (turnId: string) => useOwner(turnId, false); // someone else started it: watched here
export const useStoppable = (turnId: string) => useOwner(turnId, true); // this browser started it: Stop works from any tab
export const useSending = (turnId: string) => useSyncExternalStore(subscribe, () => sending.has(turnId), () => false);
export const runningTurnIds = (): string[] => [...locks.values()].map((l) => l.turnId); // sync.ts: a turn running in THIS tab is never overwritten by a remote copy
export const isRunningHere = (turnId: string) => runningTurnIds().includes(turnId);

// The one place error events become user-facing text (stored in the current language).
export function errorText(e: ApiError): string {
  const t = strings[usePrefs.getState().lang];
  const m = e.runCode === "use_runs" ? t.useRuns : e.runCode === "client_busy" ? t.runClientBusy : e.runCode === "queue_full" ? t.runQueueFull
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
  e.code === "stopped" ? { status: "stopped" } : e.code === "interrupted" ? { status: "interrupted" }
  : e.code === "cut_off" || e.code === "failed" ? { status: "error", error: e.message.slice(0, 2048) || cutOffText(), errCode: e.code }
  : (e.runCode === "use_runs" && void reprobeSync().catch(() => {}), { status: "error", error: errorText(e) }); // the server has the shared database after all: look again so a retry takes the queue
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
const notify = notifySubs;
const analysisOutcome = (e: AnalyzeEvent, prev: Patch | null): Patch | null =>
  e.type === "analysis_result" || e.type === "complete" ? prev ?? { status: "done" }
  : e.type === "refused" ? { status: "refused", refused: e.reason, refusedCode: refusalCode(e.code) }
  : e.type === "error" ? errorOutcome(e) : prev;

const lostStream = (e: { type: string; code?: string }) => e.type === "error" && (e.code === "network" || e.code === "malformed" || e.code === "http");
const waitingFrom = (r: RunView): Progress | null => r.status === "queued" && typeof r.position === "number" ? { ...emptyProgress, waiting: r.position, eta: r.eta_seconds ?? null, phase: "waiting" } : null;

// Follow one run's events into its local turn until the server ends it. A dropped stream resumes after the last event
// seen (backing off only after a network/http failure); a stream that closes with no ending asks the server once; a run we
// cannot follow any more is read back from the shared store. Never cancels anything.
async function follow(sessionId: string, base: Turn, runId: string, c: AbortController, seed?: Progress | null): Promise<void> {
  const turnId = base.id;
  const patch = (p: Patch) => { if (leaving) return; try { useChatStore.getState().patchTurn(sessionId, turnId, p); } catch {} };
  const isAnalysis = base.kind === "analysis";
  let progress: Progress = seed ?? emptyProgress, seq = 0, fails = 0;
  let analysis = base.analysis && analysisFrom(base.analysis.fileId, base.analysis.fileName);
  let outcome: Patch | null = null;
  try {
    while (!outcome && !c.signal.aborted && fails <= 5) {
      let got = false, lost = false;
      for await (const e of attachRun(runId, seq, c.signal)) {
        if (lostStream(e)) { lost = true; if ((e as ApiError).status === 404) fails = 99; break; } // lost the stream, not the run
        got = true; fails = 0;
        if (e._seq !== undefined) seq = e._seq;
        if (isAnalysis) {
          if (analysis) analysis = reduceAnalysis(analysis, e as AnalyzeEvent);
          progress = e.type === "waiting" ? reduce(progress, e as AskEvent) : progress.phase === "waiting" ? emptyProgress : progress;
          outcome = analysisOutcome(e as AnalyzeEvent, outcome);
          patch({ progress, ...(analysis ? { analysis } : {}) });
        } else {
          progress = reduce(progress, e as AskEvent);
          const o = askOutcome(e as AskEvent);
          outcome = o ?? outcome;
          patch(o?.answer ? { progress, answer: o.answer } : { progress });
        }
      }
      if (outcome || c.signal.aborted) break;
      if (lost) { if (++fails <= 5) await sleep(Math.min(fails, 5) * 1000, c.signal); continue; }
      // a clean close with no ending event: ask the server how the run stands
      let r: RunView | null = null;
      try { r = await getRun(runId); } catch { if (++fails <= 5) await sleep(Math.min(fails, 5) * 1000, c.signal); continue; }
      if (!ACTIVE.includes(r.status)) break; // it ended: the stored turn (refreshed below) is the result
      if (!got) await sleep(1000, c.signal); // still going but silent: do not spin
    }
    if (outcome) patch({ ...(isAnalysis ? { progress, ...(analysis ? { analysis } : {}) } : { progress }), ...outcome });
  } finally {
    attached.delete(turnId); owners.delete(turnId); runOf.delete(turnId); sending.delete(turnId);
    if (!c.signal.aborted) markSettled(runId); // a viewer stream dropped on session switch is not an ended run: switching back re-attaches at once
    notify(); refreshLoad();
  }
  if (!outcome && !c.signal.aborted) await refreshNow(); // the shared store knows the real state
}

/** Running turns with a server run get one event stream in this tab: those of the open session, and runs this tab submitted. */
export function attachRunning(): void {
  if (!shared()) return;
  const active = useChatStore.getState().activeId, mine = submitted();
  for (const s of useChatStore.getState().sessions) for (const t of s.turns) {
    if (t.status !== "running" || !t.runId || attached.has(t.id) || Date.now() - (settledAt.get(t.runId) ?? 0) < 10_000) continue;
    if (s.id !== active && !mine.includes(t.runId)) continue;
    void reattach(s.id, t).catch(() => {});
  }
}
/** Streams of runs that are neither in the open session nor ours are dropped when the session changes. */
function dropViewers(): void {
  const active = useChatStore.getState().activeId, mine = submitted();
  for (const s of useChatStore.getState().sessions) for (const t of s.turns) {
    const c = attached.get(t.id);
    if (c && s.id !== active && !(t.runId && mine.includes(t.runId)) && owners.get(t.id) !== true && !sending.has(t.id)) c.abort();
  }
}
if (typeof window !== "undefined") {
  let lastActive = useChatStore.getState().activeId;
  useChatStore.subscribe((st) => { if (st.activeId !== lastActive) { lastActive = st.activeId; dropViewers(); attachRunning(); } });
}
async function reattach(sessionId: string, t: Turn): Promise<void> {
  const runId = t.runId!;
  const c = new AbortController();
  attached.set(t.id, c); // claimed before any await: one stream per run
  let run: RunView;
  try { run = await getRun(runId); } catch (e) {
    attached.delete(t.id);
    if ((e as ApiError).status === 404) { markSettled(runId); try { useChatStore.getState().patchTurn(sessionId, t.id, { status: "interrupted" }); } catch {} } // no such run any more: nothing will finish this turn
    return; // unreachable: the next snapshot tries again
  }
  if (c.signal.aborted) { attached.delete(t.id); return; }
  if (!ACTIVE.includes(run.status)) { attached.delete(t.id); markSettled(runId); await refreshNow(); return; } // ended meanwhile: the stored turn is the result
  owners.set(t.id, run.mine); runOf.set(t.id, runId);
  const seed = waitingFrom(run);
  if (seed) try { useChatStore.getState().patchTurn(sessionId, t.id, { progress: seed }); } catch {}
  notify();
  await follow(sessionId, t, runId, c, seed ?? emptyProgress); // the replay starts at event 0: reducing it onto the stored progress would count twice
}

// Submit to the queue and follow the run. The question shows at once as a turn marked "sending"; the server writes the
// real row. `existing` = the turn is already here (an approved plan). A failure puts everything back and throws.
async function sharedRun(sessionId: string, body: RunBody, local: Turn, existing: boolean, c: AbortController): Promise<void> {
  const turnId = body.turn_id, store = () => useChatStore.getState();
  const f = new AbortController();
  attached.set(turnId, f); // claimed first, so a snapshot arriving mid-submit cannot replace or double-attach the turn
  sending.add(turnId);
  const back = existing ? { status: local.status, plan: local.plan, progress: local.progress, runId: undefined } : null;
  if (existing) store().patchTurn(sessionId, turnId, { status: "running", progress: emptyProgress, runId: newId() });
  else store().addTurn(sessionId, { ...local, runId: newId() }); // placeholder run id: the server owns this turn, sync never writes it
  notify();
  let posted = false; // the POST went out: from then on only a definite refusal (an http status) proves the server has no run
  const undo = (e: unknown) => {
    attached.delete(turnId); sending.delete(turnId); notify();
    const refused = typeof (e as ApiError)?.status === "number" || !posted;
    if (!refused) { // stopped or cut off mid-request: the run may exist. Keep the turn (same id as the server's) and let the store decide.
      try { store().patchTurn(sessionId, turnId, { status: "interrupted" }); } catch {}
      void refreshNow();
      return;
    }
    try { if (back) store().patchTurn(sessionId, turnId, back); else store().truncateFrom(sessionId, turnId); } catch {}
  };
  let t: Turn, run: RunView;
  try {
    // bounded; still not ready (sync offline or blocked) = do not post: a run submitted before a pending truncate would be deleted by it
    if (!(await settleSession(sessionId, c.signal)) && !c.signal.aborted) throw { message: strings[usePrefs.getState().lang].submitTimeout, code: "http", status: 409 } satisfies ApiError;
    let sub;
    posted = true;
    try { sub = await submitRun(body, c.signal); } catch (e) {
      if ((e as ApiError)?.status === 404 && !c.signal.aborted && !(await settleSession(sessionId, c.signal))) throw { message: strings[usePrefs.getState().lang].submitTimeout, code: "http", status: 404 } satisfies ApiError;
      throw e;
    }
    run = sub.run;
    const row = toTurn(sub.turn);
    if (!row) throw { message: "", code: "malformed" } satisfies ApiError;
    recordServerTurn(sessionId, sub.turn);
    t = body.kind === "analyze" && !row.analysis ? { ...row, kind: "analysis", analysis: analysisFrom(body.file_id ?? "", body.file_name) } : row;
    const seed = waitingFrom(run);
    t = seed ? { ...t, progress: seed } : t;
    const lk = locks.get(sessionId); if (lk?.turnId === turnId) lk.activeRun = run.id;
    runOf.set(turnId, run.id); owners.set(turnId, true); addSubmitted(run.id);
    if (store().sessions.find((x) => x.id === sessionId)?.turns.some((x) => x.id === turnId)) store().patchTurn(sessionId, turnId, { ...t, createdAt: local.createdAt }); // M1: it is already shown: update, never add twice
    else store().addTurn(sessionId, t);
  } catch (e) {
    undo(e);
    const uncertain = posted && typeof (e as ApiError)?.status !== "number";
    throw uncertain && e && typeof e === "object" ? { ...(e as ApiError), uncertain: true } : e;
  }
  sending.delete(turnId); notify(); refreshLoad();
  await follow(sessionId, t, run.id, f, t.progress);
}

export async function startRun(sessionId: string, question: string, opts: { mode?: AskMode } = {}): Promise<void> {
  if (!canStart(sessionId).ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  if (!session) throw new Error("no such session"); // before any state or stream
  const mode: AskMode = opts.mode === "quick" || opts.mode === "chat" ? opts.mode : "deep";
  // Deep Research can pause for plan review first; Quick and Answer-research never pause.
  const review = mode === "deep" && usePrefs.getState().reviewPlan;
  const turnId = newId();
  const c = new AbortController();
  const store = () => useChatStore.getState();
  if (!review && shared()) { // the server queues, runs and records it; this tab only shows it
    take(sessionId, turnId, c);
    try {
      if (!session.title) store().renameSession(sessionId, question); // the session reaches the server with a title, like the first turn would have
      await sharedRun(sessionId, { session_id: sessionId, turn_id: turnId, kind: "ask", question, mode, ...(mode === "chat" ? { memory: memoryFrom(session) } : { history: historyFrom(session) }) },
        { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, mode }, false, c);
    } catch (e) {
      if (!c.signal.aborted) throw e; // Stop before the server answered: the question is gone again
    } finally {
      release(sessionId);
    }
    return;
  }
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, mode });
  take(sessionId, turnId, c);
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
    release(sessionId);
  }
}

// The reviewed plan runs the real stream on the same turn: from the board straight into the search run.
export async function approvePlan(sessionId: string, turnId: string, plan: Search[]): Promise<void> {
  if (!plan.some((x) => x.term.trim() !== "")) throw new Error("empty plan"); // nothing to run: also keeps the turn reloadable
  if (!canStart(sessionId).ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  const turn = session?.turns.find((t) => t.id === turnId);
  if (!session || !turn) throw new Error("no such turn"); // before any state or stream
  if (turn.status !== "awaiting_plan") throw new Error("not awaiting");
  const mode: AskMode = turn.mode === "quick" ? "quick" : "deep"; // a plan is only ever reviewed in deep mode
  const c = new AbortController();
  const store = () => useChatStore.getState();
  take(sessionId, turnId, c);
  if (shared()) {
    try {
      await sharedRun(sessionId, { session_id: sessionId, turn_id: turnId, kind: "ask", question: turn.question, mode, history: historyFrom(session), plan }, turn, true, c);
    } catch (e) {
      if (!c.signal.aborted) throw e; // the turn stays awaiting its plan; the card says the start failed
    } finally {
      release(sessionId);
    }
    return;
  }
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} };
  try {
    store().patchTurn(sessionId, turnId, { status: "running", progress: emptyProgress, plan });
    await runAsk(turn.question, c, { mode, history: historyFrom(session), plan }, patch);
  } finally {
    release(sessionId);
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

// Same per-session controller as startRun: one active turn per session, Stop aborts it, a reload reads the stored turn as interrupted.
export async function startAnalysis(sessionId: string, question: string, fileId: string, fileName?: string): Promise<void> {
  if (!canStart(sessionId).ok) throw new Error("busy");
  const session = useChatStore.getState().sessions.find((x) => x.id === sessionId);
  if (!session) throw new Error("no such session"); // before any state or stream
  if (!fileId) throw new Error("no file"); // before any state or stream
  const turnId = newId();
  const c = new AbortController();
  const store = () => useChatStore.getState();
  if (shared()) {
    take(sessionId, turnId, c);
    try {
      if (!session.title) store().renameSession(sessionId, question);
      await sharedRun(sessionId, { session_id: sessionId, turn_id: turnId, kind: "analyze", question, file_id: fileId, ...(fileName ? { file_name: fileName } : {}) },
        { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, kind: "analysis", analysis: analysisFrom(fileId, fileName) }, false, c);
    } catch (e) {
      if (!c.signal.aborted) throw e;
    } finally {
      release(sessionId);
    }
    return;
  }
  let analysis = analysisFrom(fileId, fileName);
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress, kind: "analysis", analysis });
  take(sessionId, turnId, c);
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
    release(sessionId);
  }
}
