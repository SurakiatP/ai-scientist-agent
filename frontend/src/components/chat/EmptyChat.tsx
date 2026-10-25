"use client";
import { Box, Button, Typography } from "@mui/material";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FindInPageOutlinedIcon from "@mui/icons-material/FindInPageOutlined";
import { useEffect } from "react";
import { UI } from "@/lib/config";
import { wasEmpty } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { sampleHints, sampleHintsEn, sampleQuestions, sampleQuestionsEn } from "@/lib/strings";
import { Composer, focusComposer, useDraft } from "./Composer";

const ICONS = [FindInPageOutlinedIcon, DescriptionOutlinedIcon, BarChartOutlinedIcon];

// Fills the composer, never sends. Hand-written per language.
export function Starters({ label, sessionId }: { label: string; sessionId: string }) {
  const set = useDraft((s) => s.set), en = usePrefs((s) => s.lang) === "en";
  const hints = en ? sampleHintsEn : sampleHints;
  return (
    <Box component="section" aria-label={label} sx={{ width: "100%", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
      {(en ? sampleQuestionsEn : sampleQuestions).slice(0, 2).map((q, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <Button key={q} variant="outlined" color="inherit" aria-label={q}
            onClick={() => { set(sessionId, q); focusComposer(); }}
            sx={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", textAlign: "left", gap: 1, borderColor: "divider", borderRadius: 3, fontWeight: 400, px: 2, py: 1.75, minHeight: 112,
              bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 70%, transparent)",
              "&:hover": { borderColor: "primary.main", bgcolor: "background.paper" },
            }}>
            <Icon aria-hidden sx={{ fontSize: 22, color: "primary.main" }} />
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
  const hasAccent = t.emptyHeading.startsWith(t.emptyAccent);
  return (
    <Box sx={{
      minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: { xs: 2.5, md: 3 }, px: { xs: 2, md: 4 }, py: 4,
      background: "radial-gradient(ellipse 60% 45% at 50% 40%, color-mix(in srgb, var(--mui-palette-primary-main) 9%, transparent), transparent 70%)",
    }}>
      <Typography component="h1" sx={{ fontSize: { xs: "1.625rem", md: "2rem" }, fontWeight: 600, lineHeight: 1.3, textAlign: "center", textWrap: "balance" }}>
        {hasAccent ? <><Box component="span" sx={{ color: "primary.main" }}>{t.emptyAccent}</Box>{t.emptyHeading.slice(t.emptyAccent.length)}</> : t.emptyHeading}
      </Typography>
      <Box sx={{ width: "100%", maxWidth: UI.composer }}><Composer sessionId={sessionId} large /></Box>
      <Box sx={{ width: "100%", maxWidth: UI.composer }}><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>
    </Box>
  );
}
