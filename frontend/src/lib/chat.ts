import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isItem, newId, safeStorage, storageFull, useHistoryStore } from "./history";
import type { Progress } from "./progress";
import type { AnalysisArtifact, AnalysisQuality, AnalysisStep, AnalysisTable, AskMode, Reference, Search } from "./sse";

// What the analyze stream taught us about this turn. Every field is optional because events arrive one at a time.
export type TurnAnalysis = {
  fileId: string;
  fileName?: string;
  steps: AnalysisStep[];
  script?: string;
  quality?: AnalysisQuality;
  tables?: AnalysisTable[];
  findings?: string[];
  timings?: Record<string, number>;
  artifacts?: AnalysisArtifact[];
};

export type Turn = {
  id: string; question: string; createdAt: number;
  status: "running" | "awaiting_plan" | "done" | "refused" | "error" | "stopped" | "interrupted";
  progress: Progress;
  mode?: AskMode;
  kind?: "analysis";
  plan?: Search[]; // the approved plan: stored while awaiting review and kept as "the plan used" after approval
  answer?: { content: string; references: Reference[] };
  analysis?: TurnAnalysis;
  refused?: string; refusedCode?: RefusalCode; error?: string;
};
export type Session = { id: string; projectId: string; title: string; createdAt: number; updatedAt: number; turns: Turn[] };
export type Project = { id: string; name: string; createdAt: number }; // id "personal" is built in; name "" = localized default

export const REFUSAL_CODES = ["out_of_scope", "injection", "needs_search", "use_research", "empty_memory", "too_long", "unsafe_request", "not_about_data", "check_failed"] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];
/** The backend's refusal code, or nothing: unknown, oversized or non-string values are ignored. */
export const refusalCode = (c: unknown): RefusalCode | undefined => typeof c === "string" && c.length <= 32 ? REFUSAL_CODES.find((x) => x === c) : undefined;

export const PERSONAL = "personal";
export const MAX_SESSIONS = 200;
export const MAX_TURNS = 50;
export const MAX_PROJECTS = 30;
const personal: Project = { id: PERSONAL, name: "", createdAt: 0 };
const STATUSES = ["running", "awaiting_plan", "done", "refused", "error", "stopped", "interrupted"];

const isStr = (v: unknown, max = Infinity): v is string => typeof v === "string" && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const TERM = 2000, REASON = 20_000, ANSWER = 200_000, REFS = 200, N = 50;
const isProgress = (v: unknown): v is Progress => {
  const p = v as Progress | null;
  return !!p && typeof p === "object" && (p.waiting === null || isNum(p.waiting)) && isStr(p.reasoning, REASON) &&
    Array.isArray(p.searches) && p.searches.length <= N && p.searches.every((x) => !!x && isStr(x.term, TERM) && isStr(x.instructions, TERM)) &&
    !!p.sources && typeof p.sources === "object" && !Array.isArray(p.sources) && Object.keys(p.sources).length <= N &&
    Object.entries(p.sources).every(([k, n]) => k.length <= TERM && isNum(n)) &&
    Array.isArray(p.answered) && p.answered.length <= N && p.answered.every((x) => isStr(x, TERM)) &&
    typeof p.writing === "boolean" && ["waiting", "planning", "searching", "writing", "done"].includes(p.phase);
};
// Write side: clamp to the read limits above so a persisted turn can never fail validation on reload.
const clampProgress = (p: Progress): Progress => ({
  ...p, reasoning: p.reasoning.slice(0, REASON),
  searches: p.searches.slice(0, N).map((x) => ({ term: x.term.slice(0, TERM), instructions: x.instructions.slice(0, TERM) })),
  sources: Object.fromEntries(Object.entries(p.sources).slice(0, N).map(([k, n]) => [k.slice(0, TERM), n])),
  answered: p.answered.slice(0, N).map((x) => x.slice(0, TERM)),
});
const clampRef = (r: Reference): Reference => ({
  ...r, id: r.id.slice(0, 20),
  paper: {
    ...r.paper, title: r.paper.title.slice(0, 500), authors: r.paper.authors.slice(0, 50).map((a) => a.slice(0, 200)),
    doi: r.paper.doi?.slice(0, 2048) ?? null, pmid: r.paper.pmid?.slice(0, 2048) ?? null, url: (r.paper.url ?? "").slice(0, 2048),
  },
});

