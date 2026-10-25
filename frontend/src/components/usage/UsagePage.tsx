"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useHydrated } from "@/lib/history";
import { skeletonBar } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { storeCall, useSync } from "@/lib/sync";

type Mode = { count: number; p50_seconds: number | null; p95_seconds: number | null; avg_prompt_tokens: number | null; avg_completion_tokens: number | null; avg_cost_usd: number | null; ok_rate: number | null };
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseUsage(b: Record<string, unknown>): [string, Mode][] {
  const m = b.modes;
  if (!m || typeof m !== "object") return [];
  return Object.entries(m as Record<string, Record<string, unknown>>).slice(0, 10).map(([k, v]) => [k, {
    count: num(v?.count) ?? 0, p50_seconds: num(v?.p50_seconds), p95_seconds: num(v?.p95_seconds), avg_prompt_tokens: num(v?.avg_prompt_tokens),
    avg_completion_tokens: num(v?.avg_completion_tokens), avg_cost_usd: num(v?.avg_cost_usd), ok_rate: num(v?.ok_rate),
  }]);
}

// A plain CSS bar: width is the real ratio, the number is always printed next to it.
const Bar = ({ ratio }: { ratio: number }) => (
  <Box aria-hidden sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}>
    <Box sx={{ height: "100%", width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`, bgcolor: "primary.main", borderRadius: 3 }} />
  </Box>
);

export function UsagePage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const hydrated = useHydrated();
  const status = useSync((s) => s.status);
  const [days, setDays] = useState<7 | 30>(7);
  const [rows, setRows] = useState<[string, Mode][] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const off = hydrated && status === "disabled";
  const load = useCallback(async (d: number) => {
    setState("loading");
    try { setRows(parseUsage(await storeCall("GET", `/v1/usage/summary?days=${d}`))); setState("ok"); } catch { setState("error"); }
  }, []);
  useEffect(() => { if (hydrated && status !== "disabled" && status !== "connecting") void load(days); }, [hydrated, status, days, load]); // eslint-disable-line react-hooks/set-state-in-effect -- fetch when the period or sync state changes

  const nf = (v: number | null, d = 1) => (v === null ? "-" : v.toLocaleString(lang === "th" ? "th-TH" : "en-GB", { maximumFractionDigits: d }));
  const label = (k: string) => ({ deep: t.modeDeep, quick: t.modeQuick, chat: t.modeChat, analysis: t.usageModeAnalysis, plan: t.usageModePlan } as Record<string, string>)[k] ?? k;
  const max = Math.max(1, ...(rows ?? []).map(([, m]) => m.count));
  const row = (name: string, value: string) => <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}><Box component="dt" sx={{ color: "text.secondary" }}>{name}</Box><Box component="dd" sx={{ m: 0, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{value}</Box></Box>;

  return (
    <Box component="main" id="main" sx={{ maxWidth: 1000, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, md: 3 } }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2.5 }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography component="h1" sx={{ fontSize: "1.5rem", fontWeight: 700 }}>{t.usageTitle}</Typography>
          <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: "0.9375rem" }}>{t.usageNote}</Typography>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={days} aria-label={t.usageRange} onChange={(_, v) => { if (v) setDays(v); }}>
          <ToggleButton value={7} sx={{ minHeight: 44, px: 2 }}>{t.usageDays7}</ToggleButton>
          <ToggleButton value={30} sx={{ minHeight: 44, px: 2 }}>{t.usageDays30}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {off ? <Typography role="status" sx={{ py: 4, textAlign: "center", color: "text.secondary", border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 3 }}>{t.usageOff}</Typography>
        : state === "error" ? <Alert severity="error" variant="outlined" action={<Button color="inherit" onClick={() => void load(days)} sx={{ minHeight: 44 }}>{t.retry}</Button>}>{t.usageError}</Alert>
        : state === "loading" || !hydrated ? (
          <Box role="status" aria-label={t.usageLoading} sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
            {[0, 1].map((i) => <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, display: "grid", gap: 1.25 }}>{[70, 40, 55, 45].map((w, j) => <Box key={j} sx={{ ...skeletonBar(i + j), width: `${w}%` }} />)}</Box>)}
          </Box>
        ) : !rows?.length ? <Typography role="status" sx={{ py: 4, textAlign: "center", color: "text.secondary", border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 3 }}>{t.usageEmpty}</Typography>
        : (
          <Box component="ul" aria-label={t.usageTitle} sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } }}>
            {rows.map(([k, m]) => (
              <Box component="li" key={k} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, bgcolor: "background.paper", display: "grid", gap: 1.25 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                  <Typography component="h2" sx={{ fontSize: "1rem", fontWeight: 700 }}>{label(k)}</Typography>
                  <Typography sx={{ fontVariantNumeric: "tabular-nums", color: "text.secondary", fontSize: "0.875rem" }}>{`${nf(m.count, 0)} ${t.usageCount}`}</Typography>
                </Box>
                <Bar ratio={m.count / max} />
                <Box component="dl" sx={{ m: 0, display: "grid", gap: 0.5, fontSize: "0.875rem" }}>
                  {row(t.usageP50, m.p50_seconds === null ? "-" : `${nf(m.p50_seconds)} ${t.usageSeconds}`)}
                  {row(t.usageP95, m.p95_seconds === null ? "-" : `${nf(m.p95_seconds)} ${t.usageSeconds}`)}
                  {row(t.usageTokens, m.avg_prompt_tokens === null && m.avg_completion_tokens === null ? "-" : `${nf(m.avg_prompt_tokens, 0)} / ${nf(m.avg_completion_tokens, 0)}`)}
                  {row(t.usageCost, m.avg_cost_usd === null ? "-" : nf(m.avg_cost_usd, 4))}
                  {row(t.usageOk, m.ok_rate === null ? "-" : `${nf(m.ok_rate * 100, 0)}%`)}
                </Box>
                {m.ok_rate !== null && <Bar ratio={m.ok_rate} />}
              </Box>
            ))}
          </Box>
        )}
    </Box>
  );
}
