"use client";
import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";
import { LogoMark } from "@/components/landing/Dropdown";
import { useT } from "@/lib/prefs";

export default function NotFound() {
  const t = useT();
  return (
    <Box component="main" id="content" tabIndex={-1} sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 3, outline: "none" }}>
      <Stack spacing={2.5} sx={{ maxWidth: 520, alignItems: "flex-start" }}>
        <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: "10px", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}><LogoMark size={26} /></Box>
        <Typography component="h1" sx={{ fontSize: { xs: "2rem", md: "2.75rem" }, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.02em", textWrap: "balance" }}>{t.notFoundTitle}</Typography>
        <Typography sx={{ color: "text.secondary", fontSize: "1.0625rem", lineHeight: 1.8 }}>{t.notFoundBody}</Typography>
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: "wrap" }}>
          <Button component={Link} href="/chat" variant="contained">{t.goChat}</Button>
          <Button component={Link} href="/" color="inherit">{t.goHome}</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
