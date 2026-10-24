"use client";
import { Box, Button, Stack, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { useEffect } from "react";
import { wasEmpty } from "@/lib/motion";
import { useT } from "@/lib/prefs";
import { sampleQuestions } from "@/lib/strings";
import { Composer, focusComposer, useDraft } from "./Composer";

// Fills the composer, never sends. ponytail: sampleQuestions are Thai-only; add an English set when needed.
export function Starters({ label, sessionId }: { label: string; sessionId: string }) {
  const set = useDraft((s) => s.set);
  return (
    <Stack component="section" aria-label={label} spacing={1} sx={{ width: "100%" }}>
      {sampleQuestions.map((q) => (
        <Button key={q} variant="outlined" color="inherit" endIcon={<ArrowForwardRoundedIcon />}
          onClick={() => { set(sessionId, q); focusComposer(); }}
          sx={{ justifyContent: "space-between", textAlign: "left", borderColor: "divider", bgcolor: "background.paper", fontWeight: 400, px: 2, py: 1 }}>
          {q}
        </Button>
      ))}
    </Stack>
  );
}

export function EmptyChat({ sessionId }: { sessionId: string }) {
  const t = useT();
  useEffect(() => { wasEmpty.add(sessionId); }, [sessionId]);
  return (
    <Box sx={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 3, px: 2, py: 4 }}>
      <Typography component="h1" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" }, fontWeight: 700, textAlign: "center", textWrap: "balance" }}>{t.emptyHeading}</Typography>
      <Box sx={{ width: "100%", maxWidth: 760 }}><Composer sessionId={sessionId} large /></Box>
      <Box sx={{ width: "100%", maxWidth: 760 }}><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>
    </Box>
  );
}
