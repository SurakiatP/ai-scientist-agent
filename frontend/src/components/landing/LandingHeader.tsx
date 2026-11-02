"use client";
import Link from "next/link";
import { Box, Button, IconButton, Menu, MenuItem, Stack, Typography, useColorScheme } from "@mui/material";
import NorthEastRoundedIcon from "@mui/icons-material/NorthEastRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";
import { useState } from "react";
import { Dropdown, LogoMark, type DropItem } from "@/components/landing/Dropdown";
import { Segmented } from "@/components/settings/Segmented";
import { useHydrated } from "@/lib/history";
import { usePrefs } from "@/lib/prefs";
import { featureSlugs, landing, sitePages } from "@/lib/strings";
import { dur, ease, easing } from "@/lib/motion";

export const gutter = { xs: 2, sm: 4, lg: 6 };
export const wrap = { maxWidth: 1320, mx: "auto", px: gutter };
export const ring = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } };
// Soft lifted depth: a long, low navy-tinted blur plus a tight contact shadow. Used by every floating surface of the site.
export const lift = "0 24px 48px -28px rgb(28 78 143 / 0.35), 0 2px 8px -2px rgb(14 26 44 / 0.06)";
// The primary pill: navy fill, the arrow in its own lighter circle (pressed: the circle slides a step).
export function ArrowPill({ href, children, big }: { href: string; children: React.ReactNode; big?: boolean }) {
  return (
    <Button component={Link} href={href} variant="contained"
      endIcon={<Box component="span" aria-hidden="true" className="pill-arrow" sx={{ display: "grid", placeItems: "center", width: big ? 30 : 24, height: big ? 30 : 24, borderRadius: "50%", bgcolor: "rgb(255 255 255 / 0.16)", transition: `transform ${dur.fast}ms ${ease}` }}><NorthEastRoundedIcon sx={{ fontSize: big ? 16 : 14 }} /></Box>}
      sx={{ minHeight: big ? 52 : 38, pl: big ? 3 : 2, pr: big ? 1.25 : 0.75, borderRadius: 999, fontSize: big ? "1rem" : "0.875rem", whiteSpace: "nowrap", boxShadow: "0 10px 24px -12px rgb(28 78 143 / 0.7), inset 0 1px 0 rgb(255 255 255 / 0.18)", "& .MuiButton-endIcon": { ml: 1.25, mr: 0 }, "&:hover": { bgcolor: "primary.dark", boxShadow: "0 12px 28px -12px rgb(28 78 143 / 0.8), inset 0 1px 0 rgb(255 255 255 / 0.18)", "& .pill-arrow": { transform: "translate(2px, -2px)" } }, ...ring }}>
      {children}
    </Button>
  );
}

export type NavKey = "product" | "how" | "faq" | "docs";
const MODES = ["light", "dark", "system"] as const;
const ICON = { light: LightModeOutlinedIcon, dark: DarkModeOutlinedIcon, system: SettingsBrightnessOutlinedIcon };
const link = (on: boolean) => ({
  display: "inline-flex", alignItems: "center", gap: 0.75, minHeight: 40, px: 1.5, borderRadius: 2, textDecoration: "none", fontSize: "0.9375rem", fontWeight: 500, whiteSpace: "nowrap",
  color: on ? "primary.main" : "text.secondary", bgcolor: on ? "rgb(var(--mui-palette-primary-mainChannel) / 0.1)" : "transparent",
  transition: `background-color ${dur.quick}ms ${ease}, color ${dur.quick}ms ${ease}`, "&:hover": { color: "primary.main", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.1)" }, ...ring,
}) as const;

