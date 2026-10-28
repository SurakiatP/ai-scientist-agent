import type { AskEvent, Search } from "./sse";

export type Progress = {
  waiting: number | null;
  eta?: number | null; // seconds the queue expects to wait, when the server estimates it
  reasoning: string;
  searches: Search[];
  sources: Record<string, number>; // term -> papers found
  answered: string[]; // terms summarised
  writing: boolean;
  phase: "waiting" | "planning" | "searching" | "writing" | "done";
};

// Backend sends all `sources` before any `answer`, so the first `answer` means writing has started.
export function reduce(p: Progress, e: AskEvent): Progress {
  switch (e.type) {
    case "waiting": return { ...p, waiting: e.position, eta: typeof e.eta_seconds === "number" ? e.eta_seconds : null, phase: "waiting" };
    case "strategy": return { ...p, reasoning: e.reasoning, searches: e.searches, phase: "searching" };
    case "sources": return { ...p, sources: { ...p.sources, [e.term]: (p.sources[e.term] ?? 0) + e.papers.length }, phase: p.phase === "writing" ? p.phase : "searching" };
    case "answer": return { ...p, answered: [...p.answered, e.term], writing: true, phase: "writing" };
    case "final_answer": case "complete": return { ...p, writing: false, phase: "done" };
    default: return p;
  }
}

export const emptyProgress: Progress = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };
