"use client";
import { createTheme } from "@mui/material/styles";

// Placeholder palette (Figma file not accessible). Swap values here only.
export const palette = {
  primary: "#4F5BD5",
  primaryDark: "#3B45B0",
  primaryLight: "#E8EAFB",
  background: "#F6F7FB",
  surface: "#FFFFFF",
  border: "#E3E6EF",
  textPrimary: "#1F2433",
  textSecondary: "#5B6478",
  success: "#2E9E6B",
  error: "#D64550",
};

export const FONT_FAMILY =
  '"Noto Sans Thai", "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

export const theme = createTheme({
  cssVariables: true,
  palette: {
    primary: { main: palette.primary, dark: palette.primaryDark, light: palette.primaryLight },
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
