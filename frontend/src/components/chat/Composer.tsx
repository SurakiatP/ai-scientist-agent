"use client";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Box, Button, CircularProgress, IconButton, InputBase, Menu, MenuItem, Typography } from "@mui/material";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { create } from "zustand";
import { useStorageFull } from "@/lib/history";
import { ease, enterPop } from "@/lib/motion";
import { useT } from "@/lib/prefs";
import { canStart, startAnalysis, startRun, stopRun, useRunState } from "@/lib/run";
import { UploadError, uploadFile, type AskMode } from "@/lib/sse";
import { MAX_QUESTION } from "@/lib/strings";

// Shared draft so starter chips / "ask follow-up" can fill the one composer. In memory only.
// Per session, so a draft never travels into (and sends from) another session.
export const useDraft = create<{ drafts: Record<string, string>; set: (sid: string, s: string) => void }>((set) => ({
  drafts: {},
  set: (sid, text) => set((d) => ({ drafts: { ...d.drafts, [sid]: text } })), // ponytail: empty strings linger until reload; negligible
}));
export const focusComposer = () => document.getElementById("composer")?.focus();

type Attached = { name: string; size: number; status: "uploading" | "ready" | "error"; fileId?: string; error?: string };
const ACCEPT = ".csv,.xlsx,.parquet,.json";
const formatSize = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;

