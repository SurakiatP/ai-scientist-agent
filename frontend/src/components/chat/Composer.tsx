"use client";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Box, Button, CircularProgress, IconButton, InputBase, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { create } from "zustand";
import { useChatStore } from "@/lib/chat";
import { useStorageFull } from "@/lib/history";
import { isPdf, registerUpload, useAttach } from "@/lib/files";
import { ease, enterPop } from "@/lib/motion";
import { API_BASE } from "@/lib/config";
import { useT, usePrefs } from "@/lib/prefs";
import { PACK_IDS, packName, usablePack, type PackId } from "@/lib/packs";
import { canStart, startAnalysis, startDocs, startError, startRun, stopRun, useRunState } from "@/lib/run";
import { UploadError, uploadFile, type AskMode } from "@/lib/sse";
import { MAX_QUESTION, sampleQuestions, sampleQuestionsEn } from "@/lib/strings";

// Shared draft so starter chips / "ask follow-up" can fill the one composer. In memory only.
// Per session, so a draft never travels into (and sends from) another session.
export const useDraft = create<{ drafts: Record<string, string>; set: (sid: string, s: string) => void }>((set) => ({
  drafts: {},
  set: (sid, text) => set((d) => ({ drafts: { ...d.drafts, [sid]: text } })), // ponytail: empty strings linger until reload; negligible
}));
// The chosen mode is shared by every composer (first-message screen and thread), so Quick survives the first send. In memory only.
// A start that failed outside the composer (retry or edit of an earlier question): the composer says why, with the text back.
export const useStartErr = create<{ by: Record<string, string>; set: (sid: string, msg: string) => void }>((set) => ({
  by: {},
  set: (sid, msg) => set((d) => ({ by: { ...d.by, [sid]: msg } })),
}));
export const useMode = create<{ mode: AskMode; set: (m: AskMode) => void }>((set) => ({ mode: "deep", set: (mode) => set({ mode }) }));
// The chosen field pack per session (in memory); a session without a pick uses the pack of its latest non-chat turn, so a reload restores it. undefined = General.
export const usePack = create<{ by: Record<string, PackId | undefined>; set: (sid: string, p: PackId | undefined) => void }>((set) => ({
  by: {},
  set: (sid, p) => set((d) => ({ by: { ...d.by, [sid]: p } })),
}));
export const focusComposer = () => document.getElementById("composer")?.focus();

type Attached = { key: string; name: string; size: number; status: "uploading" | "ready" | "error"; fileId?: string; error?: string };
const ACCEPT = ".csv,.xlsx,.parquet,.json,.pdf";
const MAX_DOCS = 5; // the server takes 1-5 PDFs per question
const formatSize = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;

