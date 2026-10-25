"use client";
import { useId, useState } from "react";
import { Box, Button, ListItemIcon, Menu, MenuItem } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";

export type DropItem = { value: string; label: string; href?: string; lang?: string; icon?: React.ReactNode };

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
        slotProps={{
          list: { "aria-label": ariaLabel, sx: { p: 0.5 } },
          paper: { sx: { mt: 1, minWidth: 184, borderRadius: 3, border: 1, borderColor: "divider", bgcolor: "background.paper", backgroundImage: "none", boxShadow: "0 12px 32px -8px rgba(11, 22, 32, 0.28), 0 2px 6px rgba(11, 22, 32, 0.08)" } },
        }}>
        {items.map((it) => {
          const on = it.value === selected;
          return (
            <MenuItem
              key={it.value} selected={on} lang={it.lang} aria-checked={selected !== undefined ? on : undefined} role={selected !== undefined ? "menuitemradio" : undefined}
              {...(it.href ? { component: "a", href: it.href } : {})}
              onClick={() => { onSelect?.(it.value); close(); }}
              sx={{
                minHeight: 44, gap: 1.25, px: 1.25, borderRadius: 2, fontSize: "0.9375rem", fontWeight: on ? 600 : 400,
                "& + &": { mt: 0.25 },
                "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 12%, transparent)", color: "primary.main" },
              }}
            >
              {it.icon && <ListItemIcon sx={{ minWidth: 0, color: "inherit", opacity: on ? 1 : 0.7 }}>{it.icon}</ListItemIcon>}
              <Box component="span" sx={{ flex: 1 }}>{it.label}</Box>
              {on && <CheckRoundedIcon aria-hidden fontSize="small" sx={{ ml: 1.5 }} />}
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
