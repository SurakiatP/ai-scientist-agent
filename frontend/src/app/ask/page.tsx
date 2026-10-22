"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from "@mui/material";
import { streamAsk, type Reference } from "@/lib/sse";
import { MAX_QUESTION, strings } from "@/lib/strings";
import { AnswerView } from "@/components/AnswerView";
import { emptyProgress, ProgressPanel, reduce, type Progress } from "@/components/ProgressPanel";
import { ReferenceList } from "@/components/ReferenceList";

const t = strings.th; // ponytail: Thai default; add a language switch when needed (strings.en exists)

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [answer, setAnswer] = useState<{ content: string; references: Reference[] } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const ac = useRef<AbortController | null>(null);
  useEffect(() => () => ac.current?.abort(), []);

  const tooLong = question.length > MAX_QUESTION;
  const canAsk = !running && question.trim().length > 0 && !tooLong;

  async function ask() {
    if (!canAsk) return;
    const c = new AbortController();
    ac.current = c;
    setRunning(true); setStarted(true); setStopped(false);
    setProgress(emptyProgress); setAnswer(null); setRefused(null); setError(null);
    let terminal = false;
    for await (const e of streamAsk(question.trim(), c.signal)) {
      if (e.type === "refused") { terminal = true; setRefused(e.reason); }
      else if (e.type === "error") {
        terminal = true;
        const m = e.code === "network" ? t.network : e.code === "malformed" ? t.malformed : e.code === "http" ? `${t.requestFailed}${e.message ? `: ${e.message}` : ""}` : e.message;
        setError(m);
      } else if (e.type === "complete") terminal = true;
      else if (e.type === "final_answer") { terminal = true; setAnswer({ content: e.content, references: e.references }); }
      setProgress((p) => reduce(p, e));
    }
    if (c.signal.aborted) setStopped(true);
    else if (!terminal) setError(t.cutOff); // stream ended with no complete/error/refused
    setRunning(false);
  }

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>{t.title}</Typography>
          <Typography sx={{ color: "text.secondary", mt: 1 }}>{t.subtitle}</Typography>
        </Box>
        <Stack spacing={2}>
          <TextField
            multiline minRows={3} fullWidth value={question} placeholder={t.placeholder}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(); } }}
            error={tooLong} helperText={tooLong ? t.tooLong : `${question.length}/${MAX_QUESTION}`}
            slotProps={{ htmlInput: { "aria-label": t.title } }}
          />
          <Stack direction="row" spacing={1.5}>
            <Button variant="contained" size="large" disabled={!canAsk} onClick={ask}>{t.ask}</Button>
            {running && <Button variant="outlined" size="large" onClick={() => ac.current?.abort()}>{t.stop}</Button>}
          </Stack>
        </Stack>

        {started && !refused && (
          <Paper sx={{ p: 3 }}><ProgressPanel p={progress} running={running} t={t} /></Paper>
        )}
        {stopped && <Alert severity="info">{t.stopped}</Alert>}
        {refused && (
          <Alert severity="info">
            <Typography sx={{ fontWeight: 600 }}>{t.refused}</Typography>
            <Typography variant="body2">{refused}</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>{t.refusedHelp}</Typography>
          </Alert>
        )}
        {error && <Alert severity="error"><strong>{t.error}</strong>: {error}</Alert>}
        {answer && (
          <>
            <Paper sx={{ p: { xs: 2.5, md: 4 } }}>
              <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t.answer}</Typography>
              <AnswerView content={answer.content} references={answer.references} />
            </Paper>
            {answer.references.length > 0 && (
              <Box>
                <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>{t.references}</Typography>
                <ReferenceList references={answer.references} t={t} />
              </Box>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
