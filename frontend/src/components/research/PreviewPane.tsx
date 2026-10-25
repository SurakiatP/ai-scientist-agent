"use client";
import { srOnly } from "@/lib/config";
import { Alert, Box, Button, Link, Stack, Typography } from "@mui/material";
import { enterFade, skeletonBar } from "@/lib/motion";
import type { PreviewError, usePreview } from "@/lib/preview";
import { useT } from "@/lib/prefs";
import type { Strings } from "@/lib/strings";

const LINES = ["96%", "90%", "94%", "72%", "92%", "88%", "46%", "94%", "86%", "60%"]; // presentational, not a prediction of the text
const errKey: Record<PreviewError, keyof Strings> = { "429": "pvErr429", "422": "pvErr422", "503": "pvErr503", net: "pvErrNet", other: "pvErrOther" };

// A4-ratio sheet standing in for the page while the first PDF renders. Bars are decorative; the status text says what is happening.
function SkeletonPage() {
  return (
    <Stack data-testid="preview-skeleton" aria-hidden spacing={1.25} sx={{ p: "8%" }}>
      <Box sx={{ ...skeletonBar(0), height: 18, width: "55%", mb: 1 }} />
      {LINES.map((w, i) => <Box key={i} sx={{ ...skeletonBar(i + 1), width: w, height: 9 }} />)}
    </Stack>
  );
}

export function PreviewPane({ p, issue }: { p: ReturnType<typeof usePreview>; issue: boolean }) {
  const t = useT();
  const stage = p.stage && ({ queued: t.pvQueued, preparing: t.pvPreparing, layout: t.pvRendering, rendering: t.pvRendering })[p.stage];
  const status = p.busy ? t.pvBuilding : p.url && !p.error ? t.pvReady.replace("{n}", String(p.pages)) : "";
  return (
    <Box component="section" aria-labelledby="pv-title" aria-busy={p.busy} sx={{ display: "grid", gap: 1.5, alignContent: "start" }}>
      <Typography id="pv-title" component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.pvTitle}</Typography>
      <Box role="status" sx={srOnly}>{status}</Box>
      <Box sx={{ position: "relative", aspectRatio: "210 / 297", width: "100%", maxWidth: 360, mx: "auto", border: 1, borderColor: "divider", borderRadius: 1.5, overflow: "hidden", bgcolor: "surface.raised" }}>
        {p.url && (
          // No `sandbox`: Chrome refuses to show a PDF in a sandboxed frame. The document is a blob of our own renderer's PDF (plain text in, no scripts written) shown by the browser's isolated PDF viewer; the link below opens it if a browser cannot embed PDFs.
          <Box component="iframe" key={p.url} src={p.url} title={t.pvFrame} sx={{ ...enterFade, display: "block", width: "100%", height: "100%", border: 0, bgcolor: "#fff", opacity: p.busy ? 0.45 : 1, transition: "opacity 200ms" }} />
        )}
        {!p.url && p.busy && <SkeletonPage />}
        {!p.url && !p.busy && (
          <Typography sx={{ p: 3, fontSize: "0.875rem", color: "text.secondary", textAlign: "center" }}>{issue ? t.pvFix : ""}</Typography>
        )}
      </Box>
      {p.busy && <Typography aria-hidden sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{stage}{p.url ? ` · ${t.pvStale}` : ""}</Typography>}
      {p.error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={p.retry} sx={{ minHeight: 44 }}>{t.pvRetry}</Button>}>{t[errKey[p.error]]}</Alert>
      )}
      <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
        {p.url && <Link href={p.url} target="_blank" rel="noopener" sx={{ fontSize: "0.8125rem", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{t.pvOpen}</Link>}
      </Stack>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.6 }}>{t.pvNote}</Typography>
    </Box>
  );
}
