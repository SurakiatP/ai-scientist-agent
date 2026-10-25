"use client";
import { srOnly } from "@/lib/config";
import { Box, Stack } from "@mui/material";
import { skeletonBar } from "@/lib/motion";
import { useT } from "@/lib/prefs";

const WIDTHS = ["96%", "88%", "93%", "72%", "90%", "46%"]; // presentational line lengths, not a prediction of the answer

// Placeholder for the coming answer while a run is searching/writing. Decorative bars are aria-hidden; the status line says what is happening once.
export function AnswerSkeleton({ phase }: { phase: "searching" | "writing" }) {
  const t = useT();
  return (
    <Box data-testid="answer-skeleton" sx={{ mt: 2 }}>
      <Box role="status" sx={srOnly}>{phase === "writing" ? t.skelWriting : t.skelSearching}</Box>
      <Stack aria-hidden spacing={1.5}>
        <Box sx={{ ...skeletonBar(0), height: 20, width: "42%" }} />
        {WIDTHS.map((w, i) => <Box key={i} sx={{ ...skeletonBar(i + 1), width: w }} />)}
      </Stack>
    </Box>
  );
}
