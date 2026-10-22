"use client";
import Link from "next/link";
import { Box, Button, Container, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { landing } from "@/lib/strings";
import { RunFigure } from "@/components/RunFigure";

const th = landing.th;
const en = landing.en;

const focusRing = { "&:focus-visible": { outline: "3px solid", outlineColor: "primary.main", outlineOffset: 3 } };

// The page reads like a bilingual abstract: each statement in Thai, its English twin beside or under it.
function Cta({ variant }: { variant: "contained" | "outlined" }) {
  return (
    <Button
      component={Link} href="/ask" variant={variant} size="large" endIcon={<ArrowForwardIcon />}
      sx={{ minHeight: 56, px: 3, py: 1, borderRadius: 1, alignItems: "center", textAlign: "left", ...focusRing }}
    >
      <Box component="span" sx={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
        <Box component="span" lang="th" sx={{ fontSize: "1.0625rem", fontWeight: 700 }}>{th.cta}</Box>
        <Box component="span" lang="en" sx={{ fontSize: "0.8125rem", fontWeight: 500, opacity: 0.9 }}>{en.cta}</Box>
      </Box>
    </Button>
  );
}

export default function Home() {
  return (
    <>
      <Box component="main">
        <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 6 }, pb: { xs: 6, md: 10 } }}>
          <Typography component="h1" sx={{ m: 0, maxWidth: 980, textWrap: "balance" }}>
            <Box component="span" lang="th" sx={{ display: "block", fontSize: "clamp(1.875rem, 1.1rem + 3vw, 3.25rem)", fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.01em" }}>
              {th.title}
            </Box>
            <Box component="span" lang="en" sx={{ display: "block", mt: 1.5, fontSize: "clamp(1.125rem, 1rem + 0.6vw, 1.5rem)", fontWeight: 400, lineHeight: 1.4, color: "text.secondary" }}>
              {en.title}
            </Box>
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 6, rowGap: 2, mt: { xs: 3, md: 4 }, maxWidth: 1000 }}>
            <Typography lang="th" sx={{ fontSize: "1.0625rem", lineHeight: 1.85 }}>{th.lead}</Typography>
            <Typography lang="en" sx={{ fontSize: "1rem", lineHeight: 1.7, color: "text.secondary" }}>{en.lead}</Typography>
          </Box>

          <Box sx={{ mt: { xs: 3, md: 4 } }}><Cta variant="contained" /></Box>

          <Box component="figure" sx={{ m: 0, mt: { xs: 5, md: 5 } }}>
            <Box sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, p: { xs: 2, sm: 3 } }}>
              <RunFigure />
            </Box>
            <Box component="figcaption" sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, columnGap: 6, rowGap: 0.5, fontSize: "0.875rem", lineHeight: 1.7 }}>
              <Box component="span" lang="th">{th.figCaption}</Box>
              <Box component="span" lang="en" sx={{ color: "text.secondary" }}>{en.figCaption}</Box>
            </Box>
          </Box>
        </Container>

        <Notes id="method" title={th.methodTitle} enTitle={en.methodTitle} items={th.method} enItems={en.method} ordered />
        <Notes id="limits" title={th.limitsTitle} enTitle={en.limitsTitle} items={th.limits} enItems={en.limits} />
      </Box>

      <Box component="footer" sx={{ borderTop: 1, borderColor: "divider" }}>
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 }, display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: { md: "center" }, justifyContent: "space-between" }}>
          <Box sx={{ maxWidth: 640 }}>
            <Typography lang="th" sx={{ lineHeight: 1.8 }}>{th.footer}</Typography>
            <Typography lang="en" sx={{ color: "text.secondary", fontSize: "0.875rem", lineHeight: 1.7 }}>{en.footer}</Typography>
          </Box>
          <Box><Cta variant="outlined" /></Box>
        </Container>
      </Box>
    </>
  );
}

// A note section: heading pair on the left, Thai item with its English twin on the right.
function Notes({ id, title, enTitle, items, enItems, ordered }: {
  id: string; title: string; enTitle: string; items: readonly string[]; enItems: readonly string[]; ordered?: boolean;
}) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ borderTop: 1, borderColor: "divider" }}>
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 }, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 3fr" }, gap: { xs: 2, md: 6 } }}>
        <Typography id={id} component="h2" sx={{ m: 0, fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.4 }}>
          <Box component="span" lang="th" sx={{ display: "block" }}>{title}</Box>
          <Box component="span" lang="en" sx={{ display: "block", fontSize: "1rem", fontWeight: 400, color: "text.secondary" }}>{enTitle}</Box>
        </Typography>
        <Box
          component={ordered ? "ol" : "ul"}
          sx={{
            m: 0, p: 0, pl: ordered ? 3.5 : 2.5, display: "grid", gap: 3, maxWidth: "52rem",
            "& li::marker": { color: "text.secondary", fontWeight: 600 },
          }}
        >
          {items.map((item, i) => (
            <li key={i}>
              <Typography lang="th" sx={{ lineHeight: 1.85 }}>{item}</Typography>
              <Typography lang="en" sx={{ color: "text.secondary", fontSize: "0.9375rem", lineHeight: 1.7, mt: 0.5 }}>{enItems[i]}</Typography>
            </li>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
