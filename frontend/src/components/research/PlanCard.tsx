"use client";
import { useRef, useState } from "react";
import { Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useT } from "@/lib/prefs";
import { enterRise } from "@/lib/motion";

export type PlanSearch = { term: string; instructions: string };
export const MAX_PLAN = 5;

const THAI = /[\u0E00-\u0E7F]/;

type Row = { id: number; term: string; instructions: string; added?: boolean };

function Badge({ n }: { n: number }) {
  return (
    <Box component="span" sx={{
      flexShrink: 0, width: 24, height: 24, mt: "2px", borderRadius: "50%", border: 1, borderColor: "divider",
      display: "grid", placeItems: "center", fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums",
    }}>{n + 1}</Box>
  );
}

export function PlanCard({ searches, editable, heading, onApprove, onCancel }: {
  searches: PlanSearch[];
  editable: boolean;
  /** Card title; defaults to the editable-plan wording. Read-only use (the approved plan) passes its own. */
  heading?: string;
  onApprove: (plan: PlanSearch[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const nextId = useRef(searches.length);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [attempted, setAttempted] = useState(false);
  const editing = rows !== null && editable;

  const edit = () => {
    setAttempted(false);
    nextId.current = searches.length;
    setRows((searches.length ? searches : [{ term: "", instructions: "" }]).map((s, i) => ({ id: i, term: s.term, instructions: s.instructions })));
  };

  const leave = () => setRows(null);
  const addRow = () => setRows((rs) => (rs && rs.length < MAX_PLAN ? [...rs, { id: nextId.current++, term: "", instructions: "", added: true }] : rs));
  const removeRow = (id: number) => setRows((rs) => (rs && rs.length > 1 ? rs.filter((x) => x.id !== id) : rs));

  const problem = (r: Row) => (r.term.trim() === "" ? t.planTermRequired : THAI.test(r.term.trim()) ? t.planTermEnglish : "");
  const blocked = (r: Row) => r.term.trim() === "" || THAI.test(r.term.trim());

  const start = () => {
    if (rows && rows.some(blocked)) { setAttempted(true); return; }
    if (rows) onApprove(rows.map((r) => ({ term: r.term.trim(), instructions: r.instructions.trim() })));
  };

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "surface.raised", p: { xs: 1.5, sm: 2 } }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
          <Typography component="h3" sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>{heading ?? t.planEditableTitle}</Typography>
          {editable && !editing && (
            <Button variant="outlined" size="small" color="inherit" startIcon={<EditOutlinedIcon fontSize="small" />} sx={{ minHeight: 44, borderColor: "divider", color: "text.primary" }} onClick={edit}>
              {t.editPlan}
            </Button>
          )}
        </Stack>

        {editing ? (
          <Stack role="group" aria-label={t.planEditableTitle} spacing={1.25}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); leave(); } }}>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1.25 }}>
              {rows.map((r, i) => {
                const msg = attempted ? problem(r) : "";
                return (
                  <Box component="li" key={r.id} sx={{ ...(r.added ? enterRise : {}) }}>
                    <Stack direction="row" useFlexGap sx={{ alignItems: "flex-start", gap: 1 }}>
                      <Badge n={i} />
                      <Box sx={{ flex: "1 1 200px", minWidth: 0, display: "grid", gap: 1 }}>
                        <TextField size="small" required autoFocus={i === 0} label={t.planTerm} value={r.term}
                          error={!!msg} helperText={msg || undefined}
                          onChange={(e) => setRows((rs) => rs!.map((x) => (x.id === r.id ? { ...x, term: e.target.value } : x)))} />
                        <TextField size="small" label={t.planInstructions} value={r.instructions}
                          onChange={(e) => setRows((rs) => rs!.map((x) => (x.id === r.id ? { ...x, instructions: e.target.value } : x)))} />
                      </Box>
                      <IconButton aria-label={`${t.planRemoveTerm} ${i + 1}`} disabled={rows.length <= 1} onClick={() => removeRow(r.id)} sx={{ width: 44, height: 44, flexShrink: 0, color: "text.secondary" }}>
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                );
              })}
            </Box>
            <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Button variant="outlined" color="inherit" startIcon={<AddRoundedIcon fontSize="small" />} onClick={addRow}
                disabled={rows.length >= MAX_PLAN} sx={{ minHeight: 44, borderColor: "divider", color: "text.primary" }}>
                {t.planAdd}
              </Button>
              <Stack direction="row" useFlexGap spacing={1}>
                <Button variant="contained" onClick={start}>{t.planStart}</Button>
                <Button color="inherit" onClick={() => onCancel()}>{t.cancel}</Button>
              </Stack>
            </Stack>
          </Stack>
        ) : (
          <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "grid" }}>
            {searches.map((s, i) => (
              <Stack component="li" key={`${s.term}#${i}`} direction="row" useFlexGap sx={{ alignItems: "flex-start", gap: 1.5, py: 1.25, borderTop: i === 0 ? 0 : 1, borderColor: "divider" }}>
                <Badge n={i} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.5, overflowWrap: "anywhere" }}>{s.term}</Typography>
                  {s.instructions.trim() !== "" && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.25, lineHeight: 1.6, overflowWrap: "anywhere" }}>{s.instructions}</Typography>}
                </Box>
              </Stack>
            ))}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
