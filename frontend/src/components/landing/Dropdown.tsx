"use client";
import { useId, useState } from "react";
import { Button, Menu, MenuItem } from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";

export type DropItem = { value: string; label: string; href?: string; lang?: string };

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
      <Menu id={id} anchorEl={el} open={!!el} onClose={close} slotProps={{ list: { "aria-label": ariaLabel }, paper: { sx: { mt: 0.5, minWidth: 160, borderRadius: 2, border: 1, borderColor: "divider" } } }}>
        {items.map((it) => (
          <MenuItem
            key={it.value} selected={it.value === selected} lang={it.lang} sx={{ minHeight: 44 }}
            {...(it.href ? { component: "a", href: it.href } : {})}
            onClick={() => { onSelect?.(it.value); close(); }}
          >
            {it.label}
          </MenuItem>
        ))}
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
