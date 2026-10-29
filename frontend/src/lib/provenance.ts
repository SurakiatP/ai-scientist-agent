import type { Turn } from "./chat";
import { usableProvenance } from "./sources";
import type { Provenance } from "./sse";

/** The provenance of a finished turn: research on the answer, analysis on the analysis result. Undefined on older turns. */
// Re-validated here too: synced turns reach the UI without passing the local load path.
export const provenanceOf = (turn: Turn): Provenance | undefined => usableProvenance(turn.kind === "analysis" ? turn.analysis?.provenance : turn.answer?.provenance);

// A malformed createdAt (NaN, out of range) must not throw: the current time stands in.
const isoOf = (ms: number, now = new Date()) => { const d = new Date(ms); return (Number.isNaN(d.getTime()) ? now : d).toISOString(); };

/** The downloadable file. References keep their ID-check data but never the paper abstract. */
export function buildProvenanceFile(turn: Turn, now = new Date()) {
  const provenance = provenanceOf(turn);
  if (!provenance) return null;
  const a = turn.analysis;
  return {
    format: "ai-scientist-provenance",
    version: 1,
    exported_at: now.toISOString(),
    turn: { id: turn.id, question: turn.question, mode: turn.mode ?? null, created_at: isoOf(turn.createdAt, now) },
    answer: {
      content: turn.answer?.content ?? (a?.findings ?? []).join("\n"), // analysis has no answer text: its findings stand in
      references: (turn.answer?.references ?? []).map((r) => ({
        id: r.id, title: r.paper.title, authors: r.paper.authors, year: r.paper.year, doi: r.paper.doi, pmid: r.paper.pmid,
        url: r.paper.url, source: r.paper.source ?? null, status: r.status, checks: r.checks ?? [],
      })),
      records: turn.answer?.records ?? [],
    },
    analysis: turn.kind === "analysis" ? { script: a?.script ?? "", file_id: a?.fileId ?? null, file_name: a?.fileName ?? null } : null,
    provenance,
  };
}

export const provenanceFilename = (turn: Turn) => `ai-scientist-provenance-${isoOf(turn.createdAt).slice(0, 10)}-${turn.id.slice(0, 8)}.json`;

export function downloadText(text: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const referencesFilename = (turn: Turn, ext: "bib" | "ris") => `ai-scientist-references-${isoOf(turn.createdAt).slice(0, 10)}-${turn.id.slice(0, 8)}.${ext}`;

export function downloadProvenance(turn: Turn) {
  const file = buildProvenanceFile(turn);
  if (file) downloadText(JSON.stringify(file, null, 2), "application/json", provenanceFilename(turn));
}
