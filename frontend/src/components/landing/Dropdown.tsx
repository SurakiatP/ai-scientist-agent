"use client";
import { useId, useState } from "react";
import { Box, Button, ListItemIcon, Menu, MenuItem } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";

export type DropItem = { value: string; label: string; href?: string; lang?: string; icon?: React.ReactNode; note?: string; chip?: string };

// Small menu button used by the landing header for language, theme and the mobile nav.
export function Dropdown({ label, ariaLabel, items, selected, onSelect, icon, sx }: {
  label?: React.ReactNode; ariaLabel: string; items: DropItem[]; selected?: string; onSelect?: (v: string) => void; icon?: React.ReactNode; sx?: object;
}) {
  const id = useId();
  const [el, setEl] = useState<HTMLElement | null>(null);
  const close = () => setEl(null);
  return (
    <>
      <Button
        color="inherit" aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={el ? "true" : undefined} aria-controls={el ? id : undefined}
        onClick={(e) => setEl(e.currentTarget)}
        endIcon={label ? <KeyboardArrowDownRoundedIcon fontSize="small" /> : undefined}
        sx={{ minWidth: 44, px: 1.25, color: "text.primary", fontWeight: 500, fontSize: "0.9375rem", whiteSpace: "nowrap", ...sx }}
      >
        {icon}{label}
      </Button>
      <Menu id={id} anchorEl={el} open={!!el} onClose={close} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
        transitionDuration={{ enter: 220, exit: 120 }}
        slotProps={{
          list: { "aria-label": ariaLabel, sx: { p: 0.75, display: "grid", gap: 0.25 } },
          paper: { sx: { mt: 1, minWidth: 208, maxWidth: 320, borderRadius: 3.5, border: 1, borderColor: "divider", bgcolor: "background.paper", backgroundImage: "none", boxShadow: "0 16px 40px -12px rgba(11, 22, 32, 0.3), 0 2px 6px rgba(11, 22, 32, 0.06)" } },
        }}>
        {items.map((it, i) => {
          const on = it.value === selected;
          return (
            <MenuItem
              key={it.value} selected={on} lang={it.lang} aria-checked={selected !== undefined ? on : undefined} role={selected !== undefined ? "menuitemradio" : undefined}
              {...(it.href ? { component: "a", href: it.href } : {})}
              onClick={() => { onSelect?.(it.value); close(); }}
              sx={{
                minHeight: 44, gap: 1.5, px: 1.5, py: 0.75, borderRadius: 2.5, fontSize: "0.9375rem", fontWeight: on ? 600 : 500, color: on ? "primary.main" : "text.primary",
                transition: "background-color 140ms ease-out, color 140ms ease-out",
                "&:hover": { bgcolor: "action.hover" },
                "&.Mui-focusVisible": { bgcolor: "action.hover", outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
                "&.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible": { bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.12)" },
                "@media (prefers-reduced-motion: no-preference)": { animation: `dd-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both`, animationDelay: `${i * 35}ms`, "@keyframes dd-in": { from: { transform: "translateY(-4px)" }, to: { transform: "none" } } },
              }}
            >
              {it.icon && <ListItemIcon sx={{ minWidth: 0, width: 32, height: 32, justifyContent: "center", borderRadius: 2, color: "inherit", bgcolor: on ? "rgb(var(--mui-palette-primary-mainChannel) / 0.14)" : "action.hover" }}>{it.icon}</ListItemIcon>}
              <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                {it.label}
                {it.note && <Box component="span" sx={{ display: "block", fontSize: "0.8125rem", fontWeight: 400, lineHeight: 1.5, color: "text.secondary", whiteSpace: "normal" }}>{it.note}</Box>}
              </Box>
              {it.chip && <Box component="span" sx={{ flexShrink: 0, px: 1, py: 0.25, borderRadius: 999, border: 1, borderColor: "divider", fontSize: "0.6875rem", fontWeight: 500, color: "text.secondary" }}>{it.chip}</Box>}
              {on && <CheckRoundedIcon aria-hidden fontSize="small" sx={{ ml: 1 }} />}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}

// Dotted node cluster: decorative, so aria-hidden. Colour follows the text colour of the parent.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.5"><path d="M9 11 17 8M9 11 12 21M17 8 24 14M12 21 24 14M12 21 22 26" /></g>
      <g fill="currentColor"><circle cx="9" cy="11" r="3.6" /><circle cx="17" cy="8" r="2.4" /><circle cx="24" cy="14" r="3" /><circle cx="12" cy="21" r="2.6" /><circle cx="22" cy="26" r="1.8" opacity="0.7" /><circle cx="4" cy="22" r="1.4" opacity="0.6" /></g>
    </svg>
  );
}
