"use client";
import { createTheme } from "@mui/material/styles";
import { BG } from "@/lib/config";

declare module "@mui/material/styles" {
  interface Palette {
    evidence: { verified: string; unverified: string; unknown: string };
    surface: { shell: string; raised: string };
  }
  interface PaletteOptions {
    evidence?: { verified: string; unverified: string; unknown: string };
    surface?: { shell: string; raised: string };
  }
}

export const FONT_FAMILY =
  '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

// Arctic Teal. Light + dark both checked for AA in theme.test.ts.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#0A6B6B", contrastText: "#FFFFFF" },
        secondary: { main: "#3F4F55" },
        background: { default: BG.light, paper: "#FFFFFF" },
        text: { primary: "#0B1620", secondary: "#3F4F55" },
        divider: "#E3DED6",
        evidence: { verified: "#0A6B5A", unverified: "#8A5A00", unknown: "#5A6B70" },
        surface: { shell: "#F1EDE6", raised: "#FFFFFF" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#69D8D1", contrastText: "#06201E" },
        secondary: { main: "#9DB0B4" },
        background: { default: BG.dark, paper: "#182B34" },
        text: { primary: "#ECF4F4", secondary: "#9DB0B4" },
        divider: "#2A4350",
        evidence: { verified: "#5FD6B5", unverified: "#E5B44F", unknown: "#9DB0B4" },
        surface: { shell: "#0D151B", raised: "#203845" },
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
    MuiCssBaseline: { styleOverrides: {
      html: { scrollbarColor: "var(--mui-palette-text-secondary) transparent" },
      "::selection": { backgroundColor: "var(--mui-palette-primary-main)", color: "var(--mui-palette-primary-contrastText)" },
      "input, textarea": { caretColor: "var(--mui-palette-primary-main)" },
      ":focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
      "@media (prefers-reduced-motion: reduce)": { "*, *::before, *::after": { animationDuration: "0.001ms !important", animationIterationCount: "1 !important", transitionDuration: "0.001ms !important", scrollBehavior: "auto !important" } },
    } },
  },
});
