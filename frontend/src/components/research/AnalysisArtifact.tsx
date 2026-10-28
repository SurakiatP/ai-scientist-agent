"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Box, Button, Chip, CircularProgress, Stack, Tab, Tabs, Typography } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { ARTIFACT_URL, type Turn, type TurnAnalysis } from "@/lib/chat";
import { API_BASE } from "@/lib/config";
import { useT } from "@/lib/prefs";
import { queueText } from "./ProgressCard";
import type { AnalysisArtifact as AnalysisArtifactItem, AnalysisStep } from "@/lib/sse";
import type { Strings } from "@/lib/strings";

type TabKey = "overview" | "tables" | "charts" | "findings" | "code";
const TABS: TabKey[] = ["overview", "tables", "charts", "findings", "code"];

const STEP_KEYS: Record<AnalysisStep, string[]> = {
  profiling: ["profiling_s", "load_s"],
  writing_script: ["writing_script_s", "writing_s"],
  running: ["running_s", "script_s"],
  repairing: ["repairing_s", "repair_s"],
  storing: ["storing_s", "store_s"],
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function stepSeconds(timings: Record<string, number> | undefined, step: AnalysisStep): number | null {
  for (const key of STEP_KEYS[step]) if (finite(timings?.[key])) return timings![key];
  return null;
}

export function formatSeconds(seconds: number, unit: { minute: string; second: string } = { minute: "min", second: "s" }): string {
  const round = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1);
  if (seconds > 0 && seconds < 0.05) return `<0.1 ${unit.second}`; // never "0.0"
  if (seconds < 60) return `${round(seconds)} ${unit.second}`;
  const m = Math.floor(seconds / 60), s = Math.round((seconds % 60) * 10) / 10;
  return s ? `${m} ${unit.minute} ${round(s)} ${unit.second}` : `${m} ${unit.minute}`;
}

export function formatPercent(n: number): string {
  const value = n === 0 ? "0" : n < 0.01 ? "<0.01" : n.toFixed(2).replace(/\.?0+$/, "");
  return `${value}%`;
}

export function missingPercent(a: TurnAnalysis): number | null {
  const cols = a.quality?.columns_info;
  if (!cols?.length) return null;
  return cols.reduce((sum, c) => sum + c.null_pct, 0) / cols.length;
}

export const artifactHref = (url: string) => (ARTIFACT_URL.test(url) ? API_BASE + url : "");
// Display only (CSV downloads keep the stored values): integers as-is, other numbers max 2 decimals, thousands separators.
export const cellText = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v));
const numericCols = (table: { columns: unknown[]; rows: unknown[][] }) => table.columns.map((_, ci) => { const vals = table.rows.map((r) => r?.[ci]).filter((v) => v !== null && v !== undefined); return vals.length > 0 && vals.every((v) => typeof v === "number"); });
const stepLabel = (s: AnalysisStep, t: Strings) => ({
  profiling: t.analysisStepProfiling, writing_script: t.analysisStepWriting, running: t.analysisStepRunning,
  repairing: t.analysisStepRepairing, storing: t.analysisStepStoring,
}[s]);

function Empty({ children }: { children: React.ReactNode }) {
  return <Typography sx={{ color: "text.secondary", fontSize: "0.875rem", lineHeight: 1.7 }}>{children}</Typography>;
}

function StatusChip({ turn, t }: { turn: Turn; t: Strings }) {
  const status = turn.status;
  const info = status === "running" ? { label: t.analysisRunning, color: "primary" as const }
    : status === "done" ? { label: t.done, color: "success" as const }
    : status === "refused" ? { label: t.analysisRefused, color: "warning" as const }
    : status === "error" ? { label: t.error, color: "error" as const }
    : status === "stopped" ? { label: t.analysisStopped, color: "default" as const }
    : { label: t.analysisInterrupted, color: "warning" as const };
  return (
    <Chip
      size="small" variant="outlined" color={info.color} label={info.label}
      icon={status === "running" ? <CircularProgress size={13} color="inherit" /> : status === "done" ? <CheckRoundedIcon /> : <WarningAmberRoundedIcon />}
      role={status === "running" ? "status" : undefined} aria-live={status === "running" ? "polite" : undefined}
      sx={{ "& .MuiChip-icon": { fontSize: 15 } }}
    />
  );
}

