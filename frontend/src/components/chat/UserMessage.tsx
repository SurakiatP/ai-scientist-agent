"use client";
import { srOnly } from "@/lib/config";
import { useRef, useState } from "react";
import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import { useChatStore, type Turn } from "@/lib/chat";
import { newId } from "@/lib/history";
import { usePrefs, useT } from "@/lib/prefs";
import { canStart, startAnalysis, startError, startRun, useRunState } from "@/lib/run";
import { focusComposer, useDraft, useStartErr } from "./Composer";
import { MAX_QUESTION } from "@/lib/strings";

export const Time = ({ ts }: { ts: number }) => {
  const lang = usePrefs((s) => s.lang);
  return <Typography component="time" dateTime={new Date(ts).toISOString()} sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{new Date(ts).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</Typography>;
};

// Round avatar slot shared by user and agent rows so both columns line up.
export const avatarSx = { width: 32, height: 32, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 16%, transparent)", color: "primary.main", border: 1, borderColor: "color-mix(in srgb, var(--mui-palette-primary-main) 30%, transparent)" };

// Clipboard API when present, hidden textarea + execCommand otherwise; false when both fail (never claim success).
export async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(ta);
  try { ta.select(); return document.execCommand("copy"); } catch { return false; } finally { ta.remove(); }
}

// Same run the first send would start: analysis turns keep their file, others keep their mode.
const ask = (sessionId: string, turn: Turn, question: string) =>
  turn.analysis ? startAnalysis(sessionId, question, turn.analysis.fileId, turn.analysis.fileName) : startRun(sessionId, question, { mode: turn.mode });

const fine = "@media (hover: hover) and (pointer: fine)";
const btn = { width: 44, height: 44, color: "text.secondary" };

