"use client";
import Link from "next/link";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { landing, strings } from "@/lib/strings";
import { RunFigure } from "@/components/RunFigure";
import { palette } from "@/theme";

const th = landing.th;
const en = landing.en;
const t = strings.th;

// Marks Latin runs (arXiv, DOI, PMID, RAG...) inside Thai text as English, so screen readers switch voice.
const LATIN = /(\(?[A-Za-z][\w .()/-]*[\w)])/;
function Th({ text }: { text: string }) {
  return text.split(LATIN).map((part, i) => (i % 2 ? <span key={i} lang="en">{part}</span> : part));
}

const focusRing = { "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 } };

// Each statement in Thai with its English twin: the bilingual abstract, restated in the workspace voice.
function Cta({ variant }: { variant: "contained" | "outlined" }) {
  return (
    <Button
      component={Link} href="/ask" variant={variant} size="large" endIcon={<ArrowForwardIcon />}
      sx={{ minHeight: 54, px: 2.75, py: 1, borderRadius: 1.5, alignItems: "center", textAlign: "left", ...focusRing }}
    >
      <Box component="span" sx={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
        <Box component="span" lang="th" sx={{ fontSize: "1rem", fontWeight: 700 }}>{th.cta}</Box>
        <Box component="span" lang="en" sx={{ fontSize: "0.75rem", fontWeight: 500, opacity: 0.85 }}>{en.cta}</Box>
      </Box>
    </Button>
  );
}

export default function Home() {
  return (
    <>
      <Box component="main">
        <Box sx={{ maxWidth: 1080, mx: "auto", px: { xs: 2.5, sm: 4, lg: 5 }, pt: { xs: 4, md: 6 }, pb: { xs: 6, md: 8 } }}>
          <Typography component="h1" sx={{ m: 0, maxWidth: 900, textWrap: "balance" }}>
            <Box component="span" lang="th" sx={{ display: "block", fontSize: "clamp(1.875rem, 1.1rem + 3vw, 3.25rem)", fontWeight: 700, lineHeight: 1.28, letterSpacing: "-0.02em" }}>
              {th.title}
            </Box>
            <Box component="span" lang="en" sx={{ display: "block", mt: 1.5, fontSize: "clamp(1.125rem, 1rem + 0.6vw, 1.5rem)", fontWeight: 400, lineHeight: 1.4, color: "text.secondary" }}>
              {en.title}
            </Box>
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 7, rowGap: 2, mt: { xs: 3, md: 4 }, maxWidth: 980 }}>
            <Typography lang="th" sx={{ fontSize: "1.0625rem", lineHeight: 1.85 }}><Th text={th.lead} /></Typography>
            <Typography lang="en" sx={{ fontSize: "0.9375rem", lineHeight: 1.75, color: "text.secondary" }}>{en.lead}</Typography>
          </Box>

          <Stack direction="row" useFlexGap sx={{ mt: { xs: 3, md: 4 }, flexWrap: "wrap", alignItems: "center", gap: 1.5 }}>
            <Cta variant="contained" />
            <Button
              component={Link} href="/saved" endIcon={<ArrowForwardIcon />}
              sx={{ minHeight: 44, color: "text.secondary", fontWeight: 500, ...focusRing }}
            >
              {t.linkSaved}
            </Button>
          </Stack>

          <Box component="figure" sx={{ m: 0, mt: { xs: 5, md: 6 } }}>
            <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1.5, px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: palette.background }}>
                <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.04em", color: "text.secondary" }}>รูปที่ 1</Typography>
                <Chip size="small" variant="outlined" label={t.verifiedBadge} sx={{ bgcolor: palette.tealLight, borderColor: palette.tealLight, color: palette.teal }} />
              </Stack>
              <Box sx={{ p: { xs: 2, sm: 2.5 } }}><RunFigure /></Box>
            </Paper>
            <Box component="figcaption" sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 7, rowGap: 0.5, fontSize: "0.8125rem", lineHeight: 1.7 }}>
              <Box component="span" lang="th"><Th text={th.figCaption} /></Box>
              <Box component="span" lang="en" sx={{ color: "text.secondary" }}>{en.figCaption}</Box>
            </Box>
          </Box>
        </Box>

        <Notes id="method" title={th.methodTitle} enTitle={en.methodTitle} items={th.method} enItems={en.method} ordered />
        <Notes id="limits" title={th.limitsTitle} enTitle={en.limitsTitle} items={th.limits} enItems={en.limits} />
      </Box>

      <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", bgcolor: palette.surface }}>
        <Box sx={{ maxWidth: 1080, mx: "auto", px: { xs: 2.5, sm: 4, lg: 5 }, py: { xs: 5, md: 6 }, display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: { md: "center" }, justifyContent: "space-between" }}>
          <Box sx={{ maxWidth: 620 }}>
            <Typography lang="th" sx={{ fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.6 }}>{th.footer}</Typography>
            <Typography lang="en" sx={{ color: "text.secondary", fontSize: "0.875rem", lineHeight: 1.7 }}>{en.footer}</Typography>
          </Box>
          <Box><Cta variant="outlined" /></Box>
        </Box>
      </Box>
    </>
  );
}

// A note section: heading on the left, Thai item with its English twin on the right.
function Notes({ id, title, enTitle, items, enItems, ordered }: {
  id: string; title: string; enTitle: string; items: readonly string[]; enItems: readonly string[]; ordered?: boolean;
}) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ borderTop: 1, borderColor: "divider", bgcolor: id === "limits" ? palette.background : "transparent" }}>
      <Box sx={{ maxWidth: 1080, mx: "auto", px: { xs: 2.5, sm: 4, lg: 5 }, py: { xs: 5, md: 7 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "280px 1fr" }, gap: { xs: 2.5, md: 7 } }}>
        <Typography id={id} component="h2" sx={{ m: 0, fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.35 }}>
          <Box component="span" lang="th" sx={{ display: "block" }}>{title}</Box>
          <Box component="span" lang="en" sx={{ display: "block", mt: 0.25, fontSize: "0.9375rem", fontWeight: 400, color: "text.secondary" }}>{enTitle}</Box>
        </Typography>
        <Box
          component={ordered ? "ol" : "ul"}
          sx={{ m: 0, p: 0, listStyle: "none", display: "grid", maxWidth: "60ch" }}
        >
          {items.map((item, i) => (
            <Box
              component="li" key={i}
              sx={{
                display: "grid", gridTemplateColumns: ordered ? "40px 1fr" : "14px 1fr", gap: ordered ? 2 : 1.5,
                py: ordered ? 2.25 : 2, borderTop: i === 0 ? 0 : 1, borderColor: "divider",
              }}
            >
              {ordered ? (
                <Typography sx={{ fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.4, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                  {String(i + 1).padStart(2, "0")}
                </Typography>
              ) : (
                <Box sx={{ width: 6, height: 6, mt: "0.55em", borderRadius: "2px", bgcolor: palette.clay }} />
              )}
              <Box>
                <Typography lang="th" sx={{ fontSize: "0.9375rem", lineHeight: 1.8 }}><Th text={item} /></Typography>
                <Typography lang="en" sx={{ mt: 0.5, color: "text.secondary", fontSize: "0.875rem", lineHeight: 1.7 }}>{enItems[i]}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
