"use client";
import { useEffect, useRef } from "react";
import { Box, Button, Chip, Drawer, IconButton, Link, Stack, Typography } from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";

import { useChatStore, type ChatState } from "@/lib/chat";
import { useInspector, type InspectorRef } from "@/lib/inspector";
import { useT } from "@/lib/prefs";
import { checkLabel, doiOf, httpUrl, paperLink } from "@/lib/refs";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

const find = (s: ChatState, r: InspectorRef | null) =>
  r ? s.sessions.find((x) => x.id === r.sessionId)?.turns.find((x) => x.id === r.turnId)?.answer?.references.find((x) => x.id === r.refId) : undefined;

function Body() {
  const t = useT();
  const r = useInspector((s) => s.ref);
  const close = useInspector((s) => s.close);
  const found = useChatStore((s) => find(s, r));
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, [r?.refId, r?.turnId]);
  useEffect(() => {
    if (!r) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [r, close]);
  if (!r || !found) return null;
  const p = found.paper, link = paperLink(p), doi = doiOf(p), hostUrl = httpUrl(p.url) ?? link, h = hostUrl ? host(hostUrl) : "";
  const ok = found.status === "verified";
  return (
    <Stack spacing={2} sx={{ p: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.03em", color: "text.secondary", pt: 1.5 }}>{t.inspectorTitle} [{found.id}]</Typography>
        <IconButton ref={btn} sx={{ minWidth: 44, minHeight: 44 }} aria-label={t.closeInspector} onClick={close}><CloseRoundedIcon /></IconButton>
      </Stack>
      <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", lineHeight: 1.45, overflowWrap: "anywhere" }}>{p.title}</Typography>
      <Box component="dl" sx={{ m: 0, display: "grid", gap: 1 }}>
        {([[t.authors, p.authors.join(", ")], [t.year, p.year ? String(p.year) : ""], [t.sourceHost, h], [t.doi, doi], [t.pmid, p.pmid?.trim() ?? ""]] as const).filter(([, v]) => v).map(([k, v]) => (
          <Box key={k}>
            <Box component="dt" sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{k}</Box>
            <Box component="dd" sx={{ m: 0, fontSize: "0.875rem", overflowWrap: "anywhere" }}>{v}</Box>
          </Box>
        ))}
      </Box>
      <Box>
        <Typography component="h3" sx={{ fontSize: "0.75rem", color: "text.secondary", mb: 0.75 }}>{t.idCheck}</Typography>
        <Chip size="small" variant="outlined" label={checkLabel(found, t)} sx={{ color: ok ? "evidence.verified" : found.status === "unknown" ? "evidence.unknown" : "evidence.unverified", borderColor: "currentColor" }} />
        <Typography sx={{ mt: 1, fontSize: "0.8125rem", lineHeight: 1.6, color: "text.secondary" }}>{t.idCheckNote}</Typography>
      </Box>
      {link && (
        <Box>
          <Button component={Link} href={link} target="_blank" rel="noopener noreferrer" variant="outlined" endIcon={<OpenInNewRoundedIcon />}>{t.openSource}</Button>
        </Box>
      )}
    </Stack>
  );
}

// panel: inline in the right column (>= lg). sheet: bottom drawer on narrow screens.
export function SourceInspector({ variant }: { variant: "panel" | "sheet" }) {
  const r = useInspector((s) => s.ref);
  const close = useInspector((s) => s.close);
  const t = useT();
  const found = useChatStore((s) => find(s, r));
  const open = !!found;
  useEffect(() => { if (r && !found) close(); }, [r, found, close]); // the source is gone (deleted chat/turn): leave nothing behind
  if (variant === "panel") return open ? <Body /> : null;
  return (
    <Drawer anchor="bottom" open={open} onClose={close} slotProps={{ paper: { sx: { maxHeight: "85dvh", borderTopLeftRadius: 16, borderTopRightRadius: 16 }, role: "dialog", "aria-label": t.inspectorTitle } }}>
      <Body />
    </Drawer>
  );
}
