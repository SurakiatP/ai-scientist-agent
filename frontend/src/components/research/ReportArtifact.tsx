"use client";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import type { Turn } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { reportSections } from "@/lib/report";
import { ReportActions } from "./ReportActions";

// Structured view of the real answer: its markdown headings and the real identifier-check status of each reference.
export const reportId = (turnId: string) => `report-${turnId.replace(/[^\w-]/g, "")}`;

// Collapsed by default (title, status, one-line summary); the open state lives in the parent so "Create report draft" can expand it.
export function ReportArtifact({ sessionId, turn, open, onToggle }: { sessionId: string; turn: Turn; open: boolean; onToggle: () => void }) {
  const t = useT();
  const refs = turn.answer?.references ?? [];
  const sections = reportSections(turn.answer?.content ?? "", t.reportAnswerSection);
  const pending = refs.filter((r) => r.status !== "verified").length;
  const rows = [
    ...sections.map((s) => ({ key: s.title, title: s.title, note: t.reportParagraphs.replace("{n}", String(s.paragraphs)), ok: true })),
    ...(refs.length ? [{ key: "#refs", title: t.references, note: t.reportRefsTotal.replace("{n}", String(refs.length)), ok: pending === 0, flag: pending ? t.reportPending.replace("{n}", String(pending)) : "" }] : []),
  ];
  return (
    <Box component="section" id={reportId(turn.id)} aria-label={t.reportTitle} sx={{
      mt: 2, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "surface.raised", p: { xs: 1.5, sm: 2 },
      boxShadow: "0 0 0 1px color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent), 0 8px 28px color-mix(in srgb, var(--mui-palette-primary-main) 7%, transparent)",
    }}>
      <Stack direction="row" useFlexGap sx={{ alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
        <DescriptionOutlinedIcon sx={{ color: "primary.main" }} />
        <Typography component="h3" sx={{ fontSize: "1.0625rem", fontWeight: 700 }}>{t.reportTitle}</Typography>
        <Chip size="small" variant="outlined" color={pending ? "warning" : "success"} icon={pending ? <ErrorOutlineRoundedIcon /> : <CheckCircleOutlineRoundedIcon />} label={pending ? t.reportIncomplete : t.reportChecked} />
        <Button id={`${reportId(turn.id)}-toggle`} size="small" color="inherit" aria-expanded={open} aria-controls={`${reportId(turn.id)}-body`} onClick={onToggle}
          endIcon={<ExpandMoreRoundedIcon sx={{ transform: open ? "rotate(180deg)" : "none" }} />} sx={{ ml: "auto", minHeight: 44 }}>{open ? t.reportHide : t.reportShow}</Button>
      </Stack>
      <Typography sx={{ mt: 0.75, fontSize: "0.875rem", color: "text.secondary", overflowWrap: "anywhere", ...(open ? {} : { display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{turn.question}</Typography>
      <Box id={`${reportId(turn.id)}-body`} hidden={!open}>
      <Box component="ul" sx={{ m: 0, mt: 1.5, p: 0, listStyle: "none", border: 1, borderColor: "divider", borderRadius: 2 }}>
        {rows.map((r, i) => (
          <Stack component="li" key={r.key} direction="row" useFlexGap sx={{ alignItems: "center", gap: 1.25, px: 1.5, py: 1, minHeight: 44, borderTop: i ? 1 : 0, borderColor: "divider", flexWrap: "wrap" }}>
            {r.ok ? <CheckCircleOutlineRoundedIcon fontSize="small" sx={{ color: "evidence.verified" }} /> : <ErrorOutlineRoundedIcon fontSize="small" sx={{ color: "evidence.unverified" }} />}
            <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>{r.title}</Typography>
            {"flag" in r && r.flag && <Chip size="small" variant="outlined" color="warning" label={r.flag} />}
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{r.note}</Typography>
          </Stack>
        ))}
      </Box>
      <ReportActions sessionId={sessionId} turn={turn} />
      </Box>
    </Box>
  );
}
