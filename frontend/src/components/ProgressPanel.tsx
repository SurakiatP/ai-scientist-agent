"use client";
import { Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import type { Search } from "@/lib/sse";
import type { Strings } from "@/lib/strings";

export type Progress = {
  waiting: number | null;
  reasoning: string;
  searches: Search[];
  sources: Record<string, number>; // term -> papers found
  answered: string[]; // terms summarised
  writing: boolean;
};

export const emptyProgress: Progress = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false };

export function ProgressPanel({ p, running, t }: { p: Progress; running: boolean; t: Strings }) {
  const status = p.waiting != null && !p.searches.length ? `${t.waiting} ${p.waiting}` : p.writing ? t.writing : !p.searches.length ? t.planning : t.searching;
  return (
    <Stack spacing={2} aria-live="polite">
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
          {p.searches.map((s) => (
            <Stack component="li" key={s.term} direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
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
