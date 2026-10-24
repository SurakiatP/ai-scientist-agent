"use client";
import { Box } from "@mui/material";
import { useT } from "@/lib/prefs";

export function SkipLink() {
  const t = useT();
  return (
    <Box component="a" href="#content" sx={{
      position: "absolute", left: 16, top: -100, zIndex: 1300, px: 2, py: 1.5, borderRadius: 1,
      bgcolor: "background.paper", color: "primary.main", fontWeight: 600, border: 1, borderColor: "primary.main",
      "&:focus": { top: 8 },
    }}>{t.skip}</Box>
  );
}
