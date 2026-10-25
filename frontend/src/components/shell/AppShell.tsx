"use client";
import { useState, type ReactNode } from "react";
import { Box, Drawer, IconButton, Stack, useMediaQuery, useTheme } from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useHydrated } from "@/lib/history";
import { ease } from "@/lib/motion";
import { usePrefs, useT } from "@/lib/prefs";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { Mark, Sidebar } from "./Sidebar";

const W = 300;

export function AppShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);
  const [moved, setMoved] = useState(false); // transition only after the user toggles, never on the load-time pref hydrate
  const pref = usePrefs((s) => s.sidebarCollapsed);
  const collapsed = useHydrated() && pref;
  const wide = useMediaQuery(useTheme().breakpoints.up("md"));
  if (wide && drawer) setDrawer(false); // no stale modal/focus trap after resize
  const set = usePrefs((s) => s.setSidebarCollapsed);
  return (
    <Box sx={{ display: "flex", height: "100dvh", bgcolor: "background.default" }}>
      <Box sx={{
        display: { xs: "none", md: "block" }, width: collapsed ? 0 : W, flexShrink: 0, overflow: "hidden", visibility: collapsed ? "hidden" : "visible",
        ...(moved && { transition: `width 260ms ${ease}, visibility 0s linear ${collapsed ? "260ms" : "0s"}` }),
      }}>
        <Box sx={{ width: W, height: "100%", borderRight: 1, borderColor: "divider" }}><Sidebar onCollapse={() => { setMoved(true); set(true); }} /></Box>
      </Box>
      <Drawer open={drawer} onClose={() => setDrawer(false)} sx={{ display: { md: "none" } }} slotProps={{ paper: { sx: { width: W, maxWidth: "85vw" } } }}>
        <Sidebar onPick={() => setDrawer(false)} />
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Stack component="header" direction="row" sx={{ alignItems: "center", gap: 1, px: { xs: 1.5, md: 3 }, pt: { md: 2.5 }, minHeight: 56, borderBottom: { xs: 1, md: 0 }, borderColor: "divider" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", display: { md: "none" } }}><Mark /><Box component="span" sx={{ fontWeight: 600, fontSize: "1.0625rem", whiteSpace: "nowrap" }}>{t.brand}</Box></Stack>
          {collapsed && (
            <IconButton aria-label={t.expandSidebar} aria-expanded={false} onClick={() => { setMoved(true); set(false); }} sx={{ display: { xs: "none", md: "inline-flex" }, color: "text.secondary" }}>
              <ViewSidebarOutlinedIcon />
            </IconButton>
          )}
          <Box sx={{ flex: { xs: 1, md: "none" }, minWidth: 0, display: "flex", justifyContent: { xs: "flex-end", md: "flex-start" } }}><ProjectSwitcher /></Box>
          <IconButton aria-label={t.menu} onClick={() => setDrawer(true)} sx={{ display: { md: "none" }, border: 1, borderColor: "divider", borderRadius: 1.5 }}><MenuRoundedIcon /></IconButton>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</Box>
      </Box>
      {aside && <Box component="aside" sx={{ display: { xs: "none", lg: "block" }, width: 340, flexShrink: 0, borderLeft: 1, borderColor: "divider", overflowY: "auto", p: 2.5 }}>{aside}</Box>}
      <SettingsDialog />
    </Box>
  );
}
