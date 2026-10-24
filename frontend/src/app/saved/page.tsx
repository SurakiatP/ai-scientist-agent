"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, IconButton, Paper, Stack, Tab, Tabs, Typography,
} from "@mui/material";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkAddedRoundedIcon from "@mui/icons-material/BookmarkAddedRounded";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useHistoryStore, useHydrated } from "@/lib/history";
import { strings } from "@/lib/strings";
import { AnswerView } from "@/components/AnswerView";
import { ReferenceList } from "@/components/ReferenceList";
import { palette } from "@/theme";

const t = strings.th;

export default function SavedPage() {
  const hydrated = useHydrated();
  const { items, toggleSaved, remove, clear } = useHistoryStore();
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<"saved" | "history">("saved");
  const [open, setOpen] = useState<string | false>(false); // one open at a time: reference anchors (#ref-N) stay unique
  const shown = hydrated ? (tab === "saved" ? items.filter((i) => i.savedAt) : items) : [];

  // Sidebar recents link to /saved#item-<id>; open (and highlight) that note on arrival.
  useEffect(() => {
    const fromHash = () => {
      const m = /^#item-(.+)$/.exec(window.location.hash);
      if (m) setOpen(decodeURIComponent(m[1]));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <Box sx={{ mx: "auto", maxWidth: 900, px: { xs: 2.5, sm: 4, lg: 5 }, py: { xs: 4, md: 6 } }}>
      <Stack spacing={{ xs: 3, md: 4 }}>
        <Box>
          <Typography component="h1" sx={{ fontSize: { xs: "1.75rem", md: "2rem" }, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
            {t.savedTitle}
          </Typography>
          <Typography sx={{ mt: 1, maxWidth: "62ch", color: "text.secondary", fontSize: "0.9375rem", lineHeight: 1.75 }}>
            {t.localNote}
          </Typography>
        </Box>

        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 44 }}>
            <Tab value="saved" label={t.tabSaved} />
            <Tab value="history" label={t.tabHistory} />
          </Tabs>
          {hydrated && items.length > 0 && (
            <Button color="inherit" onClick={() => setConfirming(true)} startIcon={<DeleteOutlineIcon />} sx={{ color: "text.secondary", flexShrink: 0 }}>
              {t.clearAll}
            </Button>
          )}
        </Stack>

        {hydrated && shown.length === 0 && (
          <Box sx={{ py: 6, px: 3, textAlign: "center", border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "background.paper" }}>
            <BookmarkBorderIcon sx={{ fontSize: 30, color: "text.secondary" }} />
            <Typography sx={{ mt: 1, fontWeight: 600 }}>{tab === "saved" ? t.emptySaved : t.emptyHistory}</Typography>
            <Button component={Link} href="/ask" variant="outlined" sx={{ mt: 2 }}>{t.title}</Button>
          </Box>
        )}

        <Stack spacing={1.25}>
          {shown.map((i) => (
            <Paper key={i.id} id={`item-${i.id}`} sx={{ borderRadius: 2, overflow: "hidden", scrollMarginTop: 80, "&:target": { borderColor: palette.teal } }}>
              <Accordion expanded={open === i.id} onChange={(_, x) => setOpen(x ? i.id : false)} disableGutters elevation={0}
                sx={{ border: 0, borderRadius: 2, bgcolor: "transparent" }}>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: "text.secondary" }} />} sx={{ px: { xs: 2, md: 2.5 }, py: 0.5 }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0, borderRadius: 1, border: 1, borderColor: "divider", color: i.savedAt ? palette.primary : "text.secondary", bgcolor: i.savedAt ? palette.primaryLight : "transparent" }}>
                      {i.savedAt ? <BookmarkAddedRoundedIcon sx={{ fontSize: 16 }} /> : <BookmarkBorderIcon sx={{ fontSize: 16 }} />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.55, overflowWrap: "anywhere" }}>{i.question}</Typography>
                      <Typography sx={{ mt: 0.5, color: "text.secondary", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
                        {new Date(i.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                        {i.references.length > 0 ? ` · ${i.references.length} ${t.refTotal}` : ""}
                      </Typography>
                    </Box>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails sx={{ px: { xs: 2, md: 2.5 }, pt: 0, pb: 2.5 }}>
                  <Stack spacing={2}>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-end", gap: 0.5, pt: 1, borderTop: 1, borderColor: "divider" }}>
                      <IconButton aria-label={i.savedAt ? t.unsave : t.save} aria-pressed={!!i.savedAt} onClick={() => toggleSaved(i.id)} sx={{ color: i.savedAt ? palette.primary : "text.secondary" }}>
                        {i.savedAt ? <BookmarkIcon /> : <BookmarkBorderIcon />}
                      </IconButton>
                      <IconButton aria-label={t.removeItem} onClick={() => remove(i.id)}>
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Stack>
                    <Box sx={{ px: { xs: 0.5, md: 1 } }}><AnswerView content={i.answer} references={i.references} /></Box>
                    {i.references.length > 0 && (
                      <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
                        <Typography component="h2" sx={{ mb: 0.5, fontWeight: 700, fontSize: "0.875rem" }}>{t.references}</Typography>
                        <ReferenceList references={i.references} t={t} />
                      </Box>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Paper>
          ))}
        </Stack>
      </Stack>

      <Dialog open={confirming} onClose={() => setConfirming(false)} aria-labelledby="clear-title" aria-describedby="clear-desc">
        <DialogTitle id="clear-title">{t.confirmClearTitle}</DialogTitle>
        <DialogContent><DialogContentText id="clear-desc">{t.confirmClear}</DialogContentText></DialogContent>
        <DialogActions>
          <Button autoFocus onClick={() => setConfirming(false)}>{t.cancel}</Button>
          <Button color="error" onClick={() => { clear(); setConfirming(false); }}>{t.confirm}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
