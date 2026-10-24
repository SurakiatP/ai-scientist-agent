"use client";
import { Box, Button, Chip, Link, List, ListItem, Stack, Typography } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useInspector } from "@/lib/inspector";
import type { Reference } from "@/lib/sse";
import { checkLabel, hasId, paperLink } from "@/lib/refs";
import type { Strings } from "@/lib/strings";

export const anchorId = (turnId: string | undefined, refId: string) => (turnId ? `ref-${turnId}-${refId}` : `ref-${refId}`);

const idChipSx = { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "0.6875rem" };
const tint = (token: string, pct = 14) => `color-mix(in srgb, var(--mui-palette-${token}) ${pct}%, transparent)`;
const chipSx = (token: string) => ({
  bgcolor: tint(token), borderColor: tint(token, 40), color: `${token.replace("-", ".")}`,
  "& .MuiChip-icon": { color: "inherit", fontSize: 15 },
});

export function ReferenceList({ references, t, scope }: { references: Reference[]; t: Strings; scope?: { sessionId: string; turnId: string } }) {
  const open = useInspector((s) => s.open);
  return (
    <List disablePadding sx={{ display: "grid" }}>
      {references.map((r, i) => {
        const href = paperLink(r.paper);
        const meta = [r.paper.authors.slice(0, 3).join(", ") + (r.paper.authors.length > 3 ? ` ${t.etAl}` : ""), r.paper.year]
          .filter(Boolean)
          .join(" · ");
        const verified = r.status === "verified";
        return (
          <ListItem
            key={r.id}
            id={anchorId(scope?.turnId, r.id)}
            disableGutters
            sx={{
              alignItems: "flex-start", gap: 1.75, px: { xs: 0.5, md: 1 }, py: 1.75,
              borderTop: i === 0 ? 0 : 1, borderColor: "divider",
              borderRadius: 1.5, scrollMarginTop: 80,
              "&:target": { bgcolor: tint("primary-main", 12) },
            }}
          >
            <Box sx={{
              display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0,
              borderRadius: 1, border: 1, borderColor: verified ? tint("evidence-verified", 40) : "divider",
              bgcolor: verified ? tint("evidence-verified") : "surface.raised",
              color: verified ? "evidence.verified" : "text.secondary",
              fontSize: "0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
            }}>
              {r.id}
            </Box>
            <Stack spacing={0.6} sx={{ minWidth: 0, flex: 1 }}>
              {href ? (
                <Link
                  href={href} target="_blank" rel="noopener noreferrer" underline="hover"
                  sx={{ fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5, color: "primary.main", overflowWrap: "anywhere" }}
                >
                  {r.paper.title}
                </Link>
              ) : (
                <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.5, overflowWrap: "anywhere" }}>{r.paper.title}</Typography>
              )}
              {meta && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>{meta}</Typography>}
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ pt: 0.25, flexWrap: "wrap", alignItems: "center" }}>
                {verified && <Chip size="small" variant="outlined" icon={<CheckRoundedIcon />} label={checkLabel(r, t)} sx={chipSx("evidence-verified")} />}
                {r.status === "unverified" && <Chip size="small" variant="outlined" icon={hasId(r.paper) ? <WarningAmberRoundedIcon /> : <InfoOutlinedIcon />} label={checkLabel(r, t)} sx={chipSx("evidence-unverified")} />}
                {r.status === "unknown" && <Chip size="small" variant="outlined" icon={<WarningAmberRoundedIcon />} label={checkLabel(r, t)} sx={chipSx("evidence-unknown")} />}
                {r.paper.doi && <Chip size="small" variant="outlined" label={`${t.doi} ${r.paper.doi}`} sx={idChipSx} />}
                {r.paper.pmid && <Chip size="small" variant="outlined" label={`${t.pmid} ${r.paper.pmid}`} sx={idChipSx} />}
              </Stack>
              {r.status === "unverified" && (
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>{hasId(r.paper) ? t.unconfirmedText : t.noIdText}</Typography>
              )}
              {r.status === "unknown" && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.6 }}>{t.unknownText}</Typography>}
              {scope && (
                <Box>
                  <Button size="small" variant="text" sx={{ minHeight: 44, minWidth: 44 }} aria-label={`${t.openDetails}: ${r.paper.title}`}
                    onClick={(e) => open({ ...scope, refId: r.id }, e.currentTarget)}>{t.openDetails}</Button>
                </Box>
              )}
            </Stack>
          </ListItem>
        );
      })}
    </List>
  );
}
