"use client";
import { Box, Stack, Typography } from "@mui/material";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { stagesDone, statusText } from "./ProgressCard";

// Compact right-panel view of the same facts as ProgressCard; every number comes from `progress`.
export function ProgressPanel({ turn }: { turn: Turn }) {
  const t = useT();
  const p = turn.progress;
  const found = Object.values(p.sources).reduce((a, b) => a + b, 0);
  const rows: [string, string][] = [
    [t.stagesDone, `${stagesDone(p)}/4`],
    [t.sourcesFound, String(found)],
    [t.branchesDone, `${p.answered.length}/${p.searches.length}`],
  ];
  return (
    <Stack spacing={2} component="section" aria-label={t.progress}>
      <Box>
        <Typography component="h2" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.progress}</Typography>
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25 }}>{turn.status === "running" ? statusText(p, t) : turn.question}</Typography>
      </Box>
      <Box component="dl" sx={{ m: 0, display: "grid", gap: 1.25 }}>
        {rows.map(([k, v]) => (
          <Box key={k} sx={{ display: "flex", justifyContent: "space-between", gap: 2, borderTop: 1, borderColor: "divider", pt: 1.25 }}>
            <Box component="dt" sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{k}</Box>
            <Box component="dd" sx={{ m: 0, fontSize: "0.875rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}
