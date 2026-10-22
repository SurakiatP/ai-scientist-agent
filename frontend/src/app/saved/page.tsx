"use client";
import { useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Container, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { useHistoryStore, useHydrated } from "@/lib/history";
import { strings } from "@/lib/strings";
import { AnswerView } from "@/components/AnswerView";
import { ReferenceList } from "@/components/ReferenceList";

const t = strings.th;

export default function SavedPage() {
  const hydrated = useHydrated();
  const { items, toggleSaved, remove, clear } = useHistoryStore();
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<"saved" | "history">("saved");
  const [open, setOpen] = useState<string | false>(false); // one open at a time: reference anchors (#ref-N) stay unique
  const shown = hydrated ? (tab === "saved" ? items.filter((i) => i.savedAt) : items) : [];

  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>{t.savedTitle}</Typography>
          <Typography sx={{ color: "text.secondary", mt: 1 }}>{t.localNote}</Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab value="saved" label={t.tabSaved} />
            <Tab value="history" label={t.tabHistory} />
          </Tabs>
          {hydrated && items.length > 0 && (
            <Button color="inherit" onClick={() => setConfirming(true)}>{t.clearAll}</Button>
          )}
        </Stack>
        {hydrated && shown.length === 0 && <Alert severity="info">{tab === "saved" ? t.emptySaved : t.emptyHistory}</Alert>}
        <Stack spacing={1.5}>
          {shown.map((i) => (
            <Accordion key={i.id} expanded={open === i.id} onChange={(_, x) => setOpen(x ? i.id : false)} disableGutters>
              <AccordionSummary>
                <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{i.question}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                    <IconButton aria-label={i.savedAt ? t.unsave : t.save} aria-pressed={!!i.savedAt} color={i.savedAt ? "primary" : "default"} onClick={() => toggleSaved(i.id)}>
                      {i.savedAt ? <BookmarkIcon /> : <BookmarkBorderIcon />}
                    </IconButton>
                    <IconButton aria-label={t.removeItem} onClick={() => remove(i.id)}><DeleteOutlineIcon /></IconButton>
                  </Stack>
                  <Paper variant="outlined" sx={{ p: 2 }}><AnswerView content={i.answer} references={i.references} /></Paper>
                  {i.references.length > 0 && <ReferenceList references={i.references} t={t} />}
                </Stack>
              </AccordionDetails>
            </Accordion>
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
    </Container>
  );
}