// The review plan: at most 5 searches, every term non-empty (PlanCard blocks an empty term) and size-bounded.
const PLAN_MAX = 5, PLAN_TERM = 200, PLAN_INSTR = 500;
const isPlan = (v: unknown): v is Search[] =>
  Array.isArray(v) && v.length > 0 && v.length <= PLAN_MAX &&
  v.every((x) => isObj(x) && isStr(x.term, PLAN_TERM) && x.term.trim() !== "" && isStr(x.instructions, PLAN_INSTR));
// Write side: keep at most the server's 5 rows but never edit text the user reviews; an over-long stored plan fails isPlan on reload and the turn is dropped.
const clampPlan = (p: Search[]): Search[] => p.slice(0, PLAN_MAX);

const STEPS: readonly AnalysisStep[] = ["profiling", "writing_script", "running", "repairing", "storing"];
const FILE = 100, FILE_NAME = 500, STEP_MAX = 20, SCRIPT = 20_000, TABLE_MAX = 20, TABLE_ROWS = 200,
  COLUMNS = 200, COL = 200, CELL = 2000, FINDINGS = 50, FINDING = 1000, TIMINGS = 50, ARTIFACTS = 20;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStep = (v: unknown): v is AnalysisStep => typeof v === "string" && (STEPS as readonly string[]).includes(v);
const isCell = (v: unknown): v is string | number | boolean | null =>
  v === null || typeof v === "string" && v.length <= CELL || typeof v === "boolean" || isNum(v);
const isColumn = (v: unknown) => {
  const c = v as Record<string, unknown> | null;
  return isObj(c) && isStr(c.name, COL) && isStr(c.dtype, 100) && isNum(c.null_pct) && c.null_pct >= 0 && c.null_pct <= 100;
};
const isQuality = (v: unknown): v is AnalysisQuality => {
  const q = v as Record<string, unknown> | null;
  return isObj(q) && isNum(q.rows) && q.rows >= 0 && isNum(q.columns) && q.columns >= 0 &&
    (q.truncated === undefined || typeof q.truncated === "boolean") &&
    (q.columns_info === undefined || (Array.isArray(q.columns_info) && q.columns_info.length <= COLUMNS && q.columns_info.every(isColumn)));
};
const isTable = (v: unknown): v is AnalysisTable => {
  const t = v as Record<string, unknown> | null;
  return isObj(t) && isStr(t.name, 80) && (t.truncated === undefined || typeof t.truncated === "boolean") &&
    Array.isArray(t.columns) && t.columns.length <= COLUMNS && t.columns.every((c) => isStr(c, COL)) &&
    Array.isArray(t.rows) && t.rows.length <= TABLE_ROWS &&
    t.rows.every((r) => Array.isArray(r) && r.length <= COLUMNS && r.every(isCell));
};
const isArtifact = (v: unknown): v is AnalysisArtifact => {
  const a = v as Record<string, unknown> | null;
  return isObj(a) && isStr(a.id, FILE) && isStr(a.name, 300) && (a.kind === "figure" || a.kind === "csv") && isStr(a.url, 2048);
};
const isTimings = (v: unknown): v is Record<string, number> =>
  isObj(v) && Object.keys(v).length <= TIMINGS && Object.entries(v).every(([k, n]) => k.length <= 100 && isNum(n) && n >= 0);
