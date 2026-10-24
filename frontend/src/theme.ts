"use client";
import { createTheme } from "@mui/material/styles";

// Quiet-green research workspace. Fern is the action colour, teal speaks for
// evidence/AI, gold marks notes, clay only ever warns. Hairline borders, near-zero
// shadows, squared 6px geometry. This is the only place colours live.
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

// Dark tokens, same keys. Not wired to a toggle yet.
export const paletteDark: typeof palette = {
  primary: "#55B285",
  primaryDark: "#6CC298",
  primaryLight: "#1B2F25",
  onPrimary: "#101713",
  background: "#17181B",
  surface: "#1E2024",
  surfaceRaised: "#24262B",
  sidebar: "#121316",
  sidebarActive: "#1E2024",
  railHover: "#2A2C31",
  rowStripe: "#1B1D21",
  border: "#2E3036",
  textPrimary: "#ECEDEA",
  textSecondary: "#A9ACB1",
  success: "#64C5B9",
  error: "#F08A5C",
  teal: "#64C5B9",
  tealLight: "#16302C",
  gold: "#DDB55F",
  goldLight: "#322B1B",
  clay: "#F5A07A",
  clayLight: "#35211A",
};

export const FONT_FAMILY =
  '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

const hairline = `1px solid ${palette.border}`;

export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: palette.primary, dark: palette.primaryDark, light: palette.primaryLight, contrastText: palette.onPrimary },
    secondary: { main: palette.teal, dark: palette.primaryDark, light: palette.tealLight, contrastText: palette.onPrimary },
    success: { main: palette.success, light: palette.tealLight },
    warning: { main: palette.clay, light: palette.clayLight },
    error: { main: palette.error, light: palette.clayLight },
    background: { default: palette.background, paper: palette.surface },
    text: { primary: palette.textPrimary, secondary: palette.textSecondary },
    divider: palette.border,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: FONT_FAMILY,
    h1: { fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.3 },
    h2: { fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.35 },
    h3: { fontWeight: 700, lineHeight: 1.4 },
    h4: { fontWeight: 700, lineHeight: 1.4 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "::selection": { backgroundColor: palette.primaryLight, color: palette.textPrimary },
        "*": { scrollbarWidth: "thin", scrollbarColor: `${palette.border} transparent` },
        "::-webkit-scrollbar": { width: 10, height: 10 },
        "::-webkit-scrollbar-thumb": { backgroundColor: palette.border, borderRadius: 8, border: `2px solid ${palette.background}` },
        "::-webkit-scrollbar-track": { background: "transparent" },
        ":focus-visible": { outline: `2px solid ${palette.primary}`, outlineOffset: 2 },
        "input, textarea": { caretColor: palette.primary },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { border: hairline, backgroundImage: "none" },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, paddingInline: 16, minHeight: 44, fontWeight: 600 },
        sizeLarge: { minHeight: 46, paddingInline: 20, fontSize: "0.9375rem" },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, fontWeight: 500 },
        sizeSmall: { height: 24, fontSize: "0.75rem" },
        outlined: { borderColor: palette.border, backgroundColor: palette.surfaceRaised },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, minHeight: 44, fontSize: "0.9375rem" },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2, borderRadius: 2 },
        root: { minHeight: 44 },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          border: hairline,
          borderRadius: 8,
          backgroundImage: "none",
          "&::before": { display: "none" },
          "&.Mui-expanded": { margin: 0 },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 6, border: hairline },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 10, border: hairline },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 4, fontSize: "0.75rem", paddingInline: 8, paddingBlock: 4 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 6, minWidth: 44, minHeight: 44 },
      },
    },
  },
});
