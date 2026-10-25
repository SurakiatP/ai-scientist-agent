"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from "@mui/material";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { srOnly } from "@/lib/config";
import { useHydrated } from "@/lib/history";
import { enterRow, skeletonBar } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { refreshAfterTrashAction, storeCall, useSync, validId } from "@/lib/sync";

export const TRASH_DAYS = 7;
type Kind = "session" | "project" | "file";
type Item = { kind: Kind; id: string; name: string; deletedAt: number };
const DAY = 86_400_000;
const PLURAL = { session: "sessions", project: "projects", file: "files" } as const;

const parse = (b: Record<string, unknown>, untitled: string): Item[] => {
  const out: Item[] = [];
  for (const kind of ["session", "project", "file"] as const) {
    const rows = b[PLURAL[kind]];
    if (!Array.isArray(rows)) continue;
    for (const r of rows as Record<string, unknown>[]) {
      if (typeof r?.id !== "string" || !validId(kind, r.id)) continue;
      const name = String(kind === "session" ? r.title || untitled : r.name ?? "").slice(0, 200);
      out.push({ kind, id: r.id, name, deletedAt: Date.parse(String(r.deleted_at)) || Date.now() });
    }
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
};

export function TrashPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const hydrated = useHydrated();
  const status = useSync((s) => s.status), rev = useSync((s) => s.rev);
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0); // age is measured against the moment the list was fetched
  const heading = useRef<HTMLHeadingElement>(null);
  const cards = useMediaQuery("(max-width:899.95px)");
  const off = hydrated && status === "disabled";

  const load = useCallback(async () => {
    try { const b = await storeCall("GET", "/v1/store/trash"); setNow(Date.now()); setItems(parse(b, t.untitled)); setState("ok"); } catch { setState("error"); }
  }, [t.untitled]);
  useEffect(() => { if (hydrated && status !== "disabled" && status !== "connecting") void load(); }, [hydrated, status, rev, load]); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on mount and whenever sync reports a change

  const act = async (fn: () => Promise<unknown>, done: string) => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: done }); await Promise.all([load(), refreshAfterTrashAction()]); heading.current?.focus(); } catch { setMsg({ ok: false, text: t.trashActionError }); }
    setBusy(false); setConfirm(null);
  };
  const restore = (i: Item) => act(() => storeCall("POST", `/v1/store/${PLURAL[i.kind]}/${i.id}/restore`), t.trashRestored);
  const forever = (i: Item) => act(() => storeCall("DELETE", `/v1/store/${PLURAL[i.kind]}/${i.id}?permanent=1`), t.trashDeleted);
  const purge = () => act(() => storeCall("POST", "/v1/store/trash/purge"), t.trashPurged);

  const typeLabel = (k: Kind) => ({ session: t.trashTypeChat, project: t.trashTypeProject, file: t.trashTypeFile })[k];
  const left = (i: Item) => { const d = Math.ceil((i.deletedAt + TRASH_DAYS * DAY - now) / DAY); return d <= 1 ? t.trashLastDay : t.trashDaysLeft.replace("{n}", String(d)); };
  const when = (ms: number) => new Date(ms).toLocaleString(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const actions = (i: Item) => confirm === i.id ? (
    <Box role="group" aria-label={t.trashDeleteConfirm.replace("{name}", i.name)} sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center", justifyContent: "flex-end" }}>
      <Typography sx={{ fontSize: "0.8125rem", flexBasis: "100%", textAlign: { sm: "right" } }}>{t.trashDeleteConfirm.replace("{name}", i.name)}</Typography>
      <Button color="error" variant="contained" autoFocus disabled={busy} onClick={() => void forever(i)} sx={{ minHeight: 44 }}>{t.confirm}</Button>
      <Button color="inherit" onClick={() => setConfirm(null)} sx={{ minHeight: 44 }}>{t.cancel}</Button>
    </Box>
  ) : (
    <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end", flexWrap: "wrap" }}>
      <Button variant="outlined" disabled={busy} onClick={() => void restore(i)} sx={{ minHeight: 44, borderColor: "primary.main" }}>{t.trashRestore}</Button>
      <Button color="error" disabled={busy} onClick={() => setConfirm(i.id)} sx={{ minHeight: 44 }}>{t.trashDeleteForever}</Button>
    </Box>
  );
  const th = { fontSize: "0.75rem", fontWeight: 700, color: "text.secondary", whiteSpace: "nowrap", bgcolor: "action.hover", borderColor: "divider" } as const;

  return (
    <Box component="main" id="main" sx={{ maxWidth: 1000, mx: "auto", px: { xs: 2, sm: 3 }, py: { xs: 2, md: 3 } }}>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, mb: 2.5 }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography ref={heading} tabIndex={-1} component="h1" sx={{ fontSize: "1.5rem", fontWeight: 700, outline: 0 }}>{t.trashTitle}</Typography>
          <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: "0.9375rem" }}>{t.trashNote}</Typography>
        </Box>
        {!off && <Button variant="outlined" disabled={busy || state !== "ok"} onClick={() => void purge()} sx={{ minHeight: 44, borderRadius: 2 }}>{t.trashPurge}</Button>}
      </Box>
      <Box role="status" aria-live="polite" sx={msg ? { mb: 2 } : srOnly}>{msg && <Alert severity={msg.ok ? "success" : "error"} variant="outlined">{msg.text}</Alert>}</Box>
      {off ? <Typography role="status" sx={{ py: 4, textAlign: "center", color: "text.secondary", border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 3 }}>{t.trashOff}</Typography>
        : state === "error" ? (
          <Alert severity="error" variant="outlined" action={<Button color="inherit" onClick={() => { setState("loading"); void load(); }} sx={{ minHeight: 44 }}>{t.retry}</Button>}>{t.trashError}</Alert>
        ) : state === "loading" || !hydrated ? (
          <Box role="status" aria-label={t.trashLoading} sx={{ display: "grid", gap: 1.5 }}>
            {[0, 1, 2, 3].map((i) => <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2, display: "grid", gap: 1 }}><Box sx={{ ...skeletonBar(i), width: `${60 - i * 8}%` }} /><Box sx={{ ...skeletonBar(i + 1), width: "30%", height: 10 }} /></Box>)}
          </Box>
        ) : !items?.length ? (
          <Box sx={{ py: 6, textAlign: "center", border: 1, borderColor: "divider", borderStyle: "dashed", borderRadius: 3, color: "text.secondary" }}>
            <DeleteOutlineRoundedIcon aria-hidden sx={{ fontSize: 40, opacity: 0.7 }} />
            <Typography role="status" sx={{ mt: 1, fontWeight: 600, color: "text.primary" }}>{t.trashEmpty}</Typography>
            <Typography sx={{ fontSize: "0.9375rem" }}>{t.trashEmptyNote}</Typography>
          </Box>
        ) : cards ? (
          <Box component="ul" aria-label={t.trashTitle} sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 1 }}>
            {items.map((i, n) => (
              <Box component="li" key={i.kind + i.id} sx={{ ...enterRow(n), p: 2, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper", display: "grid", gap: 1 }}>
                <Typography title={i.name} sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{i.name}</Typography>
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{`${typeLabel(i.kind)} · ${when(i.deletedAt)} · ${left(i)}`}</Typography>
                {actions(i)}
              </Box>
            ))}
          </Box>
        ) : (
          <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper" }}>
            <Table aria-label={t.trashTitle}>
              <TableHead><TableRow>
                <TableCell sx={th}>{t.trashColName}</TableCell><TableCell sx={th}>{t.trashColType}</TableCell><TableCell sx={th}>{t.trashColDeleted}</TableCell><TableCell sx={th}>{t.trashColLeft}</TableCell>
                <TableCell sx={th}><Box component="span" sx={srOnly}>{t.colActions}</Box></TableCell>
              </TableRow></TableHead>
              <TableBody>
                {items.map((i, n) => (
                  <TableRow key={i.kind + i.id} sx={{ ...enterRow(n), "&:last-child td": { borderBottom: 0 } }}>
                    <TableCell sx={{ maxWidth: 280, borderColor: "divider" }}><Typography noWrap title={i.name} sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{i.name}</Typography></TableCell>
                    <TableCell sx={{ borderColor: "divider" }}><Chip size="small" variant="outlined" label={typeLabel(i.kind)} /></TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", borderColor: "divider" }}>{when(i.deletedAt)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", borderColor: "divider" }}>{left(i)}</TableCell>
                    <TableCell align="right" sx={{ borderColor: "divider", minWidth: 250 }}>{actions(i)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
    </Box>
  );
}
