"use client";
import { useState, type KeyboardEvent } from "react";
import { Box, Chip, IconButton, InputBase, Tooltip, Typography } from "@mui/material";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { create } from "zustand";
import { useChatStore } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { canStart, startRun, stopRun, useRunState } from "@/lib/run";
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
  const run = useRunState();
  const hasTurns = useChatStore((s) => (s.sessions.find((x) => x.id === sessionId)?.turns.length ?? 0) > 0);
  const [composing, setComposing] = useState(false);
  const busy = !!run.turnId, mine = busy && run.sessionId === sessionId;
  const over = text.length > MAX_QUESTION;
  const canSend = !busy && !over && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    const q = text.trim();
    if (!canStart().ok) { setErr(t.busyElsewhere); return; } // text stays; never dropped silently
    setErr("");
    setText(""); // startRun adds the turn synchronously; a refusal rejects before any state change
    startRun(sessionId, q).catch((e: unknown) => {
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
          <Tooltip title={t.modeReason}>
            <span tabIndex={0} role="group" aria-label={`${t.modeChip}. ${t.modeReason}`} style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>
              <Chip size="small" variant="outlined" icon={<LayersOutlinedIcon />} label={t.modeChip} sx={{ height: 32 }} />
            </span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          {counter && (
            <Typography sx={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.secondary" }}>
              {text.length}/{MAX_QUESTION}
            </Typography>
          )}
          {mine ? (
            <IconButton aria-label={t.stop} onClick={stopRun} sx={{ bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }}><StopRoundedIcon /></IconButton>
          ) : (
            <IconButton aria-label={t.ask} onClick={send} disabled={!canSend}
              sx={{ bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "action.disabledBackground" } }}>
              <SendRoundedIcon />
            </IconButton>
          )}
        </Box>
      </Box>
      <Typography id="composer-note" role="status" sx={{ mt: 0.75, px: 1, fontSize: "0.75rem", color: over ? "error.main" : "text.secondary", minHeight: "1.2em" }}>
        {note || (hasTurns ? t.followUpNote : "")}
      </Typography>
    </Box>
  );
}
