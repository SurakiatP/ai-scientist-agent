"use client";
import { Box, Typography } from "@mui/material";
import { usePrefs, useT } from "@/lib/prefs";

export const Time = ({ ts }: { ts: number }) => {
  const lang = usePrefs((s) => s.lang);
  return <Typography component="time" dateTime={new Date(ts).toISOString()} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{new Date(ts).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</Typography>;
};

export function UserMessage({ question, createdAt }: { question: string; createdAt: number }) {
  const t = useT();
  return (
    <Box sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 3, px: 2, py: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "baseline", mb: 0.5 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>{t.you}</Typography>
        <Time ts={createdAt} />
      </Box>
      <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{question}</Typography>
    </Box>
  );
}
