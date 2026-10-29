import type { AskEvent, Search } from "./sse";

export type Replan = { reasoning: string; thin: string[]; searches: Search[] };

export type Progress = {
  waiting: number | null;
  eta?: number | null; // seconds the queue expects to wait, when the server estimates it
  reasoning: string;
  searches: Search[];
  replans?: Replan[]; // plan changes made after the first round of sources; absent on older turns
  sources: Record<string, number>; // term -> papers found
  seen?: string[]; // ids of the sources (paper sources and databases) that returned something in this run; absent on older turns
  answered: string[]; // terms summarised
  writing: boolean;
  phase: "waiting" | "planning" | "searching" | "writing" | "done";
};

const SEEN_MAX = 100;
// Adds source ids to `seen`; returns {} when nothing is new so the progress object keeps its identity-relevant shape.
const seenPatch = (p: Progress, ids: (string | null | undefined)[]): { seen?: string[] } => {
  const cur = p.seen ?? [], next = [...new Set([...cur, ...ids.filter((i): i is string => !!i)])].slice(0, SEEN_MAX);
  return next.length === cur.length ? {} : { seen: next };
};

// Backend sends all `sources` before any `answer`, so the first `answer` means writing has started.
export function reduce(p: Progress, e: AskEvent): Progress {
  switch (e.type) {
    case "waiting": return { ...p, waiting: e.position, eta: typeof e.eta_seconds === "number" ? e.eta_seconds : null, phase: "waiting" };
    case "strategy": return { ...p, reasoning: e.reasoning, searches: e.searches, phase: "searching" };
    case "replan": return { ...p, searches: [...p.searches, ...e.searches], replans: [...(p.replans ?? []), { reasoning: e.reasoning, thin: e.thin, searches: e.searches }], phase: "searching" };
    case "sources": return { ...p, sources: { ...p.sources, [e.term]: (p.sources[e.term] ?? 0) + e.papers.length }, phase: p.phase === "writing" ? p.phase : "searching", ...seenPatch(p, (e.papers ?? []).map((x) => x.source)) };
    case "records": return { ...p, ...seenPatch(p, (e.records ?? []).map((r) => r.database)) };
    case "answer": return { ...p, answered: [...p.answered, e.term], writing: true, phase: "writing" };
    case "final_answer": case "complete": return { ...p, writing: false, phase: "done" };
    default: return p;
  }
}

export const emptyProgress: Progress = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };
