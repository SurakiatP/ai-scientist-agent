"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from "@mui/material";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { newId, useHistoryStore } from "@/lib/history";
import { streamAsk, type Reference } from "@/lib/sse";
import { MAX_QUESTION, sampleQuestions, strings } from "@/lib/strings";
import { AnswerView } from "@/components/AnswerView";
import { emptyProgress, ProgressPanel, reduce, type Progress } from "@/components/ProgressPanel";
import { ReferenceList } from "@/components/ReferenceList";
import { palette } from "@/theme";

const t = strings.th; // ponytail: Thai default; add a language switch when needed (strings.en exists)

function Notice({ tone, title, children }: { tone: "info" | "error" | "done"; title: string; children: ReactNode }) {
  const c = tone === "error"
    ? { bg: palette.clayLight, fg: palette.error, icon: <ErrorOutlineRoundedIcon /> }
    : tone === "done"
      ? { bg: palette.tealLight, fg: palette.teal, icon: <CheckRoundedIcon /> }
      : { bg: palette.goldLight, fg: palette.gold, icon: <WarningAmberRoundedIcon /> };
  return (
    <Box role={tone === "error" ? "alert" : "status"} sx={{ display: "flex", gap: 1.5, p: 2, borderRadius: 2, bgcolor: c.bg }}>
      <Box aria-hidden="true" sx={{ display: "flex", color: c.fg, mt: "1px", "& svg": { fontSize: 20 } }}>{c.icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", mb: 0.25 }}>{title}</Typography>
        {children}
      </Box>
    </Box>
  );
}

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [answer, setAnswer] = useState<{ content: string; references: Reference[] } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const add = useHistoryStore((s) => s.add);
  const toggleSaved = useHistoryStore((s) => s.toggleSaved);
  const isSaved = useHistoryStore((s) => !!s.items.find((i) => i.id === itemId)?.savedAt);
  const ac = useRef<AbortController | null>(null);
  const answerRef = useRef<HTMLElement | null>(null);
  useEffect(() => () => ac.current?.abort(), []);

  // The answer arrives after the ledger: once the run settles (composer collapsed), bring it into view.
  useEffect(() => {
    if (!answer || running) return;
    const el = answerRef.current;
    if (!el) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  }, [answer, running]);

  const tooLong = question.length > MAX_QUESTION;
  const canAsk = !running && question.trim().length > 0 && !tooLong;

  function reset() {
    ac.current?.abort();
    setQuestion(""); setAskedQuestion(""); setRunning(false); setStarted(false);
    setStopped(false); setProgress(emptyProgress); setAnswer(null);
    setRefused(null); setError(null); setItemId(null);
  }

  async function ask() {
    if (!canAsk) return;
    const asked = question.trim();
    const c = new AbortController();
    ac.current = c;
    setAskedQuestion(asked);
    setRunning(true); setStarted(true); setStopped(false);
    setProgress(emptyProgress); setAnswer(null); setRefused(null); setError(null); setItemId(null);
    let terminal = false;
    let final: { content: string; references: Reference[] } | null = null;
    for await (const e of streamAsk(asked, c.signal)) {
      if (e.type === "refused") { terminal = true; setRefused(e.reason); }
      else if (e.type === "error") {
        terminal = true;
        const m = e.code === "network" ? t.network : e.code === "malformed" ? t.malformed : e.code === "http" ? `${t.requestFailed}${e.message ? `: ${e.message}` : ""}` : e.message;
        setError(m);
      } else if (e.type === "complete") {
        terminal = true;
        if (final) { // only a finished run is stored; never refused/error/aborted
          try {
            const id = newId();
            add({ id, question: asked, answer: final.content, references: final.references, createdAt: Date.now() });
            setItemId(id);
          } catch {} // history is best-effort; it must never break a run
        }
      }
      else if (e.type === "final_answer") { terminal = true; final = { content: e.content, references: e.references }; setAnswer(final); }
      setProgress((p) => reduce(p, e));
    }
    if (c.signal.aborted) setStopped(true);
    else if (!terminal) setError(t.cutOff); // stream ended with no complete/error/refused
    setRunning(false);
  }

  const refCount = answer?.references.length ?? 0;
  const verifiedCount = answer?.references.filter((r) => r.status === "verified").length ?? 0;
  const flaggedCount = refCount - verifiedCount;

  return (
    <Box sx={{ mx: "auto", maxWidth: 900, px: { xs: 2.5, sm: 4, lg: 5 }, py: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 3, md: 4 }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: { xs: "1.75rem", md: "2rem" }, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
            {t.title}
          </Typography>
          <Typography sx={{ mt: 1, maxWidth: "62ch", color: "text.secondary", fontSize: "0.9375rem", lineHeight: 1.75 }}>
            {t.subtitle}
          </Typography>
        </Box>

        <Box>
          {!started || running ? (
            <Paper
              sx={{
                p: { xs: 2, md: 2.5 }, borderRadius: 2, bgcolor: "background.paper",
                transition: "border-color 160ms ease, box-shadow 160ms ease",
                "&:focus-within": { borderColor: palette.primary, boxShadow: `0 0 0 3px ${palette.primaryLight}` },
              }}
            >
              <TextField
                multiline minRows={3} maxRows={12} fullWidth value={question} placeholder={t.placeholder}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
                slotProps={{ htmlInput: { "aria-label": t.title } }}
                sx={{
                  "& .MuiOutlinedInput-root": { p: 0, bgcolor: "transparent", fontSize: "1.0625rem", lineHeight: 1.7, "& fieldset": { border: 0 }, "&:hover fieldset": { border: 0 }, "&.Mui-focused fieldset": { border: 0 } },
                  "& .MuiInputBase-input": { p: 0 },
                  "& .MuiInputBase-input::placeholder": { color: "text.secondary", opacity: 1 },
                }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                <Typography sx={{ color: tooLong ? "error.main" : "text.secondary", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
                  {question.length}/{MAX_QUESTION}
                </Typography>
                <Typography sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", fontSize: "0.75rem" }}>
                  {t.composerHint}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {running && (
                  <Button variant="outlined" onClick={() => ac.current?.abort()} startIcon={<StopRoundedIcon />} sx={{ color: "text.primary", borderColor: "divider" }}>
                    {t.stop}
                  </Button>
                )}
                <Button variant="contained" disabled={!canAsk} onClick={ask} endIcon={<ArrowUpwardRoundedIcon />}>{t.ask}</Button>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2, bgcolor: "background.paper" }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", color: "text.secondary" }}>{t.asked}</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: "0.9375rem", lineHeight: 1.6 }}>{askedQuestion}</Typography>
                </Box>
                <Button variant="outlined" onClick={reset} sx={{ flexShrink: 0, alignSelf: { xs: "flex-start", sm: "auto" } }}>{t.askNew}</Button>
              </Stack>
            </Paper>
          )}
          {tooLong && !started && <Typography sx={{ mt: 1, color: "error.main", fontSize: "0.8125rem" }}>{t.tooLong}</Typography>}

          {!started && (
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ color: "text.secondary", fontSize: "0.75rem", fontWeight: 600 }}>{t.examplesLabel}</Typography>
              <Stack direction="row" useFlexGap sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                {sampleQuestions.map((q) => (
                  <Chip
                    key={q} label={q} variant="outlined" onClick={() => setQuestion(q)}
                    sx={{ height: "auto", maxWidth: "100%", borderRadius: 1.5, bgcolor: "background.paper", "& .MuiChip-label": { display: "block", whiteSpace: "normal", px: 1.25, py: 0.75, lineHeight: 1.5, fontSize: "0.75rem" } }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Box>

        {started && !refused && (
          <Box component="section" aria-label={t.progress} sx={{ pt: 3, borderTop: 1, borderColor: "divider" }}>
            <ProgressPanel p={progress} running={running} t={t} />
          </Box>
        )}
        {stopped && <Notice tone="done" title={t.stopped}><Typography sx={{ fontSize: "0.875rem", lineHeight: 1.7 }}>{t.stoppedHelp}</Typography></Notice>}
        {refused && (
          <Notice tone="info" title={t.refused}>
            <Typography sx={{ fontSize: "0.875rem", lineHeight: 1.7 }}>{refused}</Typography>
            <Typography sx={{ mt: 0.5, fontSize: "0.875rem", lineHeight: 1.7, color: "text.secondary" }}>{t.refusedHelp}</Typography>
          </Notice>
        )}
        {error && <Notice tone="error" title={t.error}><Typography sx={{ fontSize: "0.875rem", lineHeight: 1.7 }}>{error}</Typography></Notice>}

        {answer && (
          <Box
            ref={answerRef} component="section" aria-label={t.answer} tabIndex={-1}
            sx={{ pt: 3, borderTop: 1, borderColor: "divider", outline: "none", scrollMarginTop: { xs: "72px", md: "24px" } }}
          >
            <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
              <Stack
                direction="row" spacing={1.5}
                sx={{ alignItems: "center", justifyContent: "space-between", px: { xs: 2, md: 3 }, py: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: palette.background }}
              >
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: "2px", bgcolor: palette.teal, flexShrink: 0 }} />
                  <Typography component="h2" sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>{t.answer}</Typography>
                  {refCount > 0 && (
                    <Typography sx={{ flexBasis: { xs: "100%", sm: "auto" }, pl: { xs: "18px", sm: 0 }, color: "text.secondary", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
                      {refCount} {t.refTotal} · {verifiedCount} {t.refVerified} · {flaggedCount} {t.refFlagged}
                    </Typography>
                  )}
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
                  <IconButton aria-label={t.askNew} onClick={reset} sx={{ color: "text.secondary" }}>
                    <ReplayRoundedIcon />
                  </IconButton>
                  {itemId && (
                    <IconButton aria-label={isSaved ? t.unsave : t.save} aria-pressed={isSaved} onClick={() => toggleSaved(itemId)} sx={{ color: isSaved ? palette.primary : "text.secondary" }}>
                      {isSaved ? <BookmarkIcon /> : <BookmarkBorderIcon />}
                    </IconButton>
                  )}
                </Stack>
              </Stack>
              <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 2.5 } }}>
                <AnswerView content={answer.content} references={answer.references} />
              </Box>
              {answer.references.length > 0 && (
                <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5, borderTop: 1, borderColor: "divider", bgcolor: palette.background }}>
                  <Stack direction="row" sx={{ alignItems: "baseline", justifyContent: "space-between", gap: 1.5, mb: 0.5 }}>
                    <Typography component="h3" sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>{t.references}</Typography>
                    <Typography sx={{ color: "text.secondary", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
                      {refCount} {t.refTotal}
                    </Typography>
                  </Stack>
                  <ReferenceList references={answer.references} t={t} />
                </Box>
              )}
            </Paper>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
