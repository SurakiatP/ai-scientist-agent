export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// Page background per scheme. Plain module (theme.ts is "use client", so a server layout cannot read its values).
export const BG = { light: "#F5F8F9", dark: "#0F1D26" };