export function Composer({ sessionId, large = false }: { sessionId: string; large?: boolean }) {
  const t = useT();
  const text = useDraft((s) => s.drafts[sessionId] ?? ""), set = useDraft((s) => s.set);
  const setText = (v: string) => set(sessionId, v);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<AskMode>("deep");
  const run = useRunState();
  const full = useStorageFull();
  const [composing, setComposing] = useState(false);
  const [modeAnchor, setModeAnchor] = useState<HTMLElement | null>(null);
  const [file, setFile] = useState<Attached | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => () => upload.current?.abort(), []);
  const busy = !!run.turnId, mine = busy && run.sessionId === sessionId;
  // icon pops only on a send<->stop change in this session, never on mount or session switch
  const [sw, setSw] = useState({ sid: sessionId, mine, anim: false });
  if (sw.sid !== sessionId || sw.mine !== mine) setSw({ sid: sessionId, mine, anim: sw.sid === sessionId });
  const over = text.length > MAX_QUESTION;
  const fileReady = !file || (file.status === "ready" && !!file.fileId);
  const canSend = !busy && !over && fileReady && text.trim().length > 0;
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen || busy) return;
    upload.current?.abort();
    const ac = new AbortController();
    upload.current = ac;
    setErr("");
    setFile({ name: chosen.name, size: chosen.size, status: "uploading" });
    try {
      const up = await uploadFile(chosen, ac.signal);
      if (ac.signal.aborted) return;
      setFile({ name: up.name, size: up.size, status: "ready", fileId: up.id });
    } catch (e: unknown) {
      if (ac.signal.aborted) return;
      setFile({ name: chosen.name, size: chosen.size, status: "error", error: e instanceof UploadError ? e.message : t.uploadFailed });
    } finally {
      if (upload.current === ac) upload.current = null;
    }
  };
  const removeFile = () => {
    upload.current?.abort();
    upload.current = null;
    setFile(null);
    setErr("");
  };
  const send = () => {
    if (!canSend) return;
    const q = text.trim();
    if (!canStart().ok) { setErr(t.busyElsewhere); return; } // text stays; never dropped silently
    setErr("");
    const attached = file;
    setText("");
    setFile(null);
    const restore = (e: unknown) => {
      if (!useDraft.getState().drafts[sessionId]) set(sessionId, q); // restore unless the user already typed again
      if (attached) setFile((cur) => cur ?? attached);
      setErr(e instanceof Error && e.message === "busy" ? t.busyElsewhere : t.startFailed);
    };
    if (attached?.status === "ready" && attached.fileId) startAnalysis(sessionId, q, attached.fileId, attached.name).catch(restore);
    else startRun(sessionId, q, { mode }).catch(restore);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || composing || e.nativeEvent.isComposing || e.keyCode === 229) return; // 229: IME (Safari fires keydown after compositionend)
    e.preventDefault();
    send();
  };
  const note = busy && !mine ? t.busyElsewhere : over ? t.tooLong : err || (file?.status === "error" ? file.error || t.uploadFailed : file?.status === "ready" ? t.analysisModeNote : "");
  const counter = text.length >= MAX_QUESTION * 0.8;
  return (
    <Box sx={{ width: "100%" }}>
      <input ref={picker} type="file" accept={ACCEPT} hidden onChange={pick} />
      <Box sx={{
        display: "flex", alignItems: "stretch", bgcolor: "background.paper", border: 1, borderRadius: { xs: 3, sm: 4 },
        borderColor: large ? "color-mix(in srgb, var(--mui-palette-primary-main) 45%, var(--mui-palette-divider))" : "divider",
        transition: `border-color 180ms ${ease}, box-shadow 180ms ${ease}`,
        "&:focus-within": { borderColor: "primary.main", boxShadow: "0 0 0 1px var(--mui-palette-primary-main), 0 0 28px color-mix(in srgb, var(--mui-palette-primary-main) 28%, transparent)" },
      }}>
        <Box sx={{ display: "flex", alignItems: large ? "center" : "flex-end", borderRight: 1, borderColor: "divider", px: 0.75, py: 0.75, my: 0.5 }}>
          <IconButton aria-label={t.attach} onClick={() => picker.current?.click()} disabled={busy} sx={{ minWidth: 44, minHeight: 44, color: "text.secondary" }}>
            <AttachFileRoundedIcon sx={{ transform: "rotate(45deg)" }} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.5, py: 0.75, pl: 1.5, pr: 1 }}>
          {file && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 44, px: 1, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.shell" }}>
              <DescriptionOutlinedIcon fontSize="small" sx={{ color: file.status === "error" ? "error.main" : "primary.main", flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>{file.name}</Typography>
                <Typography component="span" aria-live="polite" sx={{ display: "block", fontSize: "0.6875rem", lineHeight: 1.5, color: file.status === "error" ? "error.main" : "text.secondary" }}>
                  {file.status === "uploading" ? t.uploadingFile : file.status === "error" ? t.uploadFailed : formatSize(file.size)}
                </Typography>
              </Box>
              {file.status === "uploading" && <CircularProgress size={16} sx={{ flexShrink: 0 }} aria-hidden />}
              <IconButton aria-label={`${t.removeFile}: ${file.name}`} onClick={removeFile} size="small" sx={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
          <Box sx={{ display: "flex", flexWrap: { xs: "wrap", sm: "nowrap" }, alignItems: "flex-end", columnGap: 1, rowGap: 0.5 }}>
            <InputBase
              id="composer" multiline fullWidth minRows={large ? 2 : 1} maxRows={10} value={text}
              placeholder={file ? t.analysisPlaceholder : t.askPlaceholder} onChange={(e) => { setText(e.target.value); setErr(""); }} onKeyDown={onKeyDown}
              onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
              slotProps={{ input: { "aria-label": t.composerLabel, "aria-describedby": "composer-note" } }}
              sx={{ flex: { xs: "1 1 100%", sm: "1 1 0" }, minWidth: 0, px: 0.5, py: 1, fontSize: "1rem", lineHeight: 1.6, alignItems: "flex-start" }}
            />
            {counter && (
              <Typography sx={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.secondary", alignSelf: "center" }}>
                {text.length}/{MAX_QUESTION}
              </Typography>
            )}
            <Box sx={{ flex: { xs: 1, sm: "none" } }} />
            <Button color="inherit" variant="outlined" disabled={!!file} aria-haspopup="menu" aria-expanded={!!modeAnchor}
              aria-label={`${t.modeLabel}: ${mode === "deep" ? t.modeDeep : t.modeQuick}`} onClick={(e) => setModeAnchor(e.currentTarget)}
              startIcon={<LayersOutlinedIcon sx={{ color: "primary.main" }} />} endIcon={<ExpandMoreRoundedIcon />}
              sx={{ borderRadius: 99, borderColor: "divider", fontWeight: 400, px: 1.75, flexShrink: 0, alignSelf: "center", whiteSpace: "nowrap" }}>
              {mode === "deep" ? t.modeDeep : t.modeQuick}
            </Button>
            <Menu anchorEl={modeAnchor} open={!!modeAnchor} onClose={() => setModeAnchor(null)} slotProps={{ list: { "aria-label": t.chooseMode } }}>
              {(["deep", "quick"] as const).map((m) => (
                <MenuItem key={m} selected={m === mode} aria-current={m === mode ? "true" : undefined} sx={{ minHeight: 44 }}
                  onClick={() => { setMode(m); setModeAnchor(null); }}>{m === "deep" ? t.modeDeep : t.modeQuick}</MenuItem>
              ))}
            </Menu>
            <IconButton aria-label={mine ? t.stop : t.ask} onClick={(e) => { if (!mine) send(); else if (e.detail < 2) stopRun(); }} /* a double-click on Send must not land on Stop */ disabled={!mine && !canSend}
              sx={{ width: 48, height: 48, alignSelf: "center", flexShrink: 0, bgcolor: "primary.main", color: "primary.contrastText", transition: `background-color 160ms ${ease}`, "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 35%, transparent)", color: "primary.contrastText" } }}>
              <Box key={mine ? "stop" : "send"} component="span" sx={{ display: "inline-flex", ...(sw.anim ? enterPop : {}) }}>{mine ? <StopRoundedIcon /> : <SendOutlinedIcon />}</Box>
            </IconButton>
          </Box>
        </Box>
      </Box>
      <Typography id="composer-note" role="status" sx={{ mt: 0.75, px: 1, fontSize: "0.75rem", color: over || (full && !note) ? "error.main" : "text.secondary", minHeight: "1.2em" }}>
        {note || (full ? t.storageFull : "")}
      </Typography>
    </Box>
  );
}
