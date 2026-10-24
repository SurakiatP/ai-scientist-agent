"use client";
import { useState } from "react";
import { Button, Menu, MenuItem, TextField } from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { PERSONAL, useChatStore, type Project } from "@/lib/chat";
import { useT } from "@/lib/prefs";
import type { Strings } from "@/lib/strings";

export const projectName = (p: Project, t: Strings) => (p.id === PERSONAL || !p.name ? t.personal : p.name);

// Switching only changes which project new chats go to; no session is moved or deleted.
export const selectProject = (id: string) =>
  useChatStore.setState((s) => ({ activeProjectId: id, activeId: s.sessions.find((x) => x.id === s.activeId)?.projectId === id ? s.activeId : null }));

export function ProjectSwitcher() {
  const t = useT();
  const { projects, activeProjectId, addProject } = useChatStore();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const cur = projects.find((p) => p.id === activeProjectId) ?? projects[0];
  const close = () => { setAnchor(null); setName(""); };
  return (
    <>
      <Button color="inherit" aria-label={`${t.switchProject}: ${projectName(cur, t)}`} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ExpandMoreRoundedIcon />} sx={{ maxWidth: { xs: 160, sm: 280 }, "& span": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}>
        <span>{projectName(cur, t)}</span>
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        {projects.map((p) => (
          <MenuItem key={p.id} selected={p.id === activeProjectId} onClick={() => { selectProject(p.id); close(); }} sx={{ minHeight: 44 }}>{projectName(p, t)}</MenuItem>
        ))}
        <MenuItem disableRipple sx={{ "&:hover": { bgcolor: "transparent" } }} onKeyDown={(e) => e.stopPropagation()}>
          <TextField size="small" placeholder={t.newProject} value={name} onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { "aria-label": t.projectName, maxLength: 100 } }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing || !name.trim()) return;
              const id = addProject(name);
              if (id) selectProject(id);
              close();
            }} />
        </MenuItem>
      </Menu>
    </>
  );
}
