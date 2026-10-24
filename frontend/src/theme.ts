"use client";
import { createTheme } from "@mui/material/styles";

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

// ponytail: legacy light palette, only for old /ask + /saved pages; delete with them in T3.
export const palette = {
  primary: "#2E6B4F",
  primaryDark: "#245740",
  primaryLight: "#E3EDE4",
  onPrimary: "#F2F8F3",
  background: "#F4F4F0",
  surface: "#FDFDFA",
  surfaceRaised: "#FFFFFF",
  sidebar: "#ECECE5",
  sidebarActive: "#FDFDFA",
  railHover: "#E4E4DC",
  rowStripe: "#FAFAF6",
  border: "#E2E2D9",
  textPrimary: "#23252A",
  textSecondary: "#575B61",
  success: "#0E7268", // evidence / verified (>= 4.5:1)
  error: "#A63B26", // darkened for text use (>= 4.5:1)
  teal: "#0E7268",
  tealLight: "#DDECE8",
  gold: "#A97B12",
  goldLight: "#F3EAD3",
  clay: "#B0451F",
  clayLight: "#F5E4DB",
};

export const FONT_FAMILY =
  '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

// Arctic Teal. Light + dark both checked for AA in theme.test.ts.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#0A6B6B", contrastText: "#FFFFFF" },
        secondary: { main: "#3E5559" },
        background: { default: "#F3F8F8", paper: "#FFFFFF" },
        text: { primary: "#0D1B1E", secondary: "#3E5559" },
        divider: "#D3E1E2",
        evidence: { verified: "#0A6B5A", unverified: "#8A5A00", unknown: "#5A6B70" },
        surface: { shell: "#E8F0F0", raised: "#FFFFFF" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#4DD0C4", contrastText: "#06201E" },
        secondary: { main: "#9DB0B4" },
        background: { default: "#0A1114", paper: "#111C20" },
        text: { primary: "#ECF4F4", secondary: "#9DB0B4" },
        divider: "#223238",
        evidence: { verified: "#5FD6B5", unverified: "#E5B44F", unknown: "#9DB0B4" },
        surface: { shell: "#070D10", raised: "#172429" },
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: FONT_FAMILY },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: "none" } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: "none", fontWeight: 600, minHeight: 44 } } },
    MuiIconButton: { styleOverrides: { root: { minWidth: 44, minHeight: 44 } } },
    MuiCssBaseline: { styleOverrides: { ":focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 } } },
  },
});
