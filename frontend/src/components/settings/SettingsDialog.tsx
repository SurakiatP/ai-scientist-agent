"use client";
import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle, FormControl, FormControlLabel, FormLabel, IconButton, Radio, RadioGroup, Stack, Typography, useColorScheme } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { API_BASE } from "@/lib/config";
import { useChatStore } from "@/lib/chat";
import { useHistoryStore, useHydrated, useStorageFull } from "@/lib/history";
import { usePrefs, useT } from "@/lib/prefs";
import { stopRun } from "@/lib/run";
import { useSettingsOpen } from "@/components/shell/Sidebar";

type Health = "checking" | "ok" | "down";

// Read-only: reachable or not. Never shows URLs, headers or response bodies.
function useHealth(open: boolean): Health {
  const [h, setH] = useState<Health>("checking");
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetch(`${API_BASE}/v1/health`, { signal: ac.signal })
      .then((r) => setH(r.ok ? "ok" : "down"))
      .catch(() => { if (!ac.signal.aborted) setH("down"); });
    return () => { ac.abort(); setH("checking"); };
  }, [open]);
  return h;
}

export function SettingsDialog() {
  const full = useStorageFull();
  const t = useT();
  const hydrated = useHydrated();
  const { open, set } = useSettingsOpen();
  const lang = usePrefs((s) => s.lang);
  const setLang = usePrefs((s) => s.setLang);
  const { mode, setMode } = useColorScheme();
  const [confirm, setConfirm] = useState(false);
  const health = useHealth(open);
  const close = () => { set(false); setConfirm(false); };
  const hs = { checking: t.backendChecking, ok: t.backendOk, down: t.backendDown }[health];
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby="settings-title">
      <DialogTitle id="settings-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t.settingsTitle}
        <IconButton aria-label={t.close} onClick={close} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <FormControl>
            <FormLabel id="lang-l">{t.language}</FormLabel>
            <RadioGroup row aria-labelledby="lang-l" value={hydrated ? lang : "th"} onChange={(_, v) => setLang(v === "en" ? "en" : "th")}>
              <FormControlLabel value="th" control={<Radio />} label="ไทย" sx={{ minHeight: 44 }} />
              <FormControlLabel value="en" control={<Radio />} label="English" sx={{ minHeight: 44 }} />
            </RadioGroup>
          </FormControl>
          <FormControl>
            <FormLabel id="theme-l">{t.themeLabel}</FormLabel>
            <RadioGroup row aria-labelledby="theme-l" value={mode ?? "system"} onChange={(_, v) => setMode(v as "light" | "dark" | "system")}>
              <FormControlLabel value="light" control={<Radio />} label={t.themeLight} sx={{ minHeight: 44 }} />
              <FormControlLabel value="dark" control={<Radio />} label={t.themeDark} sx={{ minHeight: 44 }} />
              <FormControlLabel value="system" control={<Radio />} label={t.themeSystem} sx={{ minHeight: 44 }} />
            </RadioGroup>
          </FormControl>
          <Stack spacing={1}>
            <Typography component="h3" sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{t.dataTitle}</Typography>
            <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{t.dataNote}</Typography>
            {full && <Typography role="status" sx={{ fontSize: "0.875rem", color: "error.main" }}>{t.storageFull}</Typography>}
            {confirm ? (
              <Stack role="group" aria-label={t.deleteAllConfirm} spacing={1}>
                <Typography sx={{ fontSize: "0.875rem" }}>{t.deleteAllConfirm}</Typography>
                <Stack direction="row" spacing={1}>
                  <Button color="error" variant="contained" autoFocus sx={{ minHeight: 44 }} onClick={() => {
                    stopRun(); // a live run would otherwise keep writing into a store that no longer has its chat
                    useChatStore.getState().clearAll();
                    useHistoryStore.getState().clear(); // old /ask history is browser data too
                    setConfirm(false);
                  }}>{t.confirm}</Button>
                  <Button color="inherit" sx={{ minHeight: 44 }} onClick={() => setConfirm(false)}>{t.cancel}</Button>
                </Stack>
              </Stack>
            ) : (
              <Button color="error" variant="outlined" sx={{ alignSelf: "flex-start", minHeight: 44 }} onClick={() => setConfirm(true)}>{t.deleteAllChats}</Button>
            )}
          </Stack>
          <Typography role="status" sx={{ fontSize: "0.875rem" }}>{t.backend}: {hs}</Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
