"use client";
import { Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import type { AskEvent, Search } from "@/lib/sse";
import type { Strings } from "@/lib/strings";

export type Progress = {
  waiting: number | null;
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
    case "waiting": return { ...p, waiting: e.position, phase: "waiting" };
    case "strategy": return { ...p, reasoning: e.reasoning, searches: e.searches, phase: "searching" };
    case "sources": return { ...p, sources: { ...p.sources, [e.term]: (p.sources[e.term] ?? 0) + e.papers.length }, phase: p.phase === "writing" ? p.phase : "searching" };
    case "answer": return { ...p, answered: [...p.answered, e.term], writing: true, phase: "writing" };
    case "final_answer": case "complete": return { ...p, writing: false, phase: "done" };
    default: return p;
  }
}

export const emptyProgress: Progress = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };

export function ProgressPanel({ p, running, t }: { p: Progress; running: boolean; t: Strings }) {
  const status = p.phase === "waiting" ? `${t.waiting} ${p.waiting}` : p.phase === "planning" ? t.planning : p.phase === "writing" ? t.writing : p.phase === "done" ? t.done : t.searching;
  return (
    <Stack spacing={2}>
      {/* announces phase changes only, not every paper */}
      <Box role="status" aria-live="polite" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{status}</Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        {running && (
          // MUI's spinner is a CSS animation; hide it for users who prefer reduced motion
          <CircularProgress size={18} sx={{ "@media (prefers-reduced-motion: reduce)": { display: "none" } }} />
        )}
        <Typography sx={{ fontWeight: 600 }}>{running ? status : t.progress}</Typography>
      </Stack>
      {p.reasoning && <Typography variant="body2" sx={{ color: "text.secondary" }}>{p.reasoning}</Typography>}
      {p.searches.length > 0 && (
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1 }}>
          {p.searches.map((s, i) => (
            <Stack component="li" key={`${s.term}#${i}`} direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Typography variant="body2" sx={{ flex: "1 1 160px" }}>{s.term}</Typography>
              {s.term in p.sources && <Chip size="small" variant="outlined" label={`${p.sources[s.term]} ${t.papersFound}`} />}
              {p.answered.includes(s.term) && <Chip size="small" color="success" variant="outlined" label={t.branchDone} />}
            </Stack>
          ))}
        </Box>
      )}
    </Stack>
  );
}