const isAnalysis = (v: unknown): v is TurnAnalysis => {
  const a = v as TurnAnalysis | null;
  return isObj(a) && isStr(a.fileId, FILE) && a.fileId.length > 0 && (a.fileName === undefined || isStr(a.fileName, FILE_NAME)) &&
    Array.isArray(a.steps) && a.steps.length <= STEP_MAX && a.steps.every(isStep) &&
    (a.script === undefined || isStr(a.script, SCRIPT)) &&
    (a.quality === undefined || isQuality(a.quality)) &&
    (a.tables === undefined || (Array.isArray(a.tables) && a.tables.length <= TABLE_MAX && a.tables.every(isTable))) &&
    (a.findings === undefined || (Array.isArray(a.findings) && a.findings.length <= FINDINGS && a.findings.every((f) => isStr(f, FINDING)))) &&
    (a.timings === undefined || isTimings(a.timings)) &&
    (a.artifacts === undefined || (Array.isArray(a.artifacts) && a.artifacts.length <= ARTIFACTS && a.artifacts.every(isArtifact)));
};
// Write side: clamp every analysis field to the read limits above (a persisted turn must always reload).
const clampCell = (v: unknown): string | number | boolean | null => {
  if (v === null) return null;
  if (typeof v === "string") return v.slice(0, CELL);
  if (isNum(v)) return v;
  if (typeof v === "boolean") return v;
  try {
    return (JSON.stringify(v) ?? "").slice(0, CELL);
  } catch {
    return String(v).slice(0, CELL);
  }
};
const clampAnalysis = (a: TurnAnalysis): TurnAnalysis => ({
  fileId: a.fileId.slice(0, FILE),
  ...(a.fileName !== undefined && { fileName: a.fileName.slice(0, FILE_NAME) }),
  steps: a.steps.filter(isStep).slice(0, STEP_MAX).filter((s, i, all) => all.indexOf(s) === i),
  ...(a.script !== undefined && { script: a.script.slice(0, SCRIPT) }),
  ...(a.quality && { quality: {
    rows: Math.max(0, Math.trunc(a.quality.rows)),
    columns: Math.max(0, Math.trunc(a.quality.columns)),
    ...(a.quality.truncated !== undefined && { truncated: a.quality.truncated }),
    ...(a.quality.columns_info && { columns_info: a.quality.columns_info.slice(0, COLUMNS).map((c) => ({ name: c.name.slice(0, COL), dtype: c.dtype.slice(0, 100), null_pct: Math.min(100, Math.max(0, c.null_pct)) })) }),
  } }),
  ...(a.tables && { tables: a.tables.slice(0, TABLE_MAX).map((t) => ({
    name: t.name.slice(0, 80),
    columns: t.columns.slice(0, COLUMNS).map((c) => c.slice(0, COL)),
    rows: t.rows.slice(0, TABLE_ROWS).map((r) => r.slice(0, COLUMNS).map(clampCell)),
    ...(t.truncated !== undefined && { truncated: t.truncated }),
  })) }),
  ...(a.findings && { findings: a.findings.slice(0, FINDINGS).map((f) => f.slice(0, FINDING)) }),
  ...(a.timings && { timings: Object.fromEntries(Object.entries(a.timings).slice(0, TIMINGS).filter(([, n]) => isNum(n) && n >= 0).map(([k, n]) => [k.slice(0, 100), n])) }),
  ...(a.artifacts && { artifacts: a.artifacts.slice(0, ARTIFACTS).map((x) => ({ id: x.id.slice(0, FILE), name: x.name.slice(0, 300), kind: x.kind, url: x.url.slice(0, 2048) })) }),
});
const clampPatch = (p: Partial<Turn>): Partial<Turn> => ({
  ...p,
  ...(p.progress && { progress: clampProgress(p.progress) }),
  ...(p.error !== undefined && { error: p.error.slice(0, 2048) }),
  ...(p.refused !== undefined && { refused: p.refused.slice(0, REASON) }),
  ...(p.answer && { answer: { content: p.answer.content.slice(0, ANSWER), references: p.answer.references.slice(0, REFS).map(clampRef) } }),
  ...(p.analysis && { analysis: clampAnalysis(p.analysis) }),
  ...(p.plan !== undefined && { plan: clampPlan(p.plan) }),
});
// Reuses history's item validator for the answer + references (its question/id/createdAt are filled in).
const isTurn = (v: unknown): v is Turn => {
  const t = v as Turn | null;
  if (!t || !isStr(t.id, 100) || !isStr(t.question, 4000) || !isNum(t.createdAt) || !STATUSES.includes(t.status) || !isProgress(t.progress)) return false;
  if (t.mode !== undefined && t.mode !== "deep" && t.mode !== "quick" && t.mode !== "chat") return false;
  if (t.kind !== undefined && t.kind !== "analysis") return false;
  if (t.plan !== undefined && !isPlan(t.plan)) return false;
  if (t.status === "awaiting_plan" && !t.plan) return false; // an awaiting turn must carry the plan it waits for
  if (t.refused !== undefined && !isStr(t.refused, 20_000)) return false;
  if (t.refusedCode !== undefined && refusalCode(t.refusedCode) === undefined) return false;
  if (t.error !== undefined && !isStr(t.error, 2048)) return false;
  if (t.analysis !== undefined && !isAnalysis(t.analysis)) return false;
  return t.answer === undefined || (!!t.answer && isItem({ id: "x", question: "", createdAt: 0, answer: t.answer.content, references: t.answer.references }));
};
const isSession = (v: unknown): v is Session => {
  const s = v as Session | null;
  return !!s && isStr(s.id, 100) && isStr(s.projectId, 100) && isStr(s.title, 200) && isNum(s.createdAt) && isNum(s.updatedAt) &&
    Array.isArray(s.turns);
};
const isProject = (v: unknown): v is Project => {
  const p = v as Project | null;
  return !!p && isStr(p.id, 100) && isStr(p.name, 100) && isNum(p.createdAt);
};

