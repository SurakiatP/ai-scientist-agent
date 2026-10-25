"use client";
import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Radio, RadioGroup, Stack, Switch, Typography, useColorScheme } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";
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

// One selectable card: a real radio (name = title, description linked) so keyboard and screen readers behave like a plain radio group.
function OptionCard({ id, value, title, desc, icon, checked }: { id: string; value: string; title: string; desc: string; icon?: React.ReactNode; checked: boolean }) {
  return (
    <Box component="label" htmlFor={id} sx={{
      display: "flex", alignItems: "flex-start", gap: 1.25, minHeight: 44, p: 1.75, borderRadius: 2, cursor: "pointer",
      border: 1, borderColor: checked ? "primary.main" : "divider", bgcolor: checked ? "color-mix(in srgb, var(--mui-palette-primary-main) 8%, transparent)" : "transparent",
      boxShadow: checked ? "0 0 0 1px var(--mui-palette-primary-main) inset" : "none",
      "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
      "&:hover": { borderColor: "primary.main" },
    }}>
      <Radio id={id} value={value} disableRipple sx={{ p: 0.5, mt: -0.25, "&.Mui-focusVisible": { outline: 0 } }}
        slotProps={{ input: { "aria-label": title, "aria-describedby": `${id}-d` } }} />
      {icon && <Box aria-hidden sx={{ color: "primary.main", display: "grid", mt: 0.25 }}>{icon}</Box>}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.5 }}>{title}</Typography>
        <Typography id={`${id}-d`} sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>{desc}</Typography>
      </Box>
    </Box>
  );
}

function Section({ labelId, title, note, children, cols }: { labelId: string; title: string; note?: string; children: React.ReactNode; cols: number }) {
  return (
    <Box component="section" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "150px 1fr" }, p: 2, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "surface.raised" }}>
      <Box>
        <Typography id={labelId} component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.4 }}>{title}</Typography>
        {note && <Typography sx={{ mt: 0.5, fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>{note}</Typography>}
      </Box>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: `repeat(${cols}, minmax(0, 1fr))` }, alignContent: "start" }}>{children}</Box>
    </Box>
  );
}

export function SettingsDialog() {
  const full = useStorageFull();
  const t = useT();
  const hydrated = useHydrated();
  const { open, set } = useSettingsOpen();
  const lang = usePrefs((s) => s.lang);
  const setLang = usePrefs((s) => s.setLang);
  const reviewPlan = usePrefs((s) => s.reviewPlan);
  const setReviewPlan = usePrefs((s) => s.setReviewPlan);
  const { mode, setMode } = useColorScheme();
  const [confirm, setConfirm] = useState(false);
  const health = useHealth(open);
  const close = () => { set(false); setConfirm(false); };
  const hs = { checking: t.backendChecking, ok: t.backendOk, down: t.backendDown }[health];
  const curLang = hydrated ? lang : "th";
  const curMode = mode ?? "system";
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="settings-title" slotProps={{ paper: { sx: { borderRadius: 3, backgroundImage: "none", bgcolor: "background.default" } } }}>
      <DialogTitle id="settings-title" sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", pb: 0.5 }}>
        <Box component="span">
          <Typography component="span" sx={{ display: "block", fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.3 }}>{t.settingsTitle}</Typography>
          <Typography component="span" sx={{ display: "block", mt: 0.5, fontSize: "0.9375rem", fontWeight: 400, color: "text.secondary" }}>{t.settingsSubtitle}</Typography>
        </Box>
        <IconButton aria-label={t.close} onClick={close} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1.5 }}>
          <Section labelId="lang-l" title={t.language} note={t.langNote} cols={2}>
            <RadioGroup aria-labelledby="lang-l" value={curLang} onChange={(_, v) => setLang(v === "en" ? "en" : "th")} sx={{ display: "contents" }}>
              <OptionCard id="lang-th" value="th" title="ไทย" desc={t.langThDesc} checked={curLang === "th"} />
              <OptionCard id="lang-en" value="en" title="English" desc={t.langEnDesc} checked={curLang === "en"} />
            </RadioGroup>
          </Section>
          <Section labelId="theme-l" title={t.themeLabel} note={t.themeNote} cols={3}>
            <RadioGroup aria-labelledby="theme-l" value={curMode} onChange={(_, v) => setMode(v as "light" | "dark" | "system")} sx={{ display: "contents" }}>
              <OptionCard id="theme-light" value="light" title={t.themeLight} desc={t.themeLightDesc} icon={<LightModeOutlinedIcon />} checked={curMode === "light"} />
              <OptionCard id="theme-dark" value="dark" title={t.themeDark} desc={t.themeDarkDesc} icon={<DarkModeOutlinedIcon />} checked={curMode === "dark"} />
              <OptionCard id="theme-system" value="system" title={t.themeSystem} desc={t.themeSystemDesc} icon={<SettingsBrightnessOutlinedIcon />} checked={curMode === "system"} />
            </RadioGroup>
          </Section>
          <Section labelId="reviewplan-l" title={t.reviewPlan} cols={1}>
            <Stack direction="row" useFlexGap spacing={1.5} sx={{ alignItems: "center", p: 1.75, border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Switch
                checked={hydrated ? reviewPlan : true}
                onChange={(_, v) => setReviewPlan(v)}
                slotProps={{ input: { "aria-labelledby": "reviewplan-l" } }}
              />
              <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", lineHeight: 1.7, minWidth: 0 }}>{t.reviewPlanNote}</Typography>
            </Stack>
          </Section>
          <Section labelId="data-l" title={t.dataTitle} note={t.dataNote} cols={1}>
            <Stack spacing={1} sx={{ p: 1.75, border: 1, borderColor: "divider", borderRadius: 2 }}>
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
              <Typography role="status" sx={{ fontSize: "0.875rem", display: "flex", alignItems: "center", gap: 1 }}>
                <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: health === "ok" ? "evidence.verified" : health === "down" ? "error.main" : "text.secondary" }} />
                {t.backend}: {hs}
              </Typography>
            </Stack>
          </Section>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