export function UserMessage({ sessionId, turn }: { sessionId: string; turn: Turn }) {
  const t = useT();
  const question = turn.question;
  const busy = !!useRunState().turnId;
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);
  const [composing, setComposing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState(false);
  const editBtn = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const laterCount = useChatStore((s) => { const ts = s.sessions.find((x) => x.id === sessionId)?.turns ?? []; return Math.max(0, ts.length - 1 - ts.findIndex((x) => x.id === turn.id)); });
  const name = question.trim().slice(0, 40);
  const copy = async () => { setCopied((await copyText(question)) ? "ok" : "fail"); setTimeout(() => setCopied(null), 2000); };
  // A start that fails (queue full, offline...) is never silent: the question goes back into the composer with the reason.
  const failed = (q: string) => (e: unknown) => {
    if (!useDraft.getState().drafts[sessionId]) useDraft.getState().set(sessionId, q);
    useStartErr.getState().set(sessionId, startError(e) ?? t.startFailed);
    focusComposer();
  };
  const retry = () => { ask(sessionId, turn, question).catch(failed(question)); };
  const open = () => { setDraft(question); setConfirm(false); setErr(false); setEditing(true); };
  const close = () => { setEditing(false); setConfirm(false); requestAnimationFrame(() => editBtn.current?.focus()); };
  const over = draft.length > MAX_QUESTION;
  const changed = draft.trim() !== question.trim() && draft.trim().length > 0;
  const canSend = changed && !over && !busy;
  const go = () => {
    if (!canStart().ok) { setErr(true); return; }
    // later turns answered the old question: ask before dropping them
    if (laterCount > 0 && !confirm) { setConfirm(true); return; }
    const all = useChatStore.getState().sessions.find((x) => x.id === sessionId)?.turns ?? [];
    const removed = all.slice(all.findIndex((x) => x.id === turn.id)); // this question and every later turn
    useChatStore.getState().truncateFrom(sessionId, turn.id);
    setEditing(false); setConfirm(false);
    const q = draft.trim();
    ask(sessionId, turn, q).catch((e: unknown) => {
      if ((e as { uncertain?: boolean })?.uncertain) { useStartErr.getState().set(sessionId, t.sendUncertain); return; } // the edit may be running at the freed position
      // the edit never started: put the conversation back (new ids: the old ones are gone on the server) and say why
      for (const x of removed) useChatStore.getState().addTurn(sessionId, { ...x, id: newId(), runId: undefined, status: x.status === "running" || x.status === "awaiting_plan" ? "interrupted" : x.status });
      failed(q)(e);
    });
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Enter" || e.shiftKey || composing || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    if (canSend) go();
  };
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5, px: 0.5, [fine]: { "&:hover .um-actions, &:focus-within .um-actions": { opacity: 1 } } }}>
      <Box component="span" sx={srOnly}>{t.you}</Box>
      {editing ? (
        <Box sx={{ width: { xs: "100%", sm: "75%" }, minWidth: 0, bgcolor: "surface.raised", border: 1, borderColor: "primary.main", borderRadius: 3, p: 1.5 }}>
          <TextField inputRef={field} autoFocus multiline fullWidth minRows={2} maxRows={10} value={draft}
            onChange={(e) => { setDraft(e.target.value); setConfirm(false); setErr(false); }} onKeyDown={onKeyDown}
            onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
            slotProps={{ htmlInput: { "aria-label": t.editBox, "aria-describedby": `um-note-${turn.id}` } }} />
          <Box id={`um-note-${turn.id}`} role="status" sx={{ mt: 0.5, fontSize: "0.75rem", minHeight: "1.2em", color: over || err ? "error.main" : "text.secondary" }}>
            {err ? t.busyElsewhere : over ? t.tooLong : draft.length >= MAX_QUESTION * 0.8 ? `${draft.length}/${MAX_QUESTION}` : ""}
          </Box>
          {confirm && (
            <Box role="alertdialog" aria-label={t.editTruncate.replace("{n}", String(laterCount))} sx={{ mt: 1, p: 1.5, border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Typography sx={{ fontSize: "0.875rem", mb: 1 }}>{t.editTruncate.replace("{n}", String(laterCount))}</Typography>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                <Button variant="outlined" color="inherit" sx={{ borderColor: "divider", minHeight: 44 }} onClick={() => { setConfirm(false); field.current?.focus(); }}>{t.cancel}</Button>
                <Button variant="outlined" autoFocus disabled={!canSend} sx={{ minHeight: 44 }} onClick={go}>{t.confirm}</Button>
              </Stack>
            </Box>
          )}
          {!confirm && (
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", mt: 1 }}>
              <Button variant="outlined" color="inherit" sx={{ borderColor: "divider", minHeight: 44 }} onClick={close}>{t.cancel}</Button>
              <Button variant="outlined" disabled={!canSend} sx={{ minHeight: 44 }} onClick={go}>{t.sendAgain}</Button>
            </Stack>
          )}
        </Box>
      ) : (
        <Box sx={{ maxWidth: "75%", minWidth: 0, bgcolor: "surface.raised", border: 1, borderColor: "divider", borderRadius: "20px 20px 6px 20px", px: 2, py: 1.25 }}>
          <Typography sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "1rem" }}>{question}</Typography>
        </Box>
      )}
      <Time ts={turn.createdAt} />
      {!editing && (
        <Stack className="um-actions" role="group" aria-label={t.msgActions} direction="row" sx={{ alignItems: "center", [fine]: { opacity: 0, "@media (prefers-reduced-motion: no-preference)": { transition: "opacity 150ms ease-out" } } }}>
          <Box role="status" sx={{ fontSize: "0.75rem", color: "text.secondary", mr: 0.5 }}>{copied === "fail" ? t.copyFailed : copied === "ok" ? t.copied : ""}</Box>
          <Tooltip title={t.copyMsg}>
            <IconButton aria-label={`${t.copyMsg}: ${name}`} onClick={copy} sx={btn}><ContentCopyRoundedIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title={busy ? t.retryBusy : t.retryMsg}>
            <span><IconButton aria-label={`${t.retryMsg}: ${name}`} onClick={retry} disabled={busy} sx={btn}><ReplayRoundedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
          <Tooltip title={busy ? t.editBusy : t.editMsg}>
            <span><IconButton ref={editBtn} aria-label={`${t.editMsg}: ${name}`} onClick={open} disabled={busy} sx={btn}><EditOutlinedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
}
