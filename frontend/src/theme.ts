"use client";
import { createTheme } from "@mui/material/styles";

// PLACEHOLDER PALETTE - replace with the Figma "customer support chat dashboard" colors; this is the only place colors live.
export const palette = {
  primary: "#4F5BD5",
  primaryDark: "#3B45B0",
  primaryLight: "#E8EAFB",
  onPrimary: "#FFFFFF",
  background: "#F6F7FB",
  surface: "#FFFFFF",
  border: "#E3E6EF",
  textPrimary: "#1F2433",
  textSecondary: "#5B6478",
  success: "#1E7448", // darkened for text use (>= 4.5:1)
  error: "#BE2F3A", // darkened for text use (>= 4.5:1)
};

// Dark tokens, same keys. Not wired to a toggle yet.
export const paletteDark: typeof palette = {
  primary: "#9AA3F7",
  primaryDark: "#7C86EE",
  primaryLight: "#262A4A",
  onPrimary: "#12141C",
  background: "#12141C",
  surface: "#1A1D28",
  border: "#2B3040",
  textPrimary: "#E8EAF2",
  textSecondary: "#A3ABBF",
  success: "#4CC38A",
  error: "#F27A83",
};

export const FONT_FAMILY =
  '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: palette.primary, dark: palette.primaryDark, light: palette.primaryLight, contrastText: palette.onPrimary },
    success: { main: palette.success },
    error: { main: palette.error },
    background: { default: palette.background, paper: palette.surface },
    text: { primary: palette.textPrimary, secondary: palette.textSecondary },
    divider: palette.border,
  },
  shape: { borderRadius: 12 },
  typography: { fontFamily: FONT_FAMILY, button: { textTransform: "none", fontWeight: 600 } },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: `1px solid ${palette.border}` } } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
