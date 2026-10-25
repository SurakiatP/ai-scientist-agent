"use client";
import { Box, Button, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FindInPageOutlinedIcon from "@mui/icons-material/FindInPageOutlined";
import { useEffect } from "react";
import { UI } from "@/lib/config";
import { wasEmpty } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { sampleQuestions, sampleQuestionsEn } from "@/lib/strings";
import { Composer, focusComposer, useDraft } from "./Composer";

const ICONS = [FindInPageOutlinedIcon, DescriptionOutlinedIcon, BarChartOutlinedIcon];

// Fills the composer, never sends. Hand-written per language.
export function Starters({ label, sessionId }: { label: string; sessionId: string }) {
  const set = useDraft((s) => s.set), en = usePrefs((s) => s.lang) === "en";
  return (
    <Box component="section" aria-label={label} sx={{ width: "100%", display: "grid", gap: 1, gridTemplateColumns: "1fr" }}>
      {(en ? sampleQuestionsEn : sampleQuestions).map((q, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <Button key={q} variant="outlined" color="inherit" startIcon={<Icon sx={{ fontSize: 20 }} />} endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={() => { set(sessionId, q); focusComposer(); }}
            sx={{
              justifyContent: "space-between", textAlign: "left", borderColor: "divider", borderRadius: 2, fontWeight: 400, fontSize: "0.875rem", lineHeight: 1.5, px: 2, py: 1, minHeight: 44, gap: 1.25,
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
