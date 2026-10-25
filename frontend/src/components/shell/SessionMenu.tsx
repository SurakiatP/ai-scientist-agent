"use client";
import { useState } from "react";
import { Button, IconButton, Menu, MenuItem, Stack, TextField, Typography } from "@mui/material";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import { useChatStore, type Session } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import { projectName } from "./ProjectSwitcher";

export type MenuAction = { key?: string; label: string; onClick: () => void; selected?: boolean; header?: boolean };

// After an inline editor closes its row's kebab is re-created; put focus there, or on New chat when the row is gone.
export const focusKebab = (id: string) => setTimeout(() => (document.getElementById(`kebab-${id}`) ?? document.getElementById("new-chat"))?.focus(), 0);

// Keyboard reachable: Tab to the button, Enter/Space opens, arrows move, Escape closes and returns focus.
export function KebabMenu({ id, label, actions }: { id: string; label: string; actions: MenuAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton id={`kebab-${id}`} aria-label={label} aria-haspopup="menu" aria-expanded={!!anchor} onClick={(e) => setAnchor(e.currentTarget)} sx={{ width: 44, height: 44, flexShrink: 0 }}>
        <MoreVertRoundedIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {actions.map((a) => a.header
          ? <MenuItem key={a.label} disabled sx={{ minHeight: 32, "&.Mui-disabled": { opacity: 1, color: "text.secondary", fontSize: "0.75rem", fontWeight: 700 } }}>{a.label}</MenuItem>
          : <MenuItem key={a.key ?? a.label} selected={a.selected} onClick={() => { setAnchor(null); a.onClick(); }} sx={{ minHeight: 44 }}>{a.label}</MenuItem>)}
      </Menu>
    </>
  );
}

export function InlineRename({ value, label, onSave, onCancel }: { value: string; label: string; onSave: (v: string) => void; onCancel: () => void }) {
  const t = useT();
  const [v, setV] = useState(value);
  const commit = () => (v.trim() ? onSave(v) : onCancel());
  return (
    <Stack spacing={0.5} sx={{ p: 0.5 }}>
      <TextField size="small" fullWidth autoFocus value={v} onChange={(e) => setV(e.target.value)} slotProps={{ htmlInput: { "aria-label": label, maxLength: 100 } }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
          if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
        }} />
      <Stack direction="row" spacing={0.5}>
        <Button size="small" variant="contained" onClick={commit} sx={{ minHeight: 44 }}>{t.saveName}</Button>
        <Button size="small" color="inherit" onClick={onCancel} sx={{ minHeight: 44 }}>{t.cancel}</Button>
      </Stack>
    </Stack>
  );
}

export function InlineConfirm({ text, onConfirm, onCancel }: { text: string; onConfirm: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <Stack role="group" aria-label={text} spacing={0.5} sx={{ p: 0.5 }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <Typography sx={{ fontSize: "0.8125rem" }}>{text}</Typography>
      <Stack direction="row" spacing={0.5}>
        <Button size="small" color="error" variant="contained" autoFocus onClick={onConfirm} sx={{ minHeight: 44 }}>{t.confirm}</Button>
        <Button size="small" color="inherit" onClick={onCancel} sx={{ minHeight: 44 }}>{t.cancel}</Button>
      </Stack>
    </Stack>
  );
}

export function SessionMenu({ session, onRename, onDelete }: { session: Session; onRename: () => void; onDelete: () => void }) {
  const t = useT();
  const projects = useChatStore((s) => s.projects), moveSession = useChatStore((s) => s.moveSession), setActive = useChatStore((s) => s.setActive), activeId = useChatStore((s) => s.activeId);
  const others = projects.filter((p) => p.id !== session.projectId);
  const actions: MenuAction[] = [
    { label: t.rename, onClick: onRename },
    ...(others.length ? [{ label: t.moveTo, header: true, onClick: () => {} }] : []),
    ...others.map((p) => ({
      key: p.id,
      label: projectName(p, t),
      onClick: () => { moveSession(session.id, p.id); if (activeId === session.id) setActive(session.id); }, // keep the highlighted project in sync
    })),
    { label: t.deleteItem, onClick: onDelete },
  ];
  return <KebabMenu id={session.id} label={`${t.moreActions}: ${session.title || t.untitled}`} actions={actions} />;
}
