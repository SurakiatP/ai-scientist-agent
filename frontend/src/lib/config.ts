// Persisted data stores (chats, files) wait for the sync layer to decide between the shared database and browser-only mode.
// Tests hydrate synchronously, as before.
export const DEFER_HYDRATION = process.env.NODE_ENV !== "test";
export const gate = { writes: !DEFER_HYDRATION }; // false = the shared database is the source of truth: localStorage keeps the old browser data untouched

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// Public origin for link previews (og:url, og:image). Inlined at build. Unset or not http(s) = no preview URLs, never a guessed one.
export const siteUrl = (v?: string) => { try { return v && /^https?:\/\//.test(v) ? new URL(v) : undefined; } catch { return undefined; } };
export const SITE_URL = siteUrl(process.env.NEXT_PUBLIC_SITE_URL);

// Page background per scheme. Plain module (theme.ts is "use client", so a server layout cannot read its values).
export const BG = { light: "#E8EDF4", dark: "#0B1322" };

// Proportions scale (px). One place so shell, chat and panels stay balanced; Gemini-like: quiet sidebar, one narrow reading column.
export const UI = {
  sidebar: 272, aside: 300, asideWide: 460, content: 760, composer: 640, composerHome: 760,
  // 44px targets by default; dense 40px rows only on fine pointers (still above the WCAG 2.2 24px minimum)
  row: { minHeight: 44, "@media (pointer: fine)": { minHeight: 40 } },
} as const;

// Visually hidden but readable by screen readers. MUI `sx` reads width: 1 as 100%, so the size must be in px.
export const srOnly = { position: "absolute", width: "1px", height: "1px", margin: "-1px", padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 } as const;
