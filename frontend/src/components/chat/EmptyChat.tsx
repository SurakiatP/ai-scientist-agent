"use client";
import { Box, Button, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FindInPageOutlinedIcon from "@mui/icons-material/FindInPageOutlined";
import { useEffect } from "react";
import { wasEmpty } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { sampleQuestions, sampleQuestionsEn } from "@/lib/strings";
import { Composer, focusComposer, useDraft } from "./Composer";

const ICONS = [FindInPageOutlinedIcon, DescriptionOutlinedIcon, BarChartOutlinedIcon];

// Fills the composer, never sends. Hand-written per language.
export function Starters({ label, sessionId }: { label: string; sessionId: string }) {
  const set = useDraft((s) => s.set), en = usePrefs((s) => s.lang) === "en";
  return (
    <Box component="section" aria-label={label} sx={{ width: "100%", display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
      {(en ? sampleQuestionsEn : sampleQuestions).map((q, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <Button key={q} variant="outlined" color="inherit" startIcon={<Icon sx={{ fontSize: 28 }} />} endIcon={<ArrowForwardRoundedIcon />}
            onClick={() => { set(sessionId, q); focusComposer(); }}
            sx={{
              justifyContent: "space-between", gap: 1.5, textAlign: "left", borderColor: "divider", borderRadius: 2, fontWeight: 400, fontSize: "0.9375rem", lineHeight: 1.6, px: 2.5, py: 2, minHeight: 72,
              bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 70%, transparent)",
              "&:hover": { borderColor: "primary.main", bgcolor: "background.paper" },
              "& .MuiButton-startIcon": { m: 0, color: "text.primary" }, "& .MuiButton-endIcon": { m: 0, ml: "auto", pl: 1 },
            }}>
            <Box component="span" sx={{ flex: 1, minWidth: 0 }}>{q}</Box>
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
      minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: { xs: 3, md: 4 }, px: { xs: 2, md: 4 }, py: 4,
      background: "radial-gradient(ellipse 60% 45% at 50% 40%, color-mix(in srgb, var(--mui-palette-primary-main) 9%, transparent), transparent 70%)",
    }}>
      <Typography component="h1" sx={{ fontSize: { xs: "2rem", md: "2.75rem" }, fontWeight: 600, lineHeight: 1.3, textAlign: "center", textWrap: "balance" }}>
        {hasAccent ? <><Box component="span" sx={{ color: "primary.main" }}>{t.emptyAccent}</Box>{t.emptyHeading.slice(t.emptyAccent.length)}</> : t.emptyHeading}
      </Typography>
      <Box sx={{ width: "100%", maxWidth: 1000 }}><Composer sessionId={sessionId} large /></Box>
      <Box sx={{ width: "100%", maxWidth: 1000 }}><Starters label={t.examplesLabel} sessionId={sessionId} /></Box>
    </Box>
  );
}
