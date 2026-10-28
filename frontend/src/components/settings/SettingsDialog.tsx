"use client";
import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, Switch, Typography, useColorScheme } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import SettingsBrightnessOutlinedIcon from "@mui/icons-material/SettingsBrightnessOutlined";
import { API_BASE } from "@/lib/config";
import { useChatStore } from "@/lib/chat";
import { useHistoryStore, useHydrated, useStorageFull } from "@/lib/history";
import { usePrefs, useT } from "@/lib/prefs";
import { stopRun } from "@/lib/run";
import { useSettingsOpen } from "@/components/shell/Sidebar";
import { useSync } from "@/lib/sync";
import { ImportOld } from "./ImportOld";
import { Segmented } from "./Segmented";
import Link from "next/link";

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

const rise = keyframes`from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; }`;
const pulse = keyframes`0%, 100% { opacity: 1; } 50% { opacity: .35; }`;
const EASE = "cubic-bezier(.22,1,.36,1)";

// Settings row: icon + title/description left, compact radio group (or control) right; stacks under 600px.
function Section({ labelId, title, note, icon, below, i = 0, children }: { labelId: string; title: string; note?: string; icon?: React.ReactNode; below?: boolean; i?: number; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ display: "flex", flexDirection: below ? "column" : { xs: "column", sm: "row" }, alignItems: below ? "stretch" : { sm: "center" }, justifyContent: "space-between", gap: { xs: 1.25, sm: 2 }, px: 2, py: 1.5, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "surface.raised", animation: `${rise} 380ms ${EASE} both`, animationDelay: `${60 + i * 55}ms`, transition: "border-color 200ms ease-out, box-shadow 200ms ease-out", "&:hover": { borderColor: "color-mix(in srgb, var(--mui-palette-primary-main) 45%, transparent)" } }}>
      <Box sx={{ display: "flex", gap: 1.5, minWidth: 0, flex: 1 }}>
        {icon && <Box aria-hidden sx={{ color: "primary.main", display: "grid", placeItems: "center", width: 36, height: 36, mt: -0.25, borderRadius: 2, flexShrink: 0, bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 12%, transparent)" }}>{icon}</Box>}
        <Box sx={{ minWidth: 0 }}>
          <Typography id={labelId} component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.4 }}>{title}</Typography>
          {note && <Typography sx={{ mt: 0.25, fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>{note}</Typography>}
        </Box>
      </Box>
      {children}
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
  const shared = useSync((s) => s.status) !== "disabled" && hydrated;
  const close = () => { set(false); setConfirm(false); };
  const hs = { checking: t.backendChecking, ok: t.backendOk, down: t.backendDown }[health];
  const curLang = hydrated ? lang : "th";
  const curMode = mode ?? "system";
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth={false} aria-labelledby="settings-title" slotProps={{ paper: { sx: { maxWidth: 640, borderRadius: 3, backgroundImage: "none", bgcolor: "background.default" } } }}>
      <DialogTitle id="settings-title" sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", pb: 0.5 }}>
        <Box component="span">
          <Typography component="span" sx={{ display: "block", fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.3 }}>{t.settingsTitle}</Typography>
          <Typography component="span" sx={{ display: "block", mt: 0.5, fontSize: "0.9375rem", fontWeight: 400, color: "text.secondary" }}>{t.settingsSubtitle}</Typography>
        </Box>
        <IconButton aria-label={t.close} onClick={close} sx={{ width: 44, height: 44, "& svg": { transition: `transform 240ms ${EASE}` }, "&:hover svg": { transform: "rotate(90deg)" } }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Section i={0} labelId="lang-l" title={t.language} note={t.langNote} icon={<LanguageOutlinedIcon />}>
            <Segmented label={t.language} value={curLang} onChange={setLang} options={[{ value: "th", label: "ไทย" }, { value: "en", label: "English" }]} />
          </Section>
          <Section i={1} labelId="theme-l" title={t.themeLabel} note={t.themeNote} icon={<LightModeOutlinedIcon />}>
            <Segmented label={t.themeLabel} value={curMode as "light" | "dark" | "system"} onChange={setMode} options={[
              { value: "light", label: t.themeLight, icon: <LightModeOutlinedIcon /> },
              { value: "dark", label: t.themeDark, icon: <DarkModeOutlinedIcon /> },
              { value: "system", label: t.themeSystem, icon: <SettingsBrightnessOutlinedIcon /> },
            ]} />
          </Section>
          <Section i={2} labelId="reviewplan-l" title={t.reviewPlan} note={t.reviewPlanNote}>
            <Switch
              checked={hydrated ? reviewPlan : true}
              onChange={(_, v) => setReviewPlan(v)}
              slotProps={{ input: { "aria-labelledby": "reviewplan-l" } }}
            />
          </Section>
          <Section i={3} labelId="data-l" title={t.dataTitle} note={shared ? t.dataNoteShared : t.dataNote} below>
            <Stack spacing={1}>
              {full && <Typography role="status" sx={{ fontSize: "0.875rem", color: "error.main" }}>{t.storageFull}</Typography>}
              {confirm ? (
                <Stack role="group" aria-label={shared ? t.deleteAllSharedConfirm : t.deleteAllConfirm} spacing={1} sx={{ animation: `${rise} 240ms ${EASE} both` }}>
                  <Typography sx={{ fontSize: "0.875rem" }}>{shared ? t.deleteAllSharedConfirm : t.deleteAllConfirm}</Typography>
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
                <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: health === "ok" ? "evidence.verified" : health === "down" ? "error.main" : "text.secondary", transition: "background-color 300ms", animation: health === "checking" ? `${pulse} 1.1s ease-in-out infinite` : "none" }} />
                {t.backend}: {hs}
              </Typography>
            </Stack>
          </Section>
          <ImportOld open={open} />
          {shared && <Button component={Link} href="/usage" onClick={close} color="inherit" variant="outlined" sx={{ alignSelf: "flex-start", minHeight: 44 }}>{t.usageOpen}</Button>}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
