"use client";
import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useT } from "@/lib/prefs";

export default function NotFound() {
  const t = useT();
  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 3 }}>
      <Stack spacing={2} sx={{ maxWidth: 420, alignItems: "flex-start" }}>
        <Typography component="h1" sx={{ fontSize: "1.5rem", fontWeight: 700 }}>{t.notFoundTitle}</Typography>
        <Typography sx={{ color: "text.secondary" }}>{t.notFoundBody}</Typography>
        <Button component={Link} href="/chat" variant="contained">{t.goChat}</Button>
      </Stack>
    </Box>
  );
}
