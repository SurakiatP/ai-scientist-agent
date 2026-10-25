"use client";
import { useEffect, useState } from "react";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Radio, RadioGroup, Stack, Switch, Typography, useColorScheme } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LanguageOutlinedIcon from "@mui/icons-material/LanguageOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
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

// One short radio option: label wraps the real radio so keyboard and screen readers behave like a plain radio group.
function Option({ id, value, title, checked }: { id: string; value: string; title: string; checked: boolean }) {
  return (
    <Box component="label" htmlFor={id} sx={{
      display: "flex", alignItems: "center", gap: 0.5, minHeight: 44, pr: 1.5, borderRadius: 2, cursor: "pointer", whiteSpace: "nowrap",
      fontSize: "0.9375rem", fontWeight: checked ? 700 : 500,
      "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
    }}>
      <Radio id={id} value={value} disableRipple checked={checked} sx={{ p: 1, "&.Mui-focusVisible": { outline: 0 } }} slotProps={{ input: { "aria-label": title } }} />
      {title}
    </Box>
  );
}

// Settings row: icon + title/description left, compact radio group (or control) right; stacks under 600px.
function Section({ labelId, title, note, icon, below, children }: { labelId: string; title: string; note?: string; icon?: React.ReactNode; below?: boolean; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ display: "flex", flexDirection: below ? "column" : { xs: "column", sm: "row" }, alignItems: below ? "stretch" : { sm: "center" }, justifyContent: "space-between", gap: { xs: 1.25, sm: 2 }, px: 2, py: 1.5, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "surface.raised" }}>
      <Box sx={{ display: "flex", gap: 1.5, minWidth: 0, flex: 1 }}>
        {icon && <Box aria-hidden sx={{ color: "primary.main", display: "grid", mt: 0.25, flexShrink: 0 }}>{icon}</Box>}
        <Box sx={{ minWidth: 0 }}>
          <Typography id={labelId} component="h3" sx={{ fontSize: "0.9375rem", fontWeight: 700, lineHeight: 1.4 }}>{title}</Typography>
          {note && <Typography sx={{ mt: 0.25, fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>{note}</Typography>}
        </Box>
      </Box>
      {children}
    </Box>
  );
}

const group = { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 0.5, px: 1, border: 1, borderColor: "divider", borderRadius: 2, flexShrink: 0 } as const;

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
    <Dialog open={open} onClose={close} fullWidth maxWidth={false} aria-labelledby="settings-title" slotProps={{ paper: { sx: { maxWidth: 640, borderRadius: 3, backgroundImage: "none", bgcolor: "background.default" } } }}>
      <DialogTitle id="settings-title" sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", pb: 0.5 }}>
        <Box component="span">
          <Typography component="span" sx={{ display: "block", fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.3 }}>{t.settingsTitle}</Typography>
          <Typography component="span" sx={{ display: "block", mt: 0.5, fontSize: "0.9375rem", fontWeight: 400, color: "text.secondary" }}>{t.settingsSubtitle}</Typography>
        </Box>
        <IconButton aria-label={t.close} onClick={close} sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Section labelId="lang-l" title={t.language} note={t.langNote} icon={<LanguageOutlinedIcon />}>
            <RadioGroup aria-labelledby="lang-l" value={curLang} onChange={(_, v) => setLang(v === "en" ? "en" : "th")} sx={group}>
              <Option id="lang-th" value="th" title="ไทย" checked={curLang === "th"} />
              <Option id="lang-en" value="en" title="English" checked={curLang === "en"} />
            </RadioGroup>
          </Section>
          <Section labelId="theme-l" title={t.themeLabel} note={t.themeNote} icon={<LightModeOutlinedIcon />}>
            <RadioGroup aria-labelledby="theme-l" value={curMode} onChange={(_, v) => setMode(v as "light" | "dark" | "system")} sx={group}>
              <Option id="theme-light" value="light" title={t.themeLight} checked={curMode === "light"} />
              <Option id="theme-dark" value="dark" title={t.themeDark} checked={curMode === "dark"} />
              <Option id="theme-system" value="system" title={t.themeSystem} checked={curMode === "system"} />
            </RadioGroup>
          </Section>
          <Section labelId="reviewplan-l" title={t.reviewPlan} note={t.reviewPlanNote}>
            <Switch
              checked={hydrated ? reviewPlan : true}
              onChange={(_, v) => setReviewPlan(v)}
              slotProps={{ input: { "aria-labelledby": "reviewplan-l" } }}
            />
          </Section>
          <Section labelId="data-l" title={t.dataTitle} note={t.dataNote} below>
            <Stack spacing={1}>
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
