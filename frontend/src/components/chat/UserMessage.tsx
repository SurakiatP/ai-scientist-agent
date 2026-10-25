"use client";
import { Box, Typography } from "@mui/material";
import { usePrefs, useT } from "@/lib/prefs";

export const Time = ({ ts }: { ts: number }) => {
  const lang = usePrefs((s) => s.lang);
  return <Typography component="time" dateTime={new Date(ts).toISOString()} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{new Date(ts).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</Typography>;
};

// Round avatar slot shared by user and agent rows so both columns line up.
export const avatarSx = { width: 32, height: 32, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 16%, transparent)", color: "primary.main", border: 1, borderColor: "color-mix(in srgb, var(--mui-palette-primary-main) 30%, transparent)" };

export function UserMessage({ question, createdAt }: { question: string; createdAt: number }) {
  const t = useT();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, px: 0.5 }}>
      <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{t.you}</Box>
      <Box sx={{ maxWidth: "75%", minWidth: 0, bgcolor: "surface.raised", border: 1, borderColor: "divider", borderRadius: "20px 20px 6px 20px", px: 2, py: 1.25 }}>
        <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "1rem" }}>{question}</Typography>
      </Box>
      <Time ts={createdAt} />
    </Box>
  );
}
