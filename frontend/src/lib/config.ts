export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// Page background per scheme. Plain module (theme.ts is "use client", so a server layout cannot read its values).
export const BG = { light: "#F5F8F9", dark: "#0F1D26" };

// Proportions scale (px). One place so shell, chat and panels stay balanced; Gemini-like: quiet sidebar, one narrow reading column.
export const UI = {
  sidebar: 272, aside: 300, content: 760, composer: 720,
  // 44px targets by default; dense 40px rows only on fine pointers (still above the WCAG 2.2 24px minimum)
  row: { minHeight: 44, "@media (pointer: fine)": { minHeight: 40 } },
} as const;
