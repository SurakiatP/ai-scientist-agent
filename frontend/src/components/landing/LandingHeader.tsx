"use client";
import Link from "next/link";
import { Box, Button, IconButton, Menu, MenuItem, Stack, Typography, useColorScheme } from "@mui/material";
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

export const gutter = { xs: 2, sm: 4, lg: 6 };
export const wrap = { maxWidth: 1320, mx: "auto", px: gutter };
export const ring = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } };

export type NavKey = "product" | "how" | "faq" | "docs";
const MODES = ["light", "dark", "system"] as const;
const ICON = { light: LightModeOutlinedIcon, dark: DarkModeOutlinedIcon, system: SettingsBrightnessOutlinedIcon };
const link = (on: boolean) => ({
  display: "inline-flex", alignItems: "center", gap: 0.75, minHeight: 40, px: 1.5, borderRadius: 2, textDecoration: "none", fontSize: "0.9375rem", fontWeight: 500, whiteSpace: "nowrap",
  color: on ? "primary.main" : "text.secondary", bgcolor: on ? "rgb(var(--mui-palette-primary-mainChannel) / 0.1)" : "transparent",
  transition: "background-color 160ms ease-out, color 160ms ease-out", "&:hover": { color: "primary.main", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.1)" }, ...ring,
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
      <Box key={m} component="span" sx={{ display: "grid", "@media (prefers-reduced-motion: no-preference)": { animation: "theme-turn 360ms cubic-bezier(0.22, 1, 0.36, 1) both", "@keyframes theme-turn": { from: { transform: "rotate(-90deg) scale(0.6)" }, to: { transform: "none" } } } }}><Icon sx={{ fontSize: 20 }} /></Box>
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
        {L.navProduct}<KeyboardArrowDownRoundedIcon sx={{ fontSize: 18, transition: "transform 200ms ease-out", transform: el ? "rotate(180deg)" : "none" }} />
      </Box>
      <Menu anchorEl={el} open={!!el} onClose={() => setEl(null)} anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }} transitionDuration={{ enter: 200, exit: 120 }}
        slotProps={{ list: { "aria-label": L.navProduct, sx: { p: 0.75, display: "grid", gap: 0.25 } }, paper: { sx: { mt: 1, width: 320, maxWidth: "calc(100vw - 32px)", borderRadius: 3.5, border: 1, borderColor: "divider", bgcolor: "background.paper", backgroundImage: "none", boxShadow: "0 16px 40px -12px rgba(11, 22, 32, 0.3), 0 2px 6px rgba(11, 22, 32, 0.06)" } } }}>
        {featureSlugs.map((slug) => (
          <MenuItem key={slug} component={Link} href={`/features/${slug}`} onClick={() => setEl(null)} sx={{ display: "grid", gap: 0.25, py: 1.25, px: 1.5, borderRadius: 2.5, whiteSpace: "normal", "&:hover": { bgcolor: "action.hover" } }}>
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
    <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 10, borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
      <Stack direction="row" component="nav" aria-label={L.navLabel} sx={{ ...wrap, minHeight: 56, py: 1, alignItems: "center", gap: { xs: 0.5, md: 1 } }}>
        <Box component={Link} href="/" aria-label={L.brand} sx={{ display: "flex", alignItems: "center", gap: 1, textDecoration: "none", color: "text.primary", minHeight: 44, borderRadius: 2, mr: { xs: 0.5, md: 2 }, ...ring }}>
          <Box aria-hidden="true" sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}><LogoMark size={22} /></Box>
          <Typography component="span" noWrap sx={{ display: { xs: "none", sm: "block" }, fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.4 }}>{L.brand}</Typography>
        </Box>
        <Stack direction="row" sx={{ display: { xs: "none", md: "flex" }, flex: 1, justifyContent: "center", gap: 0.5 }}>
          <ProductMenu L={L} on={active === "product"} />
          <Box component={Link} href="/how-it-works" aria-current={active === "how" ? "page" : undefined} sx={link(active === "how")}>{L.navHow}</Box>
          <Box component={Link} href="/faq" aria-current={active === "faq" ? "page" : undefined} sx={link(active === "faq")}>{L.navCheck}</Box>
          <Box component={Link} href="/docs" aria-current={active === "docs" ? "page" : undefined} sx={link(active === "docs")}><MenuBookOutlinedIcon sx={{ fontSize: 18 }} />{L.navDocs}</Box>
        </Stack>
        <Box sx={{ ml: { xs: "auto", md: 0 } }}><ThemeButton L={L} /></Box>
        <Segmented compact square label={L.langLabel} value={lang} onChange={setLang} options={[{ value: "th", label: "ไทย" }, { value: "en", label: "English", short: "EN" }]} />
        <Box sx={{ display: { xs: "none", md: "block" }, ml: 1 }}>
          <Button component={Link} href="/chat" variant="contained" sx={{ minHeight: 36, px: 2, borderRadius: 2, fontSize: "0.875rem", whiteSpace: "nowrap", ...ring }}>{L.cta}</Button>
        </Box>
        <Box sx={{ display: { xs: "block", md: "none" } }}>
          <Dropdown ariaLabel={L.menu} icon={<MenuRoundedIcon />} items={menu} sx={{ minWidth: 44, px: 1 }} />
        </Box>
      </Stack>
    </Box>
  );
}

