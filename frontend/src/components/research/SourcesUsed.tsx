"use client";
import { Typography } from "@mui/material";
import { useT } from "@/lib/prefs";
import { sourceNames } from "@/lib/sources";

/** "Sources used: PubMed · UniProt" as quiet metadata; nothing when no known source is given. */
export function SourcesUsed({ ids }: { ids: readonly string[] | undefined }) {
  const t = useT(), names = sourceNames(ids);
  return names ? <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", overflowWrap: "anywhere" }}>{t.sourcesUsed} {names}</Typography> : null;
}
