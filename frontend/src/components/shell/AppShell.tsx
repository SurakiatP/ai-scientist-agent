"use client";
import { useState, type ReactNode } from "react";
import { Box, Drawer, IconButton, Stack, useMediaQuery, useTheme } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import { useHydrated } from "@/lib/history";
import { usePrefs, useT } from "@/lib/prefs";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { Sidebar } from "./Sidebar";

const W = 280;

export function AppShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);
  const pref = usePrefs((s) => s.sidebarCollapsed);
  const collapsed = useHydrated() && pref;
  const wide = useMediaQuery(useTheme().breakpoints.up("md"));
  if (wide && drawer) setDrawer(false); // no stale modal/focus trap after resize
  const set = usePrefs((s) => s.setSidebarCollapsed);
  return (
    <Box sx={{ display: "flex", height: "100dvh", bgcolor: "background.default" }}>
      <Box sx={{ display: collapsed ? "none" : { xs: "none", md: "block" }, width: W, flexShrink: 0, borderRight: 1, borderColor: "divider" }}>
        <Sidebar />
      </Box>
      <Drawer open={drawer} onClose={() => setDrawer(false)} sx={{ display: { md: "none" } }} slotProps={{ paper: { sx: { width: W, maxWidth: "85vw" } } }}>
        <Sidebar onPick={() => setDrawer(false)} />
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Stack component="header" direction="row" sx={{ alignItems: "center", gap: 0.5, px: 1, minHeight: 56, borderBottom: 1, borderColor: "divider" }}>
          <IconButton aria-label={t.menu} onClick={() => setDrawer(true)} sx={{ display: { md: "none" } }}><MenuRoundedIcon /></IconButton>
          <IconButton aria-label={collapsed ? t.expandSidebar : t.collapseSidebar} aria-expanded={!collapsed} onClick={() => set(!collapsed)} sx={{ display: { xs: "none", md: "inline-flex" } }}>
            <ViewSidebarOutlinedIcon />
          </IconButton>
          <ProjectSwitcher />
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</Box>
      </Box>
      {aside && <Box component="aside" sx={{ display: { xs: "none", lg: "block" }, width: 340, flexShrink: 0, borderLeft: 1, borderColor: "divider", overflowY: "auto", p: 2.5 }}>{aside}</Box>}
    </Box>
  );
}
