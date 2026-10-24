"use client";
import Link from "next/link";
import { Box, Button, IconButton, Stack, Typography, useColorScheme } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";
import { useHydrated } from "@/lib/history";
import { usePrefs } from "@/lib/prefs";
import { landing } from "@/lib/strings";

const gutter = { xs: 2, sm: 4, lg: 6 };
const wrap = { maxWidth: 1180, mx: "auto", px: gutter };
const ring = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } };
const next = { system: "light", light: "dark", dark: "system" } as const;

// The one authored motion moment: the trace line draws down the path once while the steps nudge into place.
// Copy is never hidden (no opacity), only moved. Plain CSS under no-preference only, so SSR and reduced-motion show the finished state with no script and no flash.
const STEP = 0.5; // seconds between steps
const trace = {
  "@media (prefers-reduced-motion: no-preference)": {
    "& .trace-line": { animation: "landing-draw 1.4s cubic-bezier(0.22, 1, 0.36, 1) both" },
    "& .trace-step": { animation: "landing-settle 0.6s cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: "calc(var(--i) * " + STEP + "s)" },
    "@keyframes landing-draw": { from: { transform: "scaleY(0)" }, to: { transform: "scaleY(1)" } },
    "@keyframes landing-settle": { from: { transform: "translateY(10px)" }, to: { transform: "none" } },
  },
};

export default function Home() {
  const hydrated = useHydrated();
  const prefLang = usePrefs((s) => s.lang);
  const setLang = usePrefs((s) => s.setLang);
  const { mode, setMode } = useColorScheme();
  const lang = hydrated ? prefLang : "th";
  const other = lang === "th" ? "en" : "th";
  const L = landing[lang];
  const twin = landing[other];
  const m = hydrated ? mode ?? "system" : "system";
  const ModeIcon = { light: LightModeOutlinedIcon, dark: DarkModeOutlinedIcon, system: SettingsBrightnessOutlinedIcon }[m as "light"];
  const modeName = { light: L.themeLight, dark: L.themeDark, system: L.themeSystem }[m as "light"];
  const cta = (sx = {}) => (
    <Button component={Link} href="/chat" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 52, px: 3, ...ring, ...sx }}>
      {L.cta}
    </Button>
  );

  return (
    <Box lang={lang}>
      <Box component="header" sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" component="nav" aria-label={L.navLabel} sx={{ ...wrap, minHeight: 68, alignItems: "center", gap: { xs: 0.5, sm: 2 } }}>
          <Typography component="span" noWrap sx={{ fontSize: "1.0625rem", fontWeight: 700, letterSpacing: "-0.01em", mr: "auto" }}>{L.brand}</Typography>
          <Stack direction="row" sx={{ display: { xs: "none", md: "flex" }, gap: 3, mr: 2 }}>
            {[["#how", L.navHow], ["#check", L.navCheck]].map(([h, t]) => (
              <Box key={h} component="a" href={h} sx={{ color: "text.secondary", textDecoration: "none", fontSize: "0.9375rem", py: 1.5, "&:hover": { color: "text.primary" }, ...ring }}>{t}</Box>
            ))}
          </Stack>
          <Button color="inherit" aria-label={L.langSwitch} lang={other} onClick={() => setLang(other)} sx={{ minWidth: 44, px: 1.25, color: "text.secondary", fontWeight: 600, ...ring }}>
            {other === "en" ? "EN" : "ไทย"}
          </Button>
          <IconButton aria-label={`${L.themeLabel}: ${modeName}, ${L.themeNext}`} onClick={() => setMode(next[m as "light"])} sx={{ color: "text.secondary", ...ring }}>
            <ModeIcon fontSize="small" />
          </IconButton>
          {cta({ minHeight: 44, px: { xs: 1.5, sm: 2.5 }, whiteSpace: "nowrap", "& .MuiButton-endIcon": { display: { xs: "none", sm: "inherit" } } })}
        </Stack>
        <Stack direction="row" sx={{ ...wrap, display: { xs: "flex", md: "none" }, gap: 3, pb: 0.5 }}>
          {[["#how", L.navHow], ["#check", L.navCheck]].map(([h, t]) => (
            <Box key={h} component="a" href={h} sx={{ color: "text.secondary", textDecoration: "none", fontSize: "0.9375rem", py: 1.25, minHeight: 44, display: "flex", alignItems: "center", ...ring }}>{t}</Box>
          ))}
        </Stack>
      </Box>

      <Box sx={{ ...wrap, pt: { xs: 5, md: 9 }, pb: { xs: 6, md: 10 }, display: "grid", gap: { xs: 6, md: 8 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.5fr) minmax(0,1fr)" }, alignItems: "start" }}>
        <Box>
          <Typography component="h1" sx={{ m: 0, fontSize: "clamp(2rem, 1.1rem + 3vw, 3.5rem)", fontWeight: 700, lineHeight: 1.22, letterSpacing: "-0.015em", textWrap: "balance", overflowWrap: "break-word" }}>
            <Box component="span" sx={{ display: "block", color: "primary.main" }}>{L.titleA}</Box>
            <Box component="span" sx={{ display: "block" }}>{L.titleB.split("|").map((x, i) => <span key={i} style={{ display: "inline-block" }}>{x}{i === 0 ? " " : ""}</span>)}</Box>
          </Typography>
          <Typography lang={other} sx={{ mt: 1.5, color: "text.secondary", fontSize: "1rem", lineHeight: 1.5, textWrap: "balance" }}>
            {`${twin.titleA} ${twin.titleB.replace("|", " ")}`}
          </Typography>
          <Typography sx={{ mt: 3.5, maxWidth: "36rem", fontSize: "1.0625rem", lineHeight: 1.85, textWrap: "pretty" }}>{L.lead}</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 4, gap: 1.5, alignItems: { sm: "center" } }}>
            {cta()}
            <Button component="a" href="#how" variant="outlined" color="inherit" size="large" sx={{ minHeight: 52, px: 3, borderColor: "divider", ...ring }}>{L.how}</Button>
          </Stack>
        </Box>

        <Box>
          <Typography sx={{ m: 0, mb: 1.5, fontSize: "0.9375rem", fontWeight: 600, color: "text.secondary" }}>{L.exampleLabel}</Typography>
          <Box component={Link} href="/chat" aria-label={`${L.example}. ${L.exampleHint}`}
            sx={{ display: "block", p: 2.5, border: 1, borderColor: "primary.main", borderRadius: 2, bgcolor: "background.paper", color: "text.primary", textDecoration: "none", ...ring, "&:hover": { bgcolor: "action.hover" } }}>
            <Typography sx={{ fontSize: "1.125rem", lineHeight: 1.7, textWrap: "pretty" }}>“{L.example}”</Typography>
            <Typography sx={{ mt: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{L.exampleHint}</Typography>
          </Box>

        </Box>
      </Box>

      <Box id="how" component="section" aria-labelledby="how-h" sx={{ borderTop: 1, borderColor: "divider", ...trace }}>
        <Box sx={{ ...wrap, py: { xs: 6, md: 9 }, display: "grid", gap: { xs: 3, md: 8 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) minmax(0,1.25fr)" } }}>
          <Typography id="how-h" component="h2" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "1.875rem" }, fontWeight: 700, lineHeight: 1.4, textWrap: "balance" }}>{L.howTitle}</Typography>
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", position: "relative" }}>
            <Box aria-hidden="true" className="trace-line" sx={{ position: "absolute", left: 17, top: 18, bottom: 18, width: 2, bgcolor: "primary.main", opacity: 0.5, transformOrigin: "top" }} />
            {L.steps.map((s, i) => (
              <Box component="li" key={s.t} className="trace-step" style={{ "--i": i } as React.CSSProperties}
                sx={{ position: "relative", display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", columnGap: 2, pb: i < 2 ? 3 : 0 }}>
                <Box aria-hidden="true" sx={{ width: 36, height: 36, borderRadius: "50%", border: 2, borderColor: "primary.main", bgcolor: "background.default", display: "grid", placeItems: "center", fontSize: "0.9375rem", fontWeight: 700, color: "primary.main", fontVariantNumeric: "tabular-nums" }}>{i + 1}</Box>
                <Box>
                  <Typography component="h3" sx={{ m: 0, fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.6, color: "primary.main" }}>{s.t}</Typography>
                  <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{s.d}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box id="check" component="section" aria-labelledby="check-h" sx={{ borderTop: 1, borderColor: "divider", scrollMarginTop: 0 }}>
        <Box sx={{ ...wrap, py: { xs: 6, md: 9 }, display: "grid", gap: { xs: 2.5, md: 8 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) minmax(0,1.25fr)" } }}>
          <Typography id="check-h" component="h2" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "1.875rem" }, fontWeight: 700, lineHeight: 1.4, textWrap: "balance" }}>{L.checkTitle}</Typography>
          <Box sx={{ maxWidth: "40rem" }}>
            <Typography sx={{ fontSize: "1.0625rem", lineHeight: 1.85, textWrap: "pretty" }}>{L.checkBody}</Typography>
            <Typography sx={{ mt: 2, fontSize: "0.9375rem", lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{L.scope}</Typography>
          </Box>
        </Box>
      </Box>

      <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Stack sx={{ ...wrap, py: { xs: 5, md: 6 }, flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: { md: "center" }, justifyContent: "space-between" }}>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.6, textWrap: "balance" }}>{L.footer}</Typography>
          <Box>{cta()}</Box>
        </Stack>
      </Box>
    </Box>
  );
}
