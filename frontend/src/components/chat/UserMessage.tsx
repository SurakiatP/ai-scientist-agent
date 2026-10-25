"use client";
import { Box, Typography } from "@mui/material";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
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
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", px: 0.5 }}>
      <Box aria-hidden sx={avatarSx}><PersonOutlineRoundedIcon /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "baseline", mb: 0.25 }}>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{t.you}</Typography>
          <Time ts={createdAt} />
        </Box>
        <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "1rem" }}>{question}</Typography>
      </Box>
    </Box>
  );
}
