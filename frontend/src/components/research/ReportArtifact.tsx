"use client";
import { Box, Button, Chip, Typography } from "@mui/material";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import type { Turn } from "@/lib/chat";
import { docTitle, useReportPanel } from "@/lib/exportReport";
import { usePrefs, useT } from "@/lib/prefs";

export const reportId = (turnId: string) => `report-${turnId.replace(/[^\w-]/g, "")}`;

// One compact card in the thread (icon, title, status, date). The document itself lives in the right-hand report panel.
export function ReportArtifact({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const open = useReportPanel((s) => s.open);
  const isOpen = useReportPanel((s) => s.ref?.turnId === turn.id && s.ref.sessionId === sessionId);
  const pending = (turn.answer?.references ?? []).filter((r) => r.status !== "verified").length;
  return (
    <Box component="section" id={reportId(turn.id)} aria-label={t.reportTitle} sx={{
      mt: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", border: 1, borderColor: isOpen ? "primary.main" : "divider", borderRadius: 3, bgcolor: "surface.raised", px: 2, py: 1.25,
      boxShadow: "0 0 0 1px color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent), 0 8px 28px color-mix(in srgb, var(--mui-palette-primary-main) 7%, transparent)",
    }}>
      <DescriptionOutlinedIcon aria-hidden sx={{ color: "primary.main" }} />
      <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
        <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{docTitle(turn)}</Typography>
        <Typography component="time" dateTime={new Date(turn.createdAt).toISOString()} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
          {new Date(turn.createdAt).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })}
        </Typography>
      </Box>
      <Chip size="small" variant="outlined" color={pending ? "warning" : "success"} icon={pending ? <ErrorOutlineRoundedIcon /> : <CheckCircleOutlineRoundedIcon />} label={pending ? t.reportIncomplete : t.reportChecked} />
      <Button id={`${reportId(turn.id)}-toggle`} variant="outlined" aria-pressed={isOpen} onClick={() => open(sessionId, turn.id)} sx={{ minHeight: 44 }}>{t.rpOpen}</Button>
    </Box>
  );
}
