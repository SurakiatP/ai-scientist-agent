"use client";
import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useT } from "@/lib/prefs";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const t = useT();
  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 3 }}>
      <Stack spacing={2} sx={{ maxWidth: 420, alignItems: "flex-start" }}>
        <Typography component="h1" sx={{ fontSize: "1.5rem", fontWeight: 700 }}>{t.errorTitle}</Typography>
        <Typography sx={{ color: "text.secondary" }}>{t.errorBody}</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => retry()}>{t.retry}</Button>
          <Button component={Link} href="/chat" color="inherit" variant="outlined">{t.goChat}</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
