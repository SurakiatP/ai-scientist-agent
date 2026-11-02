"use client";
import { Box, Button, Typography } from "@mui/material";
import { useEffect } from "react";
import { UI } from "@/lib/config";
import { dur, ease, wasEmpty } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { sampleHints, sampleHintsEn, sampleQuestions, sampleQuestionsEn } from "@/lib/strings";
import { Composer, focusComposer, useDraft } from "./Composer";

// Fills the composer, never sends. Hand-written per language.
export function Starters({ label, sessionId }: { label: string; sessionId: string }) {
  const set = useDraft((s) => s.set), en = usePrefs((s) => s.lang) === "en";
  const hints = en ? sampleHintsEn : sampleHints;
  return (
    <Box component="section" aria-label={label} sx={{ width: "100%", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
      {(en ? sampleQuestionsEn : sampleQuestions).slice(0, 2).map((q, i) => {
        return (
          <Button key={q} variant="text" color="inherit" aria-label={q}
            onClick={() => { set(sessionId, q); focusComposer(); }}
            sx={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", textAlign: "left", gap: 0.75, borderRadius: "16px", fontWeight: 400, px: 2.25, py: 2, minHeight: 96,
              bgcolor: "background.paper",
              transition: `background-color ${dur.quick}ms ${ease}`,
              "&:hover": { backgroundImage: "linear-gradient(var(--mui-palette-action-hover), var(--mui-palette-action-hover))" },
            }}>
            <Box component="span" title={q} sx={{ fontSize: "0.9375rem", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{q}</Box>
            <Box component="span" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{hints[i]}</Box>
          </Button>
        );
      })}
    </Box>
  );
}

export function EmptyChat({ sessionId }: { sessionId: string }) {
  const t = useT();
  useEffect(() => { wasEmpty.add(sessionId); }, [sessionId]);
  return (
    <Box sx={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: { xs: 2.5, md: 3 }, px: { xs: 2, md: 4 }, py: 4 }}>
      <Box sx={{ width: "100%", maxWidth: UI.composerHome }}>
        <Typography component="h1" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "1.75rem" }, fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.01em", textWrap: "balance" }}>{t.emptyTitle}</Typography>
        <Typography sx={{ mt: 1, fontSize: "1rem", color: "text.secondary", maxWidth: "60ch" }}>{t.emptyHeading}</Typography>
      </Box>
      <Box sx={{ width: "100%", maxWidth: UI.composerHome }}>
        <Composer sessionId={sessionId} large />
        <Typography aria-hidden="true" sx={{ display: { xs: "none", md: "flex" }, justifyContent: "flex-end", alignItems: "center", gap: 0.75, mt: -2.5, px: 1, fontSize: "0.75rem", color: "text.secondary" }}>
          <Box component="kbd" sx={{ px: 0.75, py: 0.125, borderRadius: 1, border: 1, borderColor: "divider", bgcolor: "background.paper", fontFamily: "inherit", fontSize: "0.6875rem", boxShadow: "0 1px 0 var(--mui-palette-divider)" }}>Tab</Box>{t.useExample}
        </Typography>
      </Box>
      <Box sx={{ width: "100%", maxWidth: UI.composerHome }}><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>
    </Box>
  );
}
