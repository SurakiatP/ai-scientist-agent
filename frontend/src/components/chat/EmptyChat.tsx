"use client";
import { Box, Button, Typography } from "@mui/material";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FindInPageOutlinedIcon from "@mui/icons-material/FindInPageOutlined";
import { useEffect } from "react";
import { LogoMark } from "@/components/landing/Dropdown";
import { UI } from "@/lib/config";
import { useHydrated } from "@/lib/history";
import { dur, ease, wasEmpty } from "@/lib/motion";
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
              display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-start", textAlign: "left", gap: 1, borderColor: "color-mix(in srgb, var(--mui-palette-divider) 70%, transparent)", borderRadius: "18px", fontWeight: 400, px: 2.25, py: 2, minHeight: 112,
              bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 55%, transparent)",
              transition: ["background-color", "border-color", "box-shadow", "transform"].map((p) => `${p} ${dur.quick}ms ${ease}`).join(", "),
              "&:hover": { borderColor: "color-mix(in srgb, var(--mui-palette-primary-main) 40%, transparent)", bgcolor: "background.paper", boxShadow: "0 16px 32px -20px rgb(28 78 143 / 0.4)", transform: "translateY(-1px)" },
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

// The greeting follows the user's clock; before hydration (server render) it is the plain "hello", so nothing mismatches.
function useGreeting() {
  const t = useT(), hydrated = useHydrated();
  if (!hydrated) return t.greetPlain;
  const h = new Date().getHours();
  return h < 12 ? t.greetMorning : h < 17 ? t.greetAfternoon : t.greetEvening;
}

export function EmptyChat({ sessionId }: { sessionId: string }) {
  const t = useT();
  const greeting = useGreeting();
  useEffect(() => { wasEmpty.add(sessionId); }, [sessionId]);
  return (
    <Box sx={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: { xs: 2.5, md: 3.5 }, px: { xs: 2, md: 4 }, py: 4 }}>
      <Box sx={{ textAlign: "center" }}>
        <Typography component="h1" sx={{ m: 0, display: "inline-flex", alignItems: "center", gap: 1.5, fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.015em" }}>
          <Box aria-hidden="true" sx={{ width: { xs: 32, md: 38 }, height: { xs: 32, md: 38 }, borderRadius: "10px", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText", boxShadow: "0 8px 18px -8px rgb(28 78 143 / 0.7)", flexShrink: 0 }}><LogoMark size={24} /></Box>
          {greeting}
        </Typography>
        <Typography sx={{ mt: 1, fontSize: { xs: "1rem", md: "1.125rem" }, color: "text.secondary", textWrap: "balance" }}>{t.emptyHeading}</Typography>
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
