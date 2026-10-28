"use client";
import { useId, type ReactNode } from "react";
import { Box } from "@mui/material";

// short: label used under the sm breakpoint; iconOnlyXs: drop the text there (the radio keeps its full accessible name).
export type Seg<T extends string> = { value: T; label: string; icon?: ReactNode; short?: string; iconOnlyXs?: boolean };

// A real radio group (arrow keys, screen readers) drawn as a track with one thumb that slides left and right.
// Only transform and color move; the theme's reduced-motion rule turns the slide into a cut.
export function Segmented<T extends string>({ label, value, options, onChange, fill, compact, square }: { label: string; value: T; options: readonly Seg<T>[]; onChange: (v: T) => void; fill?: boolean; compact?: boolean; square?: boolean }) {
  const name = useId();
  const n = options.length;
  const rad = square ? 2 : 999; // square: the same rounded-rectangle language as the header buttons
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <Box role="radiogroup" aria-label={label} sx={{ position: "relative", isolation: "isolate", display: "grid", gridAutoFlow: "column", gridAutoColumns: "1fr", p: compact ? "2px" : "3px", borderRadius: rad, ...(square ? { border: 0 } : { border: 1, borderColor: "divider" }), bgcolor: "action.hover", flexShrink: 0, ...(fill && { flex: 1, minWidth: 0 }) }}>
      <Box aria-hidden sx={{ position: "absolute", top: compact ? 2 : 3, bottom: compact ? 2 : 3, left: compact ? 2 : 3, width: `calc((100% - ${compact ? 4 : 6}px) / ${n})`, borderRadius: square ? 1.5 : 999, bgcolor: "primary.main", boxShadow: "0 1px 3px rgba(0,0,0,.18)", transform: `translateX(${idx * 100}%)`, transition: "transform 280ms cubic-bezier(.22,1,.36,1)", zIndex: 0 }} />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Box key={o.value} component="label" sx={{
            position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, minHeight: compact ? (square ? 36 : 32) : 40, px: compact ? 1.5 : { xs: 1.25, sm: 2 }, borderRadius: square ? 1.5 : 999, cursor: "pointer", whiteSpace: "nowrap",
            fontSize: compact ? "0.8125rem" : "0.875rem", fontWeight: on ? 700 : 500, color: on ? "primary.contrastText" : "text.secondary", transition: "color 200ms ease-out",
            "&:hover": on ? undefined : { color: "text.primary" },
            "&:has(input:focus-visible)": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            "& .MuiSvgIcon-root": { fontSize: 18 },
          }}>
            <Box component="input" type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} aria-label={o.label} sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", m: 0, opacity: 0, cursor: "pointer" }} />
            {o.icon}
            <Box component="span" sx={o.iconOnlyXs ? { display: { xs: "none", sm: "inline" } } : undefined}>
              {o.short && compact ? o.short : o.short ? <><Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>{o.short}</Box><Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>{o.label}</Box></> : o.label}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
