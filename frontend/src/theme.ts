"use client";
import { createTheme } from "@mui/material/styles";
import { BG } from "@/lib/config";

declare module "@mui/material/styles" {
  interface Palette {
    evidence: { verified: string; unverified: string; unknown: string };
    surface: { shell: string; raised: string; ai: string; aiSoft: string };
  }
  interface PaletteOptions {
    evidence?: { verified: string; unverified: string; unknown: string };
    surface?: { shell: string; raised: string; ai: string; aiSoft: string };
  }
}

export const FONT_FAMILY =
  '"Noto Sans Thai Looped", "Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

// Ink Navy on blue-grey paper (a government-document desk: cool paper, navy ink, a violet mark for what the AI did).
// Light + dark both checked for AA in theme.test.ts.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#1C4E8F", dark: "#143B6E", contrastText: "#FFFFFF" },
        secondary: { main: "#4A5B72" },
        background: { default: BG.light, paper: "#FFFFFF" },
        text: { primary: "#0E1A2C", secondary: "#475670" },
        divider: "#D3DCE8",
        evidence: { verified: "#0A6B5A", unverified: "#8A5A00", unknown: "#566579" },
        surface: { shell: "#F4F6FA", raised: "#FFFFFF", ai: "#5B4CC4", aiSoft: "#E3E1F7" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#8DB5F2", dark: "#6E9BE0", contrastText: "#0A1B33" },
        secondary: { main: "#9AA9BE" },
        background: { default: BG.dark, paper: "#121C2E" },
        text: { primary: "#E9EEF7", secondary: "#9DABC0" },
        divider: "#24324A",
        evidence: { verified: "#5FD6B5", unverified: "#E5B44F", unknown: "#9DABC0" },
        surface: { shell: "#0E1727", raised: "#1A2639", ai: "#B3A9F5", aiSoft: "#2A2650" },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: FONT_FAMILY, button: { textTransform: "none", fontWeight: 600 } },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 44 } } },
    MuiButtonBase: { styleOverrides: { root: { "&.Mui-focusVisible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 } } } }, // MUI sets outline:0, which beats the global :focus-visible rule
    MuiMenuItem: { styleOverrides: { root: { "&.Mui-focusVisible": { outlineOffset: -2 } } } }, // menu paper clips an outside ring
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: "var(--mui-palette-text-primary)", color: "var(--mui-palette-background-paper)", fontSize: "0.75rem", lineHeight: 1.5, padding: "6px 10px", borderRadius: 8 } } }, // navy ink instead of MUI's stock grey
    MuiMenu: { styleOverrides: { paper: { marginTop: 4, borderRadius: 12, border: "1px solid var(--mui-palette-divider)", boxShadow: "0 16px 40px -12px rgb(14 26 44 / 0.3), 0 2px 6px rgb(14 26 44 / 0.06)" } } }, // same paper as landing/Dropdown
    MuiBackdrop: { styleOverrides: { root: { "&:not(.MuiBackdrop-invisible)": { backgroundColor: "rgb(14 26 44 / 0.45)" } } } }, // navy scrim; menus and popovers use the invisible one
    MuiCssBaseline: { styleOverrides: {
      "@property --aurora": { syntax: "'<angle>'", inherits: "false", initialValue: "0deg" }, // the home composer's light (Composer.tsx)
      html: { scrollbarColor: "var(--mui-palette-text-secondary) transparent" },
      "::selection": { backgroundColor: "var(--mui-palette-primary-main)", color: "var(--mui-palette-primary-contrastText)" },
      "input, textarea": { caretColor: "var(--mui-palette-primary-main)" },
      ":focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
      "@media (prefers-reduced-motion: reduce)": { "*, *::before, *::after": { animationDuration: "0.001ms !important", animationIterationCount: "1 !important", transitionDuration: "0.001ms !important", transitionDelay: "0s !important", animationDelay: "0s !important", scrollBehavior: "auto !important" } },
    } },
  },
});
