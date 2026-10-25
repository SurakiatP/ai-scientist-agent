"use client";
import { useEffect, useState } from "react";
import { Alert, Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { clearOld, importOld, readOld, summarize, type ImportResult, type OldData } from "@/lib/importOld";
import { useT } from "@/lib/prefs";
import { refreshNow, useSync } from "@/lib/sync";

// "Earlier data in this browser": counts what the old browser-only version left in localStorage and imports it ONLY on the button.
export function ImportOld({ open }: { open: boolean }) {
  const t = useT();
  const status = useSync((s) => s.status);
  const [old, setOld] = useState<OldData | null>(null);
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState(false), [confirm, setConfirm] = useState(false), [cleared, setCleared] = useState(false);
  useEffect(() => { if (open) { setOld(readOld()); setCleared(false); } }, [open]); // eslint-disable-line react-hooks/set-state-in-effect -- re-read the browser data each time the dialog opens
  if (status === "disabled") return null; // browser-only mode: the old data is simply the data
  const sum = old ? summarize(old) : null;
  const any = !!sum && sum.projects + sum.sessions + sum.turns + sum.files > 0;
  const online = status === "online" || status === "conflict";
  const run = async () => {
    if (!old || prog) return;
    setErr(false); setRes(null); setProg([0, 1]);
    try { setRes(await importOld(old, (a, b) => setProg([a, b]))); void refreshNow(); } catch { setErr(true); }
    setProg(null);
  };
  return (
    <Box component="section" aria-labelledby="import-l" sx={{ px: 2, py: 1.5, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "surface.raised" }}>
      <Typography id="import-l" component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700 }}>{t.importTitle}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>{t.importNote}</Typography>
      <Stack spacing={1} sx={{ mt: 1.25 }}>
        {cleared ? <Typography role="status" sx={{ fontSize: "0.875rem" }}>{t.importCleared}</Typography>
          : !any ? <Typography sx={{ fontSize: "0.875rem" }}>{t.importNone}</Typography>
          : <>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{t.importFound.replace("{p}", String(sum!.projects)).replace("{s}", String(sum!.sessions)).replace("{t}", String(sum!.turns)).replace("{f}", String(sum!.files))}</Typography>
            <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t.importWarn}</Typography>
            {!online && <Typography role="status" sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t.importOffline}</Typography>}
            <Button variant="outlined" disabled={!online || !!prog} onClick={() => void run()} sx={{ alignSelf: "flex-start", minHeight: 44, borderColor: "primary.main" }}>{t.importBtn}</Button>
            {prog && <Box role="status"><Typography sx={{ fontSize: "0.8125rem", mb: 0.5 }}>{t.importing.replace("{a}", String(prog[0])).replace("{b}", String(prog[1]))}</Typography><LinearProgress variant="determinate" value={(prog[0] / prog[1]) * 100} aria-label={t.importBtn} /></Box>}
            {err && <Alert severity="error" variant="outlined" role="alert">{t.importFail}</Alert>}
            {res && (
              <Stack spacing={1}>
                <Alert severity="success" variant="outlined" role="status">{t.importDone.replace("{n}", String(res.imported)).replace("{k}", String(res.skipped))}</Alert>
                {confirm ? (
                  <Stack role="group" aria-label={t.importClearConfirm} spacing={1}>
                    <Typography sx={{ fontSize: "0.875rem" }}>{t.importClearConfirm}</Typography>
                    <Stack direction="row" spacing={1}>
                      <Button color="error" variant="contained" autoFocus sx={{ minHeight: 44 }} onClick={() => { clearOld(); setCleared(true); setConfirm(false); setRes(null); }}>{t.confirm}</Button>
                      <Button color="inherit" sx={{ minHeight: 44 }} onClick={() => setConfirm(false)}>{t.cancel}</Button>
                    </Stack>
                  </Stack>
                ) : <Button color="inherit" variant="outlined" sx={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => setConfirm(true)}>{t.importClear}</Button>}
              </Stack>
            )}
          </>}
      </Stack>
    </Box>
  );
}