function Steps({ a, turn, t }: { a: TurnAnalysis; turn: Turn; t: Strings }) {
  return (
    <Box>
      <Typography component="h4" sx={{ m: 0, mb: 1, fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary" }}>{t.analysisSteps}</Typography>
      {!a.steps.length ? <Empty>{turn.status === "running" && turn.progress.phase === "waiting" ? queueText(turn.progress, t) : t.analysisNoSteps}</Empty> : (
        <Box component="ol" aria-label={t.analysisSteps} sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1 }}>
          {a.steps.map((step, i) => {
            const last = i === a.steps.length - 1;
            const state = turn.status === "done" || !last ? "done" : turn.status === "running" ? "active" : "idle";
            const seconds = stepSeconds(a.timings, step);
            return (
              <Stack component="li" key={`${step}#${i}`} data-step={step} data-state={state} direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Box sx={{
                  width: 22, height: 22, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
                  border: 1, borderColor: state === "active" ? "primary.main" : "divider",
                  bgcolor: state === "active" ? "color-mix(in srgb, var(--mui-palette-primary-main) 16%, transparent)" : "surface.shell",
                  color: state === "active" ? "primary.main" : "evidence.verified",
                }}>
                  {state === "active" ? <CircularProgress size={12} color="inherit" /> : state === "done" ? <CheckRoundedIcon sx={{ fontSize: 15 }} /> : <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "text.secondary" }} />}
                </Box>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.875rem", lineHeight: 1.5, color: state === "active" ? "primary.main" : "text.primary", fontWeight: state === "active" ? 600 : 400, overflowWrap: "anywhere" }}>
                  {stepLabel(step, t)}
                </Typography>
                {seconds !== null && (
                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {formatSeconds(seconds, { minute: t.analysisMinute, second: t.analysisSecond })}
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

function Quality({ a, t }: { a: TurnAnalysis; t: Strings }) {
  const q = a.quality;
  const missing = missingPercent(a);
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.shell", p: 1.5 }}>
      <Typography component="h4" sx={{ m: 0, fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary" }}>{t.analysisQuality}</Typography>
      {!q ? <Box sx={{ mt: 1 }}><Empty>{t.analysisNoQuality}</Empty></Box> : (
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
            {[{ label: t.analysisRows, value: q.rows.toLocaleString() }, { label: t.analysisColumns, value: q.columns.toLocaleString() }, { label: t.analysisMissing, value: missing === null ? "—" : formatPercent(missing) }].map((m) => (
              <Box key={m.label}>
                <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.4 }}>{m.label}</Typography>
                <Typography sx={{ fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.4, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{m.value}</Typography>
              </Box>
            ))}
          </Box>
          {q.truncated && <Typography sx={{ fontSize: "0.75rem", color: "evidence.unverified", lineHeight: 1.5 }}>{t.analysisTruncated}</Typography>}
          {!!q.columns_info?.length && (
            <Box>
              <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", mb: 0.5 }}>{t.analysisColumnsTitle}</Typography>
              <Box component="ul" aria-label={t.analysisColumnsTitle} sx={{ m: 0, p: 0, listStyle: "none", maxHeight: 168, overflowY: "auto", scrollbarWidth: "thin" }}>
                {q.columns_info.map((c, i) => (
                  <Stack component="li" key={`${c.name}#${i}`} direction="row" sx={{ alignItems: "baseline", gap: 1, py: 0.5, borderTop: i === 0 ? 0 : 1, borderColor: "divider" }}>
                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.75rem", lineHeight: 1.5, overflowWrap: "anywhere" }}>{c.name}</Typography>
                    <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', flexShrink: 0 }}>{c.dtype}</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: c.null_pct > 0 ? "evidence.unverified" : "text.secondary", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatPercent(c.null_pct)}</Typography>
                  </Stack>
                ))}
              </Box>
            </Box>
          )}
        </Stack>
      )}
    </Box>
  );
}

function CsvLinks({ artifacts, t }: { artifacts: AnalysisArtifactItem[]; t: Strings }) {
  const files = artifacts.filter((a) => a.kind === "csv" && artifactHref(a.url));
  if (!files.length) return null;
  return (
    <Box>
      <Typography component="h4" sx={{ m: 0, mb: 0.75, fontSize: "0.8125rem", fontWeight: 700, color: "text.secondary" }}>{t.analysisDownloads}</Typography>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
        {files.map((a) => (
          <Button key={a.id} component="a" href={artifactHref(a.url)} download={a.name} variant="outlined" color="inherit" size="small"
            aria-label={`${t.download} ${a.name}`} sx={{ minHeight: 44, borderColor: "divider", maxWidth: "100%" }}>
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</Box>
          </Button>
        ))}
      </Stack>
    </Box>
  );
}

function Tables({ a, t }: { a: TurnAnalysis; t: Strings }) {
  const tables = a.tables ?? [];
  return (
    <Stack spacing={2}>
      {!tables.length ? <Empty>{t.analysisNoTables}</Empty> : tables.map((table, i) => { const num = numericCols(table); return (
        <Box key={`${table.name}#${i}`}>
          <Stack direction="row" useFlexGap sx={{ alignItems: "baseline", justifyContent: "space-between", gap: 1, mb: 0.75 }}>
            <Typography component="h4" sx={{ m: 0, fontSize: "0.875rem", fontWeight: 700, overflowWrap: "anywhere" }}>{table.name || t.analysisTable}</Typography>
            {table.truncated && <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t.analysisTableTruncated}</Typography>}
          </Stack>
          <Box sx={{ display: { xs: "flex", sm: "none" }, alignItems: "center", mb: 0.5, color: "text.secondary", fontSize: "0.6875rem" }}>{t.tableScroll}</Box>
          <Box sx={{ maxWidth: "100%", overflowX: "auto", border: 1, borderColor: "divider", borderRadius: 1.5, scrollbarWidth: "thin" }}>
            <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8125rem" }}>
              <Box component="thead">
                <Box component="tr">
                  {table.columns.map((c, ci) => (
                    <Box component="th" key={`${c}#${ci}`} scope="col" sx={{ position: "sticky", top: 0, bgcolor: "surface.shell", borderBottom: 1, borderColor: "divider", px: 1.25, py: 1, textAlign: num[ci] ? "right" : "left", fontWeight: 700, whiteSpace: "nowrap" }}>{c}</Box>
                  ))}
                </Box>
              </Box>
              <Box component="tbody">
                {table.rows.map((row, ri) => (
                  <Box component="tr" key={ri} sx={{ "&:nth-of-type(even)": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 4%, transparent)" } }}>
                    {table.columns.map((_, ci) => (
                      <Box component="td" key={ci} sx={{ borderTop: 1, borderColor: "divider", px: 1.25, py: 0.9, verticalAlign: "top", minWidth: 72, textAlign: num[ci] ? "right" : "left", maxWidth: 320, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
                        {cellText(row?.[ci])}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      ); })}
    </Stack>
  );
}

// Overview: first result table (5 rows) beside the first chart, both real backend output.
function Preview({ a, t }: { a: TurnAnalysis; t: Strings }) {
  const table = a.tables?.[0];
  const fig = (a.artifacts ?? []).find((x) => x.kind === "figure" && artifactHref(x.url));
  if (!table && !fig) return null;
  const rows = table?.rows.slice(0, 5) ?? [];
  const num = table ? numericCols(table) : [];
  const head = { fontSize: "0.8125rem", fontWeight: 700, mb: 0.75, overflowWrap: "anywhere" } as const;
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
      {table && (
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h4" sx={head}>{table.name || t.analysisTable}</Typography>
          <Box sx={{ maxWidth: "100%", overflowX: "auto", border: 1, borderColor: "divider", borderRadius: 1.5, scrollbarWidth: "thin" }}>
            <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", fontSize: "0.75rem" }}>
              <Box component="thead"><Box component="tr">
                {table.columns.map((c, ci) => <Box component="th" key={`${c}#${ci}`} scope="col" sx={{ bgcolor: "surface.shell", borderBottom: 1, borderColor: "divider", px: 1, py: 0.75, textAlign: num[ci] ? "right" : "left", fontWeight: 700, whiteSpace: "nowrap" }}>{c}</Box>)}
              </Box></Box>
              <Box component="tbody">
                {rows.map((row, ri) => (
                  <Box component="tr" key={ri}>
                    {table.columns.map((_, ci) => <Box component="td" key={ci} sx={{ borderTop: 1, borderColor: "divider", px: 1, py: 0.6, maxWidth: 200, textAlign: num[ci] ? "right" : "left", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{cellText(row?.[ci])}</Box>)}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
          <Typography sx={{ mt: 0.75, fontSize: "0.75rem", color: "text.secondary" }}>{t.analysisPreviewShown.replace("{n}", String(rows.length))}</Typography>
        </Box>
      )}
      {fig && (
        <Box component="figure" sx={{ m: 0, minWidth: 0 }}>
          <Typography component="h4" sx={head}>{fig.name}</Typography>
          <Box component="img" src={artifactHref(fig.url)} alt={`${t.analysisChartAlt}: ${fig.name}`} loading="lazy" decoding="async"
            sx={{ display: "block", width: "100%", height: "auto", border: 1, borderColor: "divider", borderRadius: 1.5, bgcolor: "background.paper" }} />
        </Box>
      )}
    </Box>
  );
}

function Charts({ a, t }: { a: TurnAnalysis; t: Strings }) {
  const figures = (a.artifacts ?? []).filter((x) => x.kind === "figure" && artifactHref(x.url));
  if (!figures.length) return <Empty>{t.analysisNoCharts}</Empty>;
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 2 }}>
      {figures.map((x) => (
        <Box component="li" key={x.id}>
          <Box component="figure" sx={{ m: 0 }}>
            <Box component="img" src={artifactHref(x.url)} alt={`${t.analysisChartAlt}: ${x.name}`} loading="lazy" decoding="async"
              sx={{ display: "block", width: "100%", height: "auto", border: 1, borderColor: "divider", borderRadius: 1.5, bgcolor: "background.paper" }} />
            <Box component="figcaption" sx={{ mt: 0.75, fontSize: "0.75rem", color: "text.secondary", overflowWrap: "anywhere" }}>{x.name}</Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Findings({ a, t }: { a: TurnAnalysis; t: Strings }) {
  const findings = a.findings ?? [];
  if (!findings.length) return <Empty>{t.analysisNoFindings}</Empty>;
  return (
    <Box component="ul" sx={{ m: 0, pl: 2.5, display: "grid", gap: 1 }}>
      {findings.map((f, i) => (
        <Typography component="li" key={i} sx={{ fontSize: "0.9375rem", lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere", "&::marker": { color: "text.secondary" } }}>{f}</Typography>
      ))}
    </Box>
  );
}

function Code({ a, t }: { a: TurnAnalysis; t: Strings }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!a.script) return <Empty>{t.analysisNoCode}</Empty>;
  const copy = async () => {
    let next: "ok" | "fail" = "ok";
    try { await navigator.clipboard.writeText(a.script ?? ""); } catch { next = "fail"; }
    setCopied(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2000);
  };
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 1 }}>
        <Button variant="outlined" color="inherit" size="small" startIcon={<ContentCopyRoundedIcon />} onClick={copy} sx={{ minHeight: 44, borderColor: "divider" }}>
          {copied === "fail" ? t.copyFailed : copied === "ok" ? t.copied : t.analysisCopyCode}
        </Button>
      </Stack>
      <Box component="pre" tabIndex={0} sx={{
        m: 0, p: 1.5, border: 1, borderColor: "divider", borderRadius: 1.5, bgcolor: "surface.shell",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "0.8125rem", lineHeight: 1.7,
        overflow: "auto", maxHeight: 420, whiteSpace: "pre", overflowWrap: "normal",
      }}>
        <code>{a.script}</code>
      </Box>
    </Box>
  );
}

export function AnalysisArtifact({ turn }: { turn: Turn }) {
  const t = useT();
  const a = turn.analysis;
  const [tab, setTab] = useState<TabKey>("overview");
  const uid = useId();
  if (!a) return null;
  const name = a.fileName?.trim() || t.analysisFile;
  const total = finite(a.timings?.total_s) ? a.timings!.total_s : null;
  const label: Record<TabKey, string> = {
    overview: t.analysisTabOverview, tables: t.analysisTabTables, charts: t.analysisTabCharts,
    findings: t.analysisTabFindings, code: t.analysisTabCode,
  };
  const firstCsv = (a.artifacts ?? []).find((x) => x.kind === "csv" && artifactHref(x.url));
  const panelId = `analysis-${uid}-${tab}-panel`;
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "surface.raised", overflow: "hidden", boxShadow: "0 0 0 1px color-mix(in srgb, var(--mui-palette-primary-main) 18%, transparent), 0 8px 28px color-mix(in srgb, var(--mui-palette-primary-main) 8%, transparent)" }}>
      <Box component="header" sx={{ p: { xs: 1.5, sm: 2 }, borderBottom: 1, borderColor: "divider", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 5%, transparent)" }}>
        <Stack direction="row" useFlexGap sx={{ alignItems: "flex-start", gap: 1.25, flexWrap: "wrap" }}>
          <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 1.5, border: 1, borderColor: "divider", bgcolor: "background.paper", display: "grid", placeItems: "center", color: "primary.main" }}>
            <InsertDriveFileOutlinedIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: "1 1 200px", minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, color: "text.secondary", letterSpacing: "0.03em" }}>{t.analysisResultTitle}</Typography>
            <Typography component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.5, overflowWrap: "anywhere" }}>{name}</Typography>
            <Stack direction="row" useFlexGap sx={{ mt: 0.5, alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <StatusChip turn={turn} t={t} />
              {total !== null && (
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{t.elapsed} {formatSeconds(total, { minute: t.analysisMinute, second: t.analysisSecond })}</Typography>
              )}
            </Stack>
          </Box>
          {firstCsv && (
            <Button component="a" href={artifactHref(firstCsv.url)} download={firstCsv.name} variant="outlined" color="primary" startIcon={<FileDownloadOutlinedIcon />}
              aria-label={`${t.analysisDownloadResult}: ${firstCsv.name}`} sx={{ minHeight: 44, flexShrink: 0, alignSelf: "center" }}>
              {t.analysisDownloadResult}
            </Button>
          )}
        </Stack>
      </Box>

      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} variant="scrollable" allowScrollButtonsMobile aria-label={t.analysisTabs}
        sx={{ px: 1, minHeight: 48, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 48, textTransform: "none", fontWeight: 600, fontSize: "0.8125rem" } }}>
        {TABS.map((k) => <Tab key={k} value={k} label={label[k]} id={`analysis-${uid}-${k}-tab`} aria-controls={k === tab ? panelId : undefined} />)}
      </Tabs>

      <Box role="tabpanel" id={panelId} aria-labelledby={`analysis-${uid}-${tab}-tab`} sx={{ p: { xs: 1.5, sm: 2 } }}>
        {tab === "overview" && (
          <Stack spacing={2.5}>
            <Preview a={a} t={t} />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", alignItems: "start" }}>
              <Steps a={a} turn={turn} t={t} />
              <Quality a={a} t={t} />
            </Box>
            <CsvLinks artifacts={a.artifacts ?? []} t={t} />
          </Stack>
        )}
        {tab === "tables" && <Tables a={a} t={t} />}
        {tab === "charts" && <Charts a={a} t={t} />}
        {tab === "findings" && <Findings a={a} t={t} />}
        {tab === "code" && <Code a={a} t={t} />}
      </Box>
    </Box>
  );
}
