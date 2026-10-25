"use client";
import { useState, type KeyboardEvent } from "react";
import { Box, IconButton, InputBase, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from "@mui/material";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { create } from "zustand";
import { useStorageFull } from "@/lib/history";
import { ease, enterPop } from "@/lib/motion";
import { useT } from "@/lib/prefs";
import { canStart, startRun, stopRun, useRunState } from "@/lib/run";
import type { AskMode } from "@/lib/sse";
import { MAX_QUESTION } from "@/lib/strings";

// Shared draft so starter chips / "ask follow-up" can fill the one composer. In memory only.
// Per session, so a draft never travels into (and sends from) another session.
export const useDraft = create<{ drafts: Record<string, string>; set: (sid: string, s: string) => void }>((set) => ({
  drafts: {},
  set: (sid, text) => set((d) => ({ drafts: { ...d.drafts, [sid]: text } })), // ponytail: empty strings linger until reload; negligible
}));
export const focusComposer = () => document.getElementById("composer")?.focus();

export function Composer({ sessionId, large = false }: { sessionId: string; large?: boolean }) {
  const t = useT();
  const text = useDraft((s) => s.drafts[sessionId] ?? ""), set = useDraft((s) => s.set);
  const setText = (v: string) => set(sessionId, v);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<AskMode>("deep");
  const run = useRunState();
  const full = useStorageFull();
  const [composing, setComposing] = useState(false);
  const busy = !!run.turnId, mine = busy && run.sessionId === sessionId;
  // icon pops only on a send<->stop change in this session, never on mount or session switch
  const [sw, setSw] = useState({ sid: sessionId, mine, anim: false });
  if (sw.sid !== sessionId || sw.mine !== mine) setSw({ sid: sessionId, mine, anim: sw.sid === sessionId });
  const over = text.length > MAX_QUESTION;
  const canSend = !busy && !over && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    const q = text.trim();
    if (!canStart().ok) { setErr(t.busyElsewhere); return; } // text stays; never dropped silently
    setErr("");
    setText(""); // startRun adds the turn synchronously; a refusal rejects before any state change
    startRun(sessionId, q, { mode }).catch((e: unknown) => {
      if (!useDraft.getState().drafts[sessionId]) set(sessionId, q); // restore unless the user already typed again
      setErr(e instanceof Error && e.message === "busy" ? t.busyElsewhere : t.startFailed);
    });
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || composing || e.nativeEvent.isComposing || e.keyCode === 229) return; // 229: IME (Safari fires keydown after compositionend)
    e.preventDefault();
    send();
  };
  const note = busy && !mine ? t.busyElsewhere : over ? t.tooLong : err;
  const counter = text.length >= MAX_QUESTION * 0.8;
  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{
        display: "flex", flexDirection: "column", gap: 0.5, px: 1.5, pt: large ? 1.5 : 1, pb: 1, bgcolor: "background.paper",
        border: 1, borderColor: "divider", borderRadius: 4,
        transition: `border-color 180ms ${ease}, box-shadow 180ms ${ease}`,
        "&:focus-within": { borderColor: "primary.main", boxShadow: "0 0 0 1px var(--mui-palette-primary-main)" },
      }}>
        <InputBase
          id="composer" multiline fullWidth minRows={large ? 3 : 1} maxRows={10} value={text}
          placeholder={t.placeholder} onChange={(e) => { setText(e.target.value); setErr(""); }} onKeyDown={onKeyDown}
          onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
          slotProps={{ input: { "aria-label": t.composerLabel, "aria-describedby": "composer-note" } }}
          sx={{ px: 0.5, py: 0.5, fontSize: "1rem", lineHeight: 1.6, alignItems: "flex-start" }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
          <Tooltip title={t.attachReason}>
            <span tabIndex={0} style={{ display: "inline-flex" }}>
              <IconButton disabled aria-label={`${t.attach}: ${t.attachReason}`}><AttachFileRoundedIcon /></IconButton>
            </span>
          </Tooltip>
          <ToggleButtonGroup
            exclusive size="small" value={mode} aria-label={t.modeLabel}
            onChange={(_, v: AskMode | null) => { if (v) setMode(v); }}
            sx={{ "& .MuiToggleButton-root": { minHeight: 44, px: 1.5, textTransform: "none", typography: "body2" } }}
          >
            <ToggleButton value="deep">{t.modeDeep}</ToggleButton>
            <ToggleButton value="quick">{t.modeQuick}</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          {counter && (
            <Typography sx={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.secondary" }}>
              {text.length}/{MAX_QUESTION}
            </Typography>
          )}
          <IconButton aria-label={mine ? t.stop : t.ask} onClick={(e) => { if (!mine) send(); else if (e.detail < 2) stopRun(); }} /* a double-click on Send must not land on Stop */ disabled={!mine && !canSend}
            sx={{ bgcolor: "primary.main", color: "primary.contrastText", transition: `background-color 160ms ${ease}`, "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "action.disabledBackground" } }}>
            <Box key={mine ? "stop" : "send"} component="span" sx={{ display: "inline-flex", ...(sw.anim ? enterPop : {}) }}>{mine ? <StopRoundedIcon /> : <SendRoundedIcon />}</Box>
          </IconButton>
        </Box>
      </Box>
      <Typography id="composer-note" role="status" sx={{ mt: 0.75, px: 1, fontSize: "0.75rem", color: over || (full && !note) ? "error.main" : "text.secondary", minHeight: "1.2em" }}>
        {note || (full ? t.storageFull : "")}
      </Typography>
    </Box>
  );
}