// One press changes the theme to the next of light, dark, system. The icon turns in; nothing opens.
function ThemeButton({ L }: { L: (typeof landing)["th"] | (typeof landing)["en"] }) {
  const hydrated = useHydrated();
  const { mode, setMode } = useColorScheme();
  const m = hydrated ? mode ?? "system" : "system";
  const Icon = ICON[m as keyof typeof ICON];
  const name = { light: L.themeLight, dark: L.themeDark, system: L.themeSystem }[m as "light"];
  return (
    <IconButton onClick={() => setMode(MODES[(MODES.indexOf(m as "light") + 1) % 3])} aria-label={`${L.themeLabel}: ${name}`} title={`${L.themeLabel}: ${name} · ${L.themeNext}`}
      sx={{ width: 40, height: 40, borderRadius: 2, color: "text.primary", "&:hover": { bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.1)", color: "primary.main" }, ...ring }}>
      <Box key={m} component="span" sx={{ display: "grid", "@media (prefers-reduced-motion: no-preference)": { animation: `theme-turn ${dur.fast}ms ${easing.inOut} both`, "@keyframes theme-turn": { from: { transform: "rotate(-90deg) scale(0.6)" }, to: { transform: "none" } } } }}><Icon sx={{ fontSize: 20 }} /></Box>
    </IconButton>
  );
}

// "Product" opens a short list of pages, each with a one-line description.
function ProductMenu({ L, on }: { L: (typeof landing)["th"] | (typeof landing)["en"]; on: boolean }) {
  const lang = usePrefs((s) => s.lang), hydrated = useHydrated();
  const f = sitePages[hydrated ? lang : "th"].features;
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <Box component="button" type="button" aria-haspopup="menu" aria-expanded={el ? "true" : undefined} onClick={(e) => setEl(e.currentTarget)} sx={{ ...link(on || !!el), border: 0, font: "inherit", fontSize: "0.9375rem", fontWeight: 500, cursor: "pointer" }}>
        {L.navProduct}<KeyboardArrowDownRoundedIcon sx={{ fontSize: 18, transition: `transform ${dur.fast}ms ${ease}`, transform: el ? "rotate(180deg)" : "none" }} />
      </Box>
      <Menu anchorEl={el} open={!!el} onClose={() => setEl(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }} transitionDuration={{ enter: dur.fast, exit: dur.quick }}
        slotProps={{ list: { "aria-label": L.navProduct, sx: { p: 0.75, display: "grid", gap: 0.25 } }, paper: { sx: { mt: 1, width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "background.paper", backgroundImage: "none", boxShadow: "0 16px 40px -12px rgb(14 26 44 / 0.3), 0 2px 6px rgb(14 26 44 / 0.06)" } } }}>
        {featureSlugs.map((slug) => (
          <MenuItem key={slug} component={Link} href={`/features/${slug}`} onClick={() => setEl(null)} sx={{ display: "grid", gap: 0.25, py: 1.25, px: 1.5, borderRadius: "10px", whiteSpace: "normal", "&:hover": { bgcolor: "action.hover" } }}>
            <Typography component="span" sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>{f[slug].tab}</Typography>
            <Typography component="span" sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>{f[slug].blurb}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

// The public header: brand, centred page links, theme (push to change), language, and the way in. No login.
export function LandingHeader({ active }: { active?: NavKey }) {
  const hydrated = useHydrated();
  const prefLang = usePrefs((s) => s.lang), setLang = usePrefs((s) => s.setLang);
  const lang = hydrated ? prefLang : "th";
  const L = landing[lang];
  const f = sitePages[lang].features;
  const menu: DropItem[] = [
    ...featureSlugs.map((s) => ({ value: s, label: f[s].tab, href: `/features/${s}` })),
    { value: "how", label: L.navHow, href: "/how-it-works" },
    { value: "faq", label: L.navCheck, href: "/faq" },
    { value: "docs", label: L.navDocs, href: "/docs", chip: L.soon },
  ];
  return (
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, px: gutter, pt: { xs: 1, md: 1.5 } }}>
      {/* a floating bar, not a full-width band: it sits on the paper like a card and lets the page show around it */}
      <Stack direction="row" component="nav" aria-label={L.navLabel} sx={{ maxWidth: 1080, mx: "auto", minHeight: 56, py: 0.75, pl: { xs: 1.25, md: 2 }, pr: 0.75, alignItems: "center", gap: { xs: 0.5, md: 1 }, borderRadius: "18px", border: 1, borderColor: "color-mix(in srgb, var(--mui-palette-divider) 70%, transparent)", bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 82%, transparent)", backdropFilter: "saturate(1.4) blur(14px)", boxShadow: lift }}>
        <Box component={Link} href="/" aria-label={L.brand} sx={{ display: "flex", alignItems: "center", gap: 1, textDecoration: "none", color: "text.primary", minHeight: 44, borderRadius: 2, mr: { xs: 0.5, md: 2 }, ...ring }}>
          <Box aria-hidden="true" sx={{ width: 30, height: 30, flexShrink: 0, borderRadius: "8px", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}><LogoMark size={20} /></Box>
          <Typography component="span" noWrap sx={{ display: { xs: "none", sm: "block" }, fontSize: "1rem", fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.01em" }}>{L.brand}</Typography>
        </Box>
        <Stack direction="row" sx={{ display: { xs: "none", md: "flex" }, flex: 1, justifyContent: "flex-start", gap: 0.25 }}>
          <ProductMenu L={L} on={active === "product"} />
          <Box component={Link} href="/how-it-works" aria-current={active === "how" ? "page" : undefined} sx={link(active === "how")}>{L.navHow}</Box>
          <Box component={Link} href="/faq" aria-current={active === "faq" ? "page" : undefined} sx={link(active === "faq")}>{L.navCheck}</Box>
          <Box component={Link} href="/docs" aria-current={active === "docs" ? "page" : undefined} sx={link(active === "docs")}><MenuBookOutlinedIcon sx={{ fontSize: 18 }} />{L.navDocs}</Box>
        </Stack>
        <Box sx={{ ml: { xs: "auto", md: 0 } }}><ThemeButton L={L} /></Box>
        <Segmented compact square label={L.langLabel} value={lang} onChange={setLang} options={[{ value: "th", label: "ไทย" }, { value: "en", label: "English", short: "EN" }]} />
        <Box sx={{ display: { xs: "none", md: "block" }, ml: 1 }}>
          <ArrowPill href="/chat">{L.cta}</ArrowPill>
        </Box>
        <Box sx={{ display: { xs: "block", md: "none" } }}>
          <Dropdown ariaLabel={L.menu} icon={<MenuRoundedIcon />} items={menu} sx={{ minWidth: 44, px: 1 }} />
        </Box>
      </Stack>
    </Box>
  );
}

