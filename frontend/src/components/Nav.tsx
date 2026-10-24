"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Box, Drawer, IconButton, Stack, Typography } from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { palette } from "@/theme";
import { strings } from "@/lib/strings";
import { useHistoryStore, useHydrated } from "@/lib/history";

const t = strings.th;

// A citation bracket holding a gold note and a teal check: the product in one mark.
function BrandMark() {
  return (
    <Box component="svg" viewBox="0 0 28 28" aria-hidden="true" sx={{ width: 28, height: 28, display: "block", flexShrink: 0 }}>
      <path
        d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5V8M20 4h2.5A1.5 1.5 0 0 1 24 5.5V8M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20M8 24H5.5A1.5 1.5 0 0 1 4 22.5V20"
        stroke={palette.primary} strokeWidth="1.7" fill="none" strokeLinecap="round"
      />
      <rect x="9" y="9" width="10" height="10" rx="2" fill={palette.gold} />
      <path d="M11.6 14.1l1.9 1.9 3.1-3.7" stroke={palette.teal} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box
      component={Link} href="/" onClick={onNavigate}
      sx={{
        display: "flex", alignItems: "center", gap: 1.25, px: 2, height: 64, flexShrink: 0,
        borderBottom: 1, borderColor: "divider", textDecoration: "none", color: "inherit",
        "&:focus-visible": { outline: `2px solid ${palette.primary}`, outlineOffset: -2 },
      }}
    >
      <BrandMark />
      <Box sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ display: "block", fontSize: "0.9375rem", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
          {t.brand}
        </Typography>
        <Typography component="span" sx={{ display: "block", fontSize: "0.6875rem", color: "text.secondary", letterSpacing: "0.02em", lineHeight: 1.4 }}>
          {t.brandTag}
        </Typography>
      </Box>
    </Box>
  );
}

function SectionLabel({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Typography component="h2" sx={{ px: 1.25, mb: 0.75, fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", color: "text.secondary", ...sx }}>
      {children}
    </Typography>
  );
}

const itemSx = (active: boolean) => ({
  display: "flex", alignItems: "center", gap: 1.25, minHeight: 44, px: 1.25, borderRadius: 1.5,
  color: active ? palette.textPrimary : palette.textSecondary,
  bgcolor: active ? palette.sidebarActive : "transparent",
  border: `1px solid ${active ? palette.border : "transparent"}`,
  textDecoration: "none", transition: "background-color 160ms ease, color 160ms ease",
  "&:hover": { bgcolor: active ? palette.sidebarActive : palette.railHover, color: palette.textPrimary },
  "&:focus-visible": { outline: `2px solid ${palette.primary}`, outlineOffset: 2 },
});

function NavItem({ href, active, icon, label, onNavigate }: {
  href: string; active: boolean; icon: ReactNode; label: string; onNavigate?: () => void;
}) {
  return (
    <Box component={Link} href={href} aria-current={active ? "page" : undefined} onClick={onNavigate} sx={itemSx(active)}>
      <Box sx={{ width: 5, height: 5, borderRadius: "1.5px", bgcolor: active ? palette.primary : "transparent", flexShrink: 0 }} />
      <Box sx={{ display: "flex", color: active ? palette.primary : palette.textSecondary, "& svg": { fontSize: 18 } }}>{icon}</Box>
      <Typography component="span" sx={{ fontSize: "0.875rem", fontWeight: active ? 600 : 500, lineHeight: 1.4 }}>{label}</Typography>
    </Box>
  );
}

function RecentRuns({ onNavigate }: { onNavigate?: () => void }) {
  const hydrated = useHydrated();
  const items = useHistoryStore((s) => s.items);
  const recent = hydrated ? items.slice(0, 4) : [];
  if (!recent.length) {
    return (
      <Typography sx={{ px: 1.25, fontSize: "0.75rem", lineHeight: 1.6, color: "text.secondary" }}>
        {hydrated ? t.navEmptyRecent : ""}
      </Typography>
    );
  }
  return (
    <Stack spacing={0.25}>
      {recent.map((item) => (
        <Box
          key={item.id} component={Link} href={`/saved#item-${item.id}`} onClick={onNavigate}
          sx={{ display: "block", px: 1.25, py: 0.9, borderRadius: 1.5, textDecoration: "none", color: "inherit", "&:hover": { bgcolor: palette.railHover }, "&:focus-visible": { outline: `2px solid ${palette.primary}`, outlineOffset: 2 } }}
        >
          <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.question}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
            {new Date(item.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

function PrivacyNote() {
  return (
    <Box sx={{ mt: "auto", px: 2, py: 1.75, borderTop: 1, borderColor: "divider" }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start" }}>
        <LockOutlinedIcon sx={{ fontSize: 14, color: "text.secondary", mt: "2px" }} />
        <Typography sx={{ fontSize: "0.6875rem", lineHeight: 1.5, color: "text.secondary" }}>{t.navPrivacy}</Typography>
      </Stack>
    </Box>
  );
}

function SidebarContent({ path, onNavigate, showClose, onClose }: {
  path: string; onNavigate?: () => void; showClose?: boolean; onClose?: () => void;
}) {
  const is = (href: string) => path === href;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: palette.sidebar }}>
      <Box sx={{ position: "relative" }}>
        <Brand onNavigate={onNavigate} />
        {showClose && (
          <IconButton aria-label={t.closeMenu} onClick={onClose} sx={{ position: "absolute", right: 8, top: 14, color: "text.secondary" }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
      <Box component="nav" aria-label={t.menu} sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 2 }}>
        <SectionLabel>{t.navWorkspace}</SectionLabel>
        <Stack spacing={0.5}>
          <NavItem href="/ask" active={is("/ask")} label={t.navAsk} icon={<ChatBubbleOutlineRoundedIcon />} onNavigate={onNavigate} />
          <NavItem href="/saved" active={is("/saved")} label={t.navSaved} icon={<HistoryRoundedIcon />} onNavigate={onNavigate} />
        </Stack>
        <SectionLabel sx={{ mt: 3 }}>{t.navRecent}</SectionLabel>
        <RecentRuns onNavigate={onNavigate} />
      </Box>
      <PrivacyNote />
    </Box>
  );
}

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Box
        component="header"
        sx={{
          position: "fixed", inset: "0 0 auto 0", zIndex: (theme) => theme.zIndex.appBar, height: 56,
          display: { xs: "flex", md: "none" }, alignItems: "center", gap: 1, px: 1,
          bgcolor: palette.sidebar, borderBottom: 1, borderColor: "divider",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, "& > a": { borderBottom: 0, height: 56, pl: 1 } }}><Brand /></Box>
        <IconButton aria-label={t.menu} aria-expanded={open} onClick={() => setOpen(true)} sx={{ color: "text.primary" }}>
          <MenuRoundedIcon />
        </IconButton>
      </Box>
      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "flex" }, width: 272, flexShrink: 0, position: "sticky", top: 0, height: "100dvh",
          flexDirection: "column", bgcolor: palette.sidebar, borderRight: 1, borderColor: "divider",
        }}
      >
        <SidebarContent path={path} />
      </Box>
      <Drawer
        open={open} onClose={() => setOpen(false)} anchor="left"
        slotProps={{ paper: { sx: { width: 288, bgcolor: palette.sidebar, backgroundImage: "none", borderRight: 1, borderColor: "divider" } } }}
      >
        <SidebarContent path={path} onNavigate={() => setOpen(false)} showClose onClose={() => setOpen(false)} />
      </Drawer>
    </>
  );
}