// Newest activity first; the oldest sessions past the cap are dropped.
const capSessions = (s: Session[]) => [...s].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
const title = (q: string) => q.trim().slice(0, 60);

type State = {
  projects: Project[]; sessions: Session[]; activeId: string | null; activeProjectId: string; legacyImported: boolean;
  newSession: (projectId?: string) => string;
  setActive: (id: string | null) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  moveSession: (id: string, projectId: string) => void;
  addProject: (name: string) => string;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  patchTurn: (sessionId: string, turnId: string, patch: Partial<Turn>) => void;
  addTurn: (sessionId: string, turn: Turn) => void;
  importLegacyHistory: () => void;
  clearAll: () => void;
};

export type { State as ChatState };
const mapSession = (s: State, id: string, f: (x: Session) => Session) => ({ sessions: s.sessions.map((x) => (x.id === id ? f(x) : x)) });
const hasProject = (s: State, id: string) => s.projects.some((p) => p.id === id);

// ponytail: every event re-serialises the whole store (up to 200 sessions) and localStorage caps near 5MB;
// past that setItem fails silently (safeStorage) and in-memory state stays authoritative. Debounce/IndexedDB if it bites.
export const useChatStore = create<State>()(
  persist(
    (set, get) => ({
      projects: [personal], sessions: [], activeId: null, activeProjectId: PERSONAL, legacyImported: false,
      newSession: (projectId) => {
        const id = newId(), now = Date.now();
        let reused = "";
        set((s) => {
          const pid = projectId && hasProject(s, projectId) ? projectId : PERSONAL;
          const blank = s.sessions.find((x) => x.projectId === pid && !x.turns.length && !x.title); // never pile up blank chats
          if (blank) { reused = blank.id; return { activeId: blank.id, activeProjectId: pid }; }
          return { sessions: capSessions([{ id, projectId: pid, title: "", createdAt: now, updatedAt: now, turns: [] }, ...s.sessions]), activeId: id, activeProjectId: pid };
        });
        return reused || id;
      },
      setActive: (id) =>
        set((s) => {
          const sess = s.sessions.find((x) => x.id === id);
          return sess ? { activeId: id, activeProjectId: sess.projectId } : { activeId: null };
        }),
      renameSession: (id, t) => set((s) => mapSession(s, id, (x) => ({ ...x, title: title(t) || x.title }))),
      deleteSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id), activeId: s.activeId === id ? null : s.activeId })),
      moveSession: (id, projectId) => set((s) => (hasProject(s, projectId) ? mapSession(s, id, (x) => ({ ...x, projectId })) : {})),
      addProject: (name) => {
        if (get().projects.length >= MAX_PROJECTS) return ""; // at the cap: no project made, "" is never a valid id
        const id = newId();
        set((s) => ({ projects: [...s.projects, { id, name: name.trim().slice(0, 100), createdAt: Date.now() }] }));
        return id;
      },
      renameProject: (id, name) =>
        set((s) => (id === PERSONAL ? {} : { projects: s.projects.map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 100) || p.name } : p)) })),
      deleteProject: (id) =>
        set((s) => id === PERSONAL ? {} : {
          projects: s.projects.filter((p) => p.id !== id),
          sessions: s.sessions.map((x) => (x.projectId === id ? { ...x, projectId: PERSONAL } : x)),
          activeProjectId: s.activeProjectId === id ? PERSONAL : s.activeProjectId,
        }),
      addTurn: (sessionId, turn) =>
        set((s) => mapSession(s, sessionId, (x) => ({
          ...x, title: x.title || title(turn.question), updatedAt: Date.now(),
          turns: [...x.turns, { ...turn, ...clampPatch(turn) }].slice(-MAX_TURNS), // oldest turn dropped past the cap
        }))),
      patchTurn: (sessionId, turnId, patch) =>
        set((s) => mapSession(s, sessionId, (x) => ({ ...x, updatedAt: Date.now(), turns: x.turns.map((t) => (t.id === turnId ? { ...t, ...clampPatch(patch) } : t)) }))),
      importLegacyHistory: () => {
        if (get().legacyImported) return;
        const items = useHistoryStore.getState().items;
        const imported: Session[] = items.map((i) => ({
          id: newId(), projectId: PERSONAL, title: title(i.question), createdAt: i.createdAt, updatedAt: i.createdAt,
          turns: [{
            id: newId(), question: i.question, createdAt: i.createdAt, status: "done",
            progress: { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "done" },
            answer: { content: i.answer, references: i.references },
          }],
        }));
        set((s) => ({ legacyImported: true, sessions: capSessions([...s.sessions, ...imported]) }));
        if (!storageFull()) safeStorage.removeItem("scientist-history-v1"); // history now lives in the chat store only; keep it if the flag could not be written
      },
      clearAll: () => set({ projects: [personal], sessions: [], activeId: null, activeProjectId: PERSONAL }),
    }),
    {
      name: "scientist-chat-v1",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      migrate: (state) => state as State,
      partialize: (s) => ({ projects: s.projects, sessions: s.sessions, activeId: s.activeId, activeProjectId: s.activeProjectId, legacyImported: s.legacyImported }),
      // Corrupt/foreign storage: keep only well-formed items. A `running` turn cannot survive a reload.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const projects = [personal, ...(Array.isArray(p.projects) ? p.projects.filter((x) => isProject(x) && x.id !== PERSONAL) : [])].slice(0, MAX_PROJECTS);
        const ids = new Set(projects.map((x) => x.id));
        const sessions = capSessions(
          (Array.isArray(p.sessions) ? p.sessions.filter(isSession) : []).map((x) => ({
            ...x, // bad/excess turns are dropped individually, not the whole session
            projectId: ids.has(x.projectId) ? x.projectId : PERSONAL,
            turns: x.turns.filter(isTurn).slice(-MAX_TURNS).map((t) => (t.status === "running" ? { ...t, status: "interrupted" as const } : t)),
          })),
        );
        const active = sessions.find((x) => x.id === p.activeId);
        return {
          ...current, projects, sessions, activeId: active ? active.id : null,
          activeProjectId: typeof p.activeProjectId === "string" && ids.has(p.activeProjectId) ? p.activeProjectId : PERSONAL,
          legacyImported: p.legacyImported === true,
        };
      },
    },
  ),
);
