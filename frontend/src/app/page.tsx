"use client";
import Link from "next/link";
import { Box, Button, Stack, Typography, useColorScheme } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { Dropdown, LogoMark } from "@/components/landing/Dropdown";
import { useHydrated } from "@/lib/history";
import { usePrefs } from "@/lib/prefs";
import { landing } from "@/lib/strings";

const gutter = { xs: 2, sm: 4, lg: 6 };
const wrap = { maxWidth: 1320, mx: "auto", px: gutter };
const ring = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } };
const pill = { borderRadius: 999 };
// soft teal glow taken from the theme's primary: strong on dark, a faint wash on light
const glow = (x: string, y: string, a: number) => `radial-gradient(60% 55% at ${x} ${y}, rgb(var(--mui-palette-primary-mainChannel) / ${a}), transparent 70%)`;

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
  const L = landing[lang];
  const m = hydrated ? mode ?? "system" : "system";
  const modes = [{ value: "light", label: L.themeLight }, { value: "dark", label: L.themeDark }, { value: "system", label: L.themeSystem }];
  const modeName = modes.find((x) => x.value === m)!.label;
  const navItems = [{ value: "why", href: "#why", label: L.navProduct }, { value: "how", href: "#how", label: L.navHow }, { value: "faq", href: "#faq", label: L.navCheck }];
  const cta = (sx = {}) => (
    <Button component={Link} href="/chat" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 52, px: 3.5, ...pill, ...ring, ...sx }}>
      {L.cta}
    </Button>
  );
  const divider = { borderLeft: { md: 1 }, borderColor: "divider" };

  return (
    <Box lang={lang} sx={{ position: "relative", overflow: "hidden", "&::before": { content: '""', position: "absolute", inset: 0, height: 900, pointerEvents: "none", backgroundImage: [glow("78%", "0%", 0.2), glow("12%", "42%", 0.12)].join(","), "[data-mui-color-scheme='light'] &": { opacity: 0.45 } } }}>
      <Box component="header" sx={{ position: "relative", borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" component="nav" aria-label={L.navLabel} sx={{ ...wrap, minHeight: 72, alignItems: "center", gap: { xs: 0.5, md: 1 } }}>
          <Box component={Link} href="/" aria-label={L.brand} sx={{ display: "flex", alignItems: "center", gap: 1.25, color: "primary.main", textDecoration: "none", mr: { md: 6 }, ...ring }}>
            <LogoMark />
            <Typography component="span" noWrap sx={{ fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.01em", color: "text.primary" }}>{L.brand}</Typography>
          </Box>
          <Stack direction="row" sx={{ display: { xs: "none", md: "flex" }, gap: 4, mr: "auto" }}>
            {navItems.map((n) => (
              <Box key={n.value} component="a" href={n.href} sx={{ color: "text.primary", textDecoration: "none", fontSize: "0.9375rem", py: 1.5, "&:hover": { color: "primary.main" }, ...ring }}>{n.label}</Box>
            ))}
          </Stack>
          <Dropdown ariaLabel={L.langLabel} label={lang === "th" ? "ไทย" : "English"} selected={lang} onSelect={(v) => setLang(v as "th" | "en")}
            items={[{ value: "th", label: "ไทย", lang: "th" }, { value: "en", label: "English", lang: "en" }]} sx={{ ml: { xs: "auto", md: 0 } }} />
          <Box aria-hidden="true" sx={{ width: "1px", height: 24, bgcolor: "divider" }} />
          <Dropdown ariaLabel={`${L.themeLabel}: ${modeName}`} label={<><Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{L.themeLabel}:{"\u00a0"}</Box>{modeName}</>} selected={m} onSelect={(v) => setMode(v as "light")} items={modes} />
          <Box sx={{ display: { xs: "none", md: "block" }, ml: 1.5 }}>{cta({ minHeight: 48, px: 3, whiteSpace: "nowrap", "& .MuiButton-endIcon": { display: "none" } })}</Box>
          <Box sx={{ display: { xs: "block", md: "none" } }}>
            <Dropdown ariaLabel={L.menu} icon={<MenuRoundedIcon />} items={navItems} sx={{ minWidth: 44, px: 1 }} />
          </Box>
        </Stack>
      </Box>

      <Box component="main" sx={{ position: "relative" }}>
        <Box sx={{ ...wrap, pt: { xs: 3, md: 7 }, pb: { xs: 5, md: 8 }, display: "grid", gap: { xs: 5, md: 8 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.5fr) minmax(0,1fr)" }, alignItems: "start" }}>
          <Box>
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1.25, px: 2, minHeight: 40, border: 1, borderColor: "divider", borderRadius: 999, bgcolor: "background.paper", color: "text.secondary", fontSize: "0.875rem" }}>
              <Box aria-hidden="true" sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "primary.main", boxShadow: "0 0 0 4px rgb(var(--mui-palette-primary-mainChannel) / 0.2)" }} />
              {L.badge}
            </Box>
            <Typography component="h1" sx={{ m: 0, mt: { xs: 2.5, md: 3 }, fontSize: { xs: "2.375rem", sm: "2.75rem", lg: "3.25rem" }, fontWeight: 700, lineHeight: 1.22, letterSpacing: "-0.01em", overflowWrap: "break-word" }}>
              <Box component="span" sx={{ display: "block", color: "primary.main" }}>{L.titleA}</Box>
              <Box component="span" sx={{ display: "block" }}>{L.titleB.split("|").map((x, i) => <span key={i} style={{ display: "inline-block" }}>{x}{i === 0 ? " " : ""}</span>)}</Box>
            </Typography>
            <Typography sx={{ mt: { xs: 3, md: 4 }, maxWidth: "42rem", fontSize: { xs: "1.0625rem", md: "1.1875rem" }, lineHeight: 1.85, color: "text.secondary", textWrap: "pretty" }}>{L.lead}</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: { xs: 3.5, md: 5 }, gap: 2, alignItems: { sm: "center" } }}>
              {cta({ minHeight: 60, px: 4.5, fontSize: "1.125rem" })}
              <Button component="a" href="#how" variant="outlined" color="inherit" size="large" sx={{ minHeight: 60, px: 4.5, fontSize: "1.0625rem", borderColor: "divider", ...pill, ...ring }}>{L.how}</Button>
            </Stack>
          </Box>

          <Box sx={{ pt: { md: 2 } }}>
            <Typography sx={{ m: 0, mb: 1.5, pl: 1, fontSize: "0.9375rem", color: "text.secondary" }}>{L.exampleLabel}</Typography>
            <Box component={Link} href="/chat" aria-label={`${L.example}. ${L.exampleHint}`}
              sx={{ display: "block", px: 3.5, py: 3, border: 1, borderColor: "primary.main", borderRadius: 4, bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.06)", color: "text.primary", textDecoration: "none", ...ring, "&:hover": { bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.12)" } }}>
              <Typography sx={{ fontSize: "1.25rem", lineHeight: 1.7, textWrap: "pretty" }}>“{L.example}”</Typography>
              <Typography sx={{ mt: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{L.exampleHint}</Typography>
            </Box>

            <Box id="how" component="ol" aria-label={L.howTitle} sx={{ m: 0, mt: 5, p: 0, listStyle: "none", position: "relative", scrollMarginTop: 16, ...trace }}>
              <Box aria-hidden="true" className="trace-line" sx={{ position: "absolute", left: 20, top: 24, bottom: 36, borderLeft: "2px dashed", borderColor: "primary.main", opacity: 0.45, transformOrigin: "top" }} />
              {L.steps.map((s, i) => (
                <Box component="li" key={s.t} className="trace-step" style={{ "--i": i } as React.CSSProperties} sx={{ position: "relative", display: "grid", gridTemplateColumns: "40px minmax(0,1fr)", columnGap: 2.5, pb: i < L.steps.length - 1 ? 3.5 : 0 }}>
                  <Box aria-hidden="true" sx={{ width: 40, height: 40, borderRadius: "50%", border: 2, borderColor: "primary.main", bgcolor: "background.default", display: "grid", placeItems: "center", fontWeight: 600, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>{i + 1}</Box>
                  <Box>
                    <Typography component="h2" sx={{ m: 0, fontSize: "1.375rem", fontWeight: 600, lineHeight: 1.5, color: "primary.main" }}>{s.t}</Typography>
                    <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "text.secondary", textWrap: "pretty" }}>{s.d}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box id="why" component="section" aria-labelledby="why-h" sx={{ ...wrap, scrollMarginTop: 16 }}>
          <Box sx={{ borderTop: 1, borderColor: "divider", py: { xs: 5, md: 7 }, display: "grid", gap: { xs: 4, md: 0 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.15fr) repeat(3, minmax(0,1fr))" } }}>
            <Box sx={{ pr: { md: 4 } }}>
              <Typography sx={{ m: 0, fontSize: "0.9375rem", color: "text.secondary" }}>{L.whyKicker}</Typography>
              <Typography id="why-h" component="h2" sx={{ m: 0, mt: 1, fontSize: { xs: "1.5rem", md: "1.75rem" }, fontWeight: 600, lineHeight: 1.5, textWrap: "balance" }}>{L.whyTitle}</Typography>
            </Box>
            {L.why.map((w, i) => (
              <Box key={w.t} sx={{ ...divider, pl: { md: 4 }, pr: { md: 2 } }}>
                <Typography component="span" aria-hidden="true" sx={{ display: "block", color: "primary.main", fontSize: "1rem", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</Typography>
                <Typography component="h3" sx={{ m: 0, mt: 0.5, fontSize: "1.375rem", fontWeight: 600, lineHeight: 1.5 }}>{w.t}</Typography>
                <Typography sx={{ mt: 1.5, fontSize: "0.9375rem", lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{w.d}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box id="faq" component="section" aria-labelledby="faq-h" sx={{ ...wrap, scrollMarginTop: 16 }}>
          <Box sx={{ borderTop: 1, borderColor: "divider", py: { xs: 5, md: 7 }, display: "grid", gap: { xs: 3, md: 4 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.15fr) repeat(2, minmax(0,1.5fr))" } }}>
            <Typography id="faq-h" component="h2" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "1.75rem" }, fontWeight: 600, lineHeight: 1.5, textWrap: "balance" }}>{L.faqTitle}</Typography>
            {[[L.checkTitle, L.checkBody], [L.scopeQ, L.scope]].map(([q, a]) => (
              <Box key={q} sx={{ ...divider, pl: { md: 4 } }}>
                <Typography component="h3" sx={{ m: 0, fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.6 }}>{q}</Typography>
                <Typography sx={{ mt: 1, fontSize: "0.9375rem", lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{a}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box component="footer" sx={{ position: "relative", borderTop: 1, borderColor: "divider" }}>
        <Stack sx={{ ...wrap, py: { xs: 5, md: 6 }, flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: { md: "center" }, justifyContent: "space-between" }}>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.6, textWrap: "balance" }}>{L.footer}</Typography>
          <Box>{cta()}</Box>
        </Stack>
      </Box>
    </Box>
  );
}
