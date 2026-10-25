import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { isItem, newId, safeStorage, storageFull, useHistoryStore } from "./history";
import type { Progress } from "./progress";
import type { Reference } from "./sse";

export type Turn = {
  id: string; question: string; createdAt: number;
  status: "running" | "done" | "refused" | "error" | "stopped" | "interrupted";
  progress: Progress;
  answer?: { content: string; references: Reference[] };
  refused?: string; error?: string;
};
export type Session = { id: string; projectId: string; title: string; createdAt: number; updatedAt: number; turns: Turn[] };
export type Project = { id: string; name: string; createdAt: number }; // id "personal" is built in; name "" = localized default

export const PERSONAL = "personal";
export const MAX_SESSIONS = 200;
export const MAX_TURNS = 50;
export const MAX_PROJECTS = 30;
const personal: Project = { id: PERSONAL, name: "", createdAt: 0 };
const STATUSES = ["running", "done", "refused", "error", "stopped", "interrupted"];

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
const clampPatch = (p: Partial<Turn>): Partial<Turn> => ({
  ...p,
  ...(p.progress && { progress: clampProgress(p.progress) }),
  ...(p.error !== undefined && { error: p.error.slice(0, 2048) }),
  ...(p.refused !== undefined && { refused: p.refused.slice(0, REASON) }),
  ...(p.answer && { answer: { content: p.answer.content.slice(0, ANSWER), references: p.answer.references.slice(0, REFS).map(clampRef) } }),
});
// Reuses history's item validator for the answer + references (its question/id/createdAt are filled in).
const isTurn = (v: unknown): v is Turn => {
  const t = v as Turn | null;
  if (!t || !isStr(t.id, 100) || !isStr(t.question, 4000) || !isNum(t.createdAt) || !STATUSES.includes(t.status) || !isProgress(t.progress)) return false;
  if (t.refused !== undefined && !isStr(t.refused, 20_000)) return false;
  if (t.error !== undefined && !isStr(t.error, 2048)) return false;
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
        set((s) => {
          const pid = projectId && hasProject(s, projectId) ? projectId : PERSONAL;
          return { sessions: capSessions([{ id, projectId: pid, title: "", createdAt: now, updatedAt: now, turns: [] }, ...s.sessions]), activeId: id, activeProjectId: pid };
        });
        return id;
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