export function Composer({ sessionId, large = false }: { sessionId: string; large?: boolean }) {
  const t = useT();
  const text = useDraft((s) => s.drafts[sessionId] ?? ""), set = useDraft((s) => s.set);
  const startErr = useStartErr((s) => s.by[sessionId] ?? ""), clearStartErr = () => { if (startErr) useStartErr.getState().set(sessionId, ""); };
  const setText = (v: string) => { clearStartErr(); set(sessionId, v); };
  const [err, setErr0] = useState("");
  const setErr = (v: string) => { clearStartErr(); setErr0(v); };
  const picked = useMode((s) => s.mode), setMode = useMode((s) => s.set);
  // "Answer research" needs this session's own finished answers; without them the pill shows (and sends) deep
  const hasMemory = useChatStore((s) => !!s.sessions.find((x) => x.id === sessionId)?.turns.some((x) => x.status === "done" && !!x.answer?.content.trim()));
  const mode: AskMode = picked === "chat" && !hasMemory ? "deep" : picked;
  const lastPack = useChatStore((s) => usablePack([...(s.sessions.find((x) => x.id === sessionId)?.turns ?? [])].reverse().find((x) => x.mode !== "chat" && x.mode !== "docs")?.pack));
  const pack = usePack((s) => sessionId in s.by ? s.by[sessionId] : lastPack), setPack = usePack((s) => s.set), lang = usePrefs((s) => s.lang);
  const packOffId = useId();
  const packText = (p: PackId | undefined) => p ? packName(p, lang) : t.packGeneral;
  const modeName = (m: AskMode) => m === "deep" ? t.modeDeep : m === "chat" ? t.modeChat : t.modeQuick;
  const [attachOff, setAttachOff] = useState(false); // backend says uploads/analysis cannot work: say so instead of failing after the upload
  useEffect(() => {
    const ac = new AbortController();
    fetch(`${API_BASE}/v1/health`, { signal: ac.signal }).then((r) => r.json()).then((h) => { if (h?.analysis === "disabled" || h?.files === "unavailable") setAttachOff(true); }).catch(() => {}); // unreachable: fail open
    return () => ac.abort();
  }, []);
  const run = useRunState(sessionId);
  const full = useStorageFull();
  const [composing, setComposing] = useState(false);
  const [repro, setRepro] = useState(false); // documents only: ask for a reproduction plan of the attached paper
  const [modeAnchor, setModeAnchor] = useState<HTMLElement | null>(null);
  const [packAnchor, setPackAnchor] = useState<HTMLElement | null>(null);
  // Either one data file (analysis) or 1-5 PDFs (questions about documents), never both.
  const [files, setFiles] = useState<Attached[]>([]);
  const docs = files.length > 0 && files.every((f) => isPdf(f.name));
  const file = docs ? null : files[0] ?? null; // the data file, when that is what is attached
  const packOff = docs || (mode === "chat" && !file); // documents ignore packs; an analysis (file attached) uses the field even from answer mode
  const packOffText = docs ? t.packOffDocs : t.packOffChat;
  const picker = useRef<HTMLInputElement>(null);
  const uploads = useRef(new Map<string, AbortController>());
  useEffect(() => { const u = uploads.current, l = live.current; return () => { u.forEach((a) => a.abort()); l.clear(); }; }, []);
  const seq = useRef(0);
  const live = useRef(new Set<string>()); // keys still attached: an upload step for a chip removed meanwhile is skipped
  useEffect(() => { // a chip that left the list (removed, replaced, or never fitted) stops its upload
    for (const k of live.current) if (!files.some((f) => f.key === k)) { live.current.delete(k); uploads.current.get(k)?.abort(); uploads.current.delete(k); }
  }, [files]);
  const patchFile = (key: string, p: Partial<Attached>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const mine = !!run.turnId, busy = mine; // this session has a live run here; other sessions run on their own
  // icon pops only on a send<->stop change in this session, never on mount or session switch
  const [sw, setSw] = useState({ sid: sessionId, mine, anim: false });
  if (sw.sid !== sessionId || sw.mine !== mine) setSw({ sid: sessionId, mine, anim: sw.sid === sessionId });
  const over = text.length > MAX_QUESTION;
  const fileReady = files.every((f) => f.status === "ready" && !!f.fileId);
  const canSend = !busy && !over && fileReady && text.trim().length > 0;
  const removeAll = () => { uploads.current.forEach((a) => a.abort()); uploads.current.clear(); live.current.clear(); setFiles([]); };
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!chosen.length || busy) return;
    const pdfs = chosen.filter((f) => isPdf(f.name));
    if (pdfs.length && pdfs.length < chosen.length) { setErr(t.attachOneKind); return; }
    let next: File[];
    if (!pdfs.length) { removeAll(); next = chosen.slice(0, 1); } // one data file replaces whatever was attached
    else {
      const keep = docs ? files : []; // PDFs add to PDFs; a data file is replaced
      if (!docs) removeAll();
      next = pdfs.slice(0, MAX_DOCS - keep.length);
      setErr(pdfs.length > next.length ? t.docsMax : "");
    }
    if (!next.length) return;
    const added = next.map((f) => ({ f, a: { key: `k${++seq.current}`, name: f.name, size: f.size, status: "uploading" as const } }));
    added.forEach(({ a }) => live.current.add(a.key));
    setFiles((fs) => [...(pdfs.length && docs ? fs : []), ...added.map((x) => x.a)]);
    for (const { f, a } of added) {
      if (!live.current.has(a.key)) continue; // removed (or replaced) before its turn came
      const ac = new AbortController();
      uploads.current.set(a.key, ac);
      try {
        const up = await uploadFile(f, ac.signal);
        if (ac.signal.aborted) continue;
        patchFile(a.key, { status: "ready", fileId: up.id, name: up.name, size: up.size });
        registerUpload(up, useChatStore.getState().sessions.find((x) => x.id === sessionId)?.projectId); // the library keeps it even if the chip is removed
      } catch (e: unknown) {
        if (ac.signal.aborted) continue;
        patchFile(a.key, { status: "error", error: e instanceof UploadError ? e.message : t.uploadFailed });
      } finally {
        uploads.current.delete(a.key);
      }
    }
  };
  const handoff = useAttach((s) => s.file); // "Analyze" / "Ask about this document" from My files: already on the server, so no upload
  useEffect(() => {
    if (!handoff) return;
    const rest = useAttach.getState().rest ?? [];
    useAttach.setState({ file: null, rest: undefined });
    const incoming: Attached[] = [handoff, ...rest].map((h) => ({ key: `k${++seq.current}`, name: h.name, size: h.size, status: "ready", fileId: h.id }));
    const allDocs = incoming.every((f) => isPdf(f.name));
    incoming.forEach((a) => live.current.add(a.key)); // any that do not fit are pruned below with the files effect
    setFiles((cur) => {
      if (allDocs && cur.length > 0 && cur.every((f) => isPdf(f.name))) { // PDFs join the PDFs already attached; none is dropped
        const fresh = incoming.filter((n) => !cur.some((f) => f.fileId === n.fileId));
        return [...cur, ...fresh.slice(0, MAX_DOCS - cur.length)];
      }
      return allDocs ? incoming.slice(0, MAX_DOCS) : incoming.slice(0, 1);
    });
    const joins = allDocs && files.length > 0 && files.every((f) => isPdf(f.name));
    if ((joins ? incoming.filter((n) => !files.some((f) => f.fileId === n.fileId)).length + files.length : incoming.length) > MAX_DOCS && allDocs) setErr(t.docsMax); // the note, outside the updater
    setTimeout(focusComposer, 0);
  }, [handoff]); // eslint-disable-line react-hooks/exhaustive-deps -- reads the current files once per handoff
  const removeFile = (key: string) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    live.current.delete(key);
    setFiles((fs) => fs.filter((f) => f.key !== key));
    setErr("");
  };
  const send = () => {
    if (!canSend) return;
    const q = text.trim();
    if (!canStart(sessionId).ok) { setErr(t.busyElsewhere); return; } // text stays; never dropped silently
    setErr("");
    const attached = files;
    setText("");
    setFiles([]);
    const restore = (e: unknown) => {
      if ((e as { uncertain?: boolean })?.uncertain) { useStartErr.getState().set(sessionId, t.sendUncertain); return; } // it may be running: no draft to resend twice
      if (!useDraft.getState().drafts[sessionId]) set(sessionId, q); // restore unless the user already typed again
      if (attached.length) setFiles((cur) => (cur.length ? cur : attached));
      // through the store: the first message of an empty chat remounts this composer, and local state would be lost
      useStartErr.getState().set(sessionId, e instanceof Error && e.message === "busy" ? t.busyElsewhere : startError(e) ?? t.startFailed);
    };
    if (docs && attached.length) startDocs(sessionId, q, attached.map((f) => ({ id: f.fileId!, name: f.name })), repro ? "reproduce" : "answer").catch(restore);
    else if (attached[0]?.status === "ready" && attached[0].fileId) startAnalysis(sessionId, q, attached[0].fileId, attached[0].name, pack).catch(restore);
    else startRun(sessionId, q, { mode, pack }).catch(restore);
  };
  const example = large && !docs && !file ? (lang === "en" ? sampleQuestionsEn : sampleQuestions)[0] : ""; // the home composer shows a real question and Tab takes it
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab" && !e.shiftKey && example && !text) { e.preventDefault(); setText(example); return; } // empty only: with text, Tab leaves the field as usual
    if (e.key !== "Enter" || e.shiftKey || composing || e.nativeEvent.isComposing || e.keyCode === 229) return; // 229: IME (Safari fires keydown after compositionend)
    e.preventDefault();
    send();
  };
  const note = over ? t.tooLong : err || startErr || (files.find((f) => f.status === "error")?.error || (files.some((f) => f.status === "error") ? t.uploadFailed : "") || (docs ? t.docsModeNote : file?.status === "ready" ? t.analysisModeNote : ""));
  const counter = text.length >= MAX_QUESTION * 0.8;
  const attachButton = (
    <IconButton aria-label={t.attach} title={attachOff ? t.attachUnavailable : undefined} onClick={() => picker.current?.click()} disabled={busy || attachOff} sx={{ minWidth: 44, minHeight: 44, color: "text.secondary" }}>
      {large ? <AddRoundedIcon /> : <AttachFileRoundedIcon sx={{ transform: "rotate(45deg)" }} />}
    </IconButton>
  );
  return (
    <Box sx={{ width: "100%" }}>
      <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={pick} />
      <Box sx={{
        display: "flex", alignItems: "stretch", bgcolor: "background.paper", border: 1, borderRadius: large ? { xs: "22px", sm: "28px" } : { xs: 3, sm: 4 },
        borderColor: large ? "color-mix(in srgb, var(--mui-palette-divider) 55%, transparent)" : "divider",
        // the home composer is the page's one object: lifted off the paper with a long, soft navy shadow
        boxShadow: large ? "0 30px 60px -30px rgb(28 78 143 / 0.4), 0 2px 10px -4px rgb(14 26 44 / 0.08)" : "none",
        transition: `border-color 180ms ${ease}, box-shadow 180ms ${ease}`,
        "&:focus-within": large
          ? { borderColor: "color-mix(in srgb, var(--mui-palette-primary-main) 55%, transparent)", boxShadow: "0 30px 60px -28px rgb(28 78 143 / 0.5), 0 0 0 4px rgb(var(--mui-palette-primary-mainChannel) / 0.08)" }
          : { borderColor: "primary.main", boxShadow: "0 0 0 1px var(--mui-palette-primary-main), 0 0 28px color-mix(in srgb, var(--mui-palette-primary-main) 28%, transparent)" },
      }}>
        {!large && <Box sx={{ display: "flex", alignItems: "flex-end", borderRight: 1, borderColor: "divider", px: 0.75, py: 0.75, my: 0.5 }}>{attachButton}</Box>}
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 0.5, py: large ? 1.5 : 1.25, pl: large ? 2 : 1.5, pr: large ? 1.5 : 1 }}> {/* py matches the attach column (my 0.5 + py 0.75) so both centre on the same line */}
          {files.map((f) => (
            <Box key={f.key} sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 44, px: 1, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.shell" }}>
              <DescriptionOutlinedIcon fontSize="small" sx={{ color: f.status === "error" ? "error.main" : "primary.main", flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.name}>{f.name}</Typography>
                <Typography component="span" aria-live="polite" sx={{ display: "block", fontSize: "0.6875rem", lineHeight: 1.5, color: f.status === "error" ? "error.main" : "text.secondary" }}>
                  {f.status === "uploading" ? t.uploadingFile : f.status === "error" ? t.uploadFailed : formatSize(f.size)}
                </Typography>
              </Box>
              {f.status === "uploading" && <CircularProgress size={16} sx={{ flexShrink: 0 }} aria-hidden />}
              <IconButton aria-label={`${t.removeFile}: ${f.name}`} onClick={() => removeFile(f.key)} size="small" sx={{ minWidth: 44, minHeight: 44, flexShrink: 0 }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Box sx={{ display: "flex", flexWrap: large ? "wrap" : { xs: "wrap", sm: "nowrap" }, alignItems: "center", columnGap: 1, rowGap: large ? 1.5 : 0.5 }}>
            <InputBase
              id="composer" multiline fullWidth minRows={large ? 2 : 1} maxRows={10} value={text}
              placeholder={docs ? t.docsPlaceholder : file ? t.analysisPlaceholder : example ? t.examplePrefix + example : t.askPlaceholder} onChange={(e) => { setText(e.target.value); setErr(""); }} onKeyDown={onKeyDown}
              onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
              slotProps={{ input: { "aria-label": t.composerLabel, "aria-describedby": "composer-note" } }}
              sx={{ flex: large ? "1 1 100%" : { xs: "1 1 100%", sm: "1 1 0" }, minWidth: 0, minHeight: 44, px: 0.5, py: 0, fontSize: large ? "1.0625rem" : "1rem", lineHeight: 1.6, alignItems: large ? "flex-start" : "center", "& textarea": { py: "9px" }, "& textarea::placeholder": { color: "text.secondary", opacity: 1 } }}
            />
            {large && <Box sx={{ ml: -1 }}>{attachButton}</Box>}
            {counter && (
              <Typography sx={{ fontSize: "0.75rem", fontVariantNumeric: "tabular-nums", color: over ? "error.main" : "text.secondary", alignSelf: "center" }}>
                {text.length}/{MAX_QUESTION}
              </Typography>
            )}
            <Box sx={{ flex: { xs: 1, sm: "none" } }} />
            {/* deep research = solid fill (the user must see at a glance it is the heavier mode); general search stays outlined */}
            {docs ? ( // fixed: PDFs always answer from the documents, so there is nothing to choose
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, borderRadius: 99, border: 1, borderColor: "primary.main", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)", color: "text.primary", fontSize: "0.875rem", fontWeight: 600, px: 1.5, minHeight: 36, flexShrink: 0, alignSelf: "center", whiteSpace: "nowrap" }}>
                <DescriptionOutlinedIcon sx={{ fontSize: 20, color: "primary.main" }} aria-hidden />{t.modeDocs}
              </Box>
            ) : null}
            {docs ? (
              <Button color="inherit" size="small" variant={repro ? "contained" : "outlined"} aria-pressed={repro} title={t.reproduceHint} onClick={() => setRepro((v) => !v)}
                sx={{ borderRadius: 99, fontSize: "0.875rem", px: 1.5, minHeight: 36, flexShrink: 0, alignSelf: "center", whiteSpace: "nowrap", boxShadow: "none" }}>{t.reproduceToggle}</Button>
            ) : <Button color="inherit" variant={mode === "deep" ? "contained" : "outlined"} disabled={!!file} aria-haspopup="menu" aria-expanded={!!modeAnchor}
              aria-label={`${t.modeLabel}: ${modeName(mode)}`} onClick={(e) => setModeAnchor(e.currentTarget)}
              startIcon={mode === "chat" ? <ChatBubbleOutlineRoundedIcon sx={{ color: "primary.main" }} /> : <LayersOutlinedIcon sx={{ color: mode === "deep" ? "inherit" : "primary.main" }} />} endIcon={<ExpandMoreRoundedIcon />}
              sx={{
                borderRadius: 99, fontSize: "0.875rem", px: 1.5, flexShrink: 0, alignSelf: "center", whiteSpace: "nowrap",
                ...(mode === "deep"
                  ? { bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 600, boxShadow: "none", border: 1, borderColor: "primary.main",
                      "&:hover": { bgcolor: "primary.dark", boxShadow: "none" },
                      "&.Mui-disabled": { bgcolor: "action.disabledBackground", color: "text.disabled", borderColor: "transparent" } }
                  : mode === "chat"
                    ? { borderColor: "primary.main", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)", color: "text.primary", fontWeight: 600,
                        "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 22%, transparent)", borderColor: "primary.main" } }
                    : { borderColor: "divider", fontWeight: 400 }),
              }}>
              {modeName(mode)}
            </Button>}
            <Menu anchorEl={modeAnchor} open={!!modeAnchor} onClose={() => setModeAnchor(null)} slotProps={{ list: { "aria-label": t.chooseMode } }}>
              {(["deep", "quick", "chat"] as const).map((m) => {
                const off = m === "chat" && !hasMemory;
                return (
                  <MenuItem key={m} selected={m === mode} disabled={off} role="menuitemradio" aria-checked={m === mode} aria-disabled={off} sx={{ minHeight: 44, display: "block", whiteSpace: "normal", "&.Mui-disabled": { opacity: 1, color: "text.secondary" } }}
                    onClick={() => { setMode(m); setModeAnchor(null); }}>
                    {modeName(m)}
                    {m === "chat" && <Typography component="span" sx={{ display: "block", fontSize: "0.75rem", color: "text.secondary" }}>{off ? t.modeChatDisabled : t.modeChatHint}</Typography>}
                  </MenuItem>
                );
              })}
            </Menu>
            {/* the field: same chip + menu pattern as the mode; outlined = General, tinted = a field is set. Answer-from-memory searches nothing, so it has no field */}
            <Tooltip title={packOff ? packOffText : ""}>
              <Button color="inherit" variant="outlined" aria-disabled={packOff || undefined} aria-haspopup="menu" aria-expanded={!!packAnchor} aria-describedby={packOff ? packOffId : undefined}
                aria-label={`${t.packLabel}: ${packText(pack)}`} onClick={(e) => { if (!packOff) setPackAnchor(e.currentTarget); }}
                startIcon={<ScienceOutlinedIcon sx={{ color: packOff ? "inherit" : "primary.main" }} />} endIcon={<ExpandMoreRoundedIcon />}
                sx={{
                  borderRadius: 99, fontSize: "0.875rem", px: 1.5, flexShrink: 0, alignSelf: "center", whiteSpace: "nowrap", maxWidth: { xs: 190, sm: 240 },
                  "& .MuiButton-startIcon": { mr: large ? { xs: 0, sm: 0.5 } : 0.5 }, "& .MuiButton-endIcon": { ml: 0.5 }, ...(large && { minWidth: { xs: 0 } }),
                  ...(packOff
                    ? { bgcolor: "action.disabledBackground", color: "text.disabled", borderColor: "transparent", fontWeight: 400, cursor: "default", "&:hover": { bgcolor: "action.disabledBackground", borderColor: "transparent" } }
                    : pack
                      ? { borderColor: "primary.main", bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)", color: "text.primary", fontWeight: 600,
                          "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 22%, transparent)", borderColor: "primary.main" } }
                      : { borderColor: "divider", fontWeight: 400 }),
                }}>
                {/* on a phone the home composer keeps one row of controls: the field chip shows its icon only (its name stays in aria-label) */}
                <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", display: large ? { xs: "none", sm: "inline" } : "inline" }}>{packText(pack)}</Box>
              </Button>
            </Tooltip>
            {packOff && <Box id={packOffId} component="span" hidden>{packOffText}</Box>}
            <Menu anchorEl={packAnchor} open={!!packAnchor} onClose={() => setPackAnchor(null)} slotProps={{ list: { "aria-label": t.choosePack } }}>
              {([undefined, ...PACK_IDS] as (PackId | undefined)[]).map((p) => (
                <MenuItem key={p ?? "general"} selected={p === pack} role="menuitemradio" aria-checked={p === pack} sx={{ minHeight: 44 }}
                  onClick={() => { setPack(sessionId, p); setPackAnchor(null); }}>
                  {packText(p)}
                </MenuItem>
              ))}
            </Menu>
            <IconButton aria-label={mine ? t.stop : t.ask} onClick={(e) => { if (!mine) send(); else if (e.detail < 2) void stopRun(sessionId).then((ok) => setErr(ok ? "" : t.stopFailed)); }} /* a double-click on Send must not land on Stop */ disabled={!mine && !canSend}
              sx={{ width: 44, height: 44, alignSelf: "center", flexShrink: 0, bgcolor: "primary.main", color: "primary.contrastText", transition: `background-color 160ms ${ease}`, "&:hover": { bgcolor: "primary.dark" }, "&.Mui-disabled": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 35%, transparent)", color: "primary.contrastText" } }}>
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
