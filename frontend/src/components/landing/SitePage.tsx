"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { useHydrated } from "@/lib/history";
import { usePrefs } from "@/lib/prefs";
import { featureSlugs, landing, sitePages, type FeatureSlug } from "@/lib/strings";
import { LandingHeader, ring, wrap, type NavKey } from "./LandingHeader";

const rise = { "@media (prefers-reduced-motion: no-preference)": { "& .rise": { animation: "site-rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both", animationDelay: "calc(var(--i, 0) * 70ms)" }, "@keyframes site-rise": { from: { transform: "translateY(10px)" }, to: { transform: "none" } } } } as const;
const card = { display: "grid", alignContent: "start", gap: 0.75, p: 2.5, border: 1, borderColor: "divider", borderRadius: 4, bgcolor: "background.paper" } as const;

export function useCopy() {
  const lang = usePrefs((s) => s.lang), hydrated = useHydrated();
  const l = hydrated ? lang : "th";
  return { lang: l, L: landing[l], P: sitePages[l] };
}

// Shell of every public page behind the header menu: header, breadcrumb, content, and a closing way in.
function Shell({ active, trail, wide, children }: { active: NavKey; trail: string; wide?: boolean; children: ReactNode }) {
  const { lang, L } = useCopy();
  return (
    <Box lang={lang} sx={{ ...rise, position: "relative", overflow: "clip" }}>
      <LandingHeader active={active} />
      <Box component="article" sx={{ ...wrap, maxWidth: wide ? 1320 : 960, py: { xs: 3, md: 6 }, display: "grid", gap: { xs: 4, md: 6 } }}>
        <Box component="nav" aria-label="breadcrumb" sx={{ display: "flex", flexWrap: "wrap", gap: 1, fontSize: "0.875rem", color: "text.secondary" }}>
          <Box component={Link} href="/" sx={{ color: "inherit", ...ring, "&:hover": { color: "text.primary" } }}>{L.home}</Box><span aria-hidden="true">/</span>
          <Box component="span" aria-current="page" sx={{ color: "text.primary", fontWeight: 500 }}>{trail}</Box>
        </Box>
        {children}
      </Box>
      <Box component="footer" sx={{ ...wrap, pb: { xs: 5, md: 7 } }}>
        <Box sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.1)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 2.5 }}>
          <Typography component="p" sx={{ m: 0, fontSize: { xs: "1.25rem", md: "1.5rem" }, fontWeight: 600, lineHeight: 1.5, textWrap: "balance" }}>{L.footer}</Typography>
          <Button component={Link} href="/chat" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 48, px: 3, borderRadius: 999, ...ring }}>{L.cta}</Button>
        </Box>
      </Box>
    </Box>
  );
}

const h1 = { m: 0, fontSize: { xs: "1.875rem", md: "2.5rem" }, fontWeight: 700, lineHeight: 1.25, textWrap: "balance" } as const;
const lead = { m: 0, maxWidth: "46rem", fontSize: { xs: "1rem", md: "1.125rem" }, lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" } as const;
const h2 = { m: 0, fontSize: { xs: "1.375rem", md: "1.625rem" }, fontWeight: 600, lineHeight: 1.5 } as const;

function Note({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, pt: 2.5, borderTop: 1, borderColor: "divider", color: "text.secondary", fontSize: "0.9375rem", lineHeight: 1.7 }}>
      <Box aria-hidden="true" sx={{ mt: 0.5, width: 20, height: 20, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}><CheckRoundedIcon sx={{ fontSize: 14 }} /></Box>
      <span>{children}</span>
    </Box>
  );
}

// One product page: what it does, how it works step by step, what to know, and the other pages.
export function FeatureView({ slug }: { slug: FeatureSlug }) {
  const { L, P } = useCopy();
  const page = P.features[slug], i = featureSlugs.indexOf(slug);
  const prev = featureSlugs[i - 1], next = featureSlugs[i + 1];
  return (
    <Shell active="product" trail={page.tab}>
      <Box sx={{ display: "grid", gap: 2 }}>
        <Typography component="h1" className="rise" sx={h1}>{page.title}</Typography>
        <Typography className="rise" style={{ "--i": 1 } as React.CSSProperties} sx={lead}>{page.lead}</Typography>
      </Box>
      <Box component="section" aria-labelledby="steps-h" sx={{ display: "grid", gap: 2 }}>
        <Typography id="steps-h" component="h2" sx={h2}>{L.stepsHead}</Typography>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))" } }}>
          {page.steps.map((s, k) => (
            <Box component="li" key={s.t} className="rise" style={{ "--i": k } as React.CSSProperties} sx={{ ...card, gridTemplateColumns: "32px minmax(0,1fr)", columnGap: 1.5 }}>
              <Box aria-hidden="true" sx={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "0.875rem", fontWeight: 600, color: "primary.main", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.12)", fontVariantNumeric: "tabular-nums" }}>{k + 1}</Box>
              <Typography component="h3" sx={{ m: 0, alignSelf: "center", fontSize: "1.0625rem", fontWeight: 600, lineHeight: 1.5 }}>{s.t}</Typography>
              <Typography sx={{ gridColumn: 2, fontSize: "0.9375rem", lineHeight: 1.75, color: "text.secondary", textWrap: "pretty" }}>{s.d}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Box component="section" aria-labelledby="good-h" sx={{ ...card, p: { xs: 2.5, md: 3.5 }, gap: 2 }}>
        <Typography id="good-h" component="h2" sx={{ ...h2, fontSize: "1.25rem" }}>{L.goodHead}</Typography>
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1.25 }}>
          {page.good.map((g) => (
            <Box component="li" key={g} sx={{ display: "flex", gap: 1.25, fontSize: "0.9375rem", lineHeight: 1.7 }}>
              <CheckRoundedIcon aria-hidden="true" sx={{ mt: 0.5, fontSize: 18, color: "evidence.verified", flexShrink: 0 }} /><span>{g}</span>
            </Box>
          ))}
        </Box>
        <Note>{page.note}</Note>
      </Box>
      <Box component="section" aria-labelledby="more-h" sx={{ display: "grid", gap: 2 }}>
        <Typography id="more-h" component="h2" sx={{ ...h2, fontSize: "1.25rem" }}>{L.other}</Typography>
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(3, minmax(0,1fr))" } }}>
          {featureSlugs.map((s) => (
            <li key={s}>
              <Box component={Link} href={`/features/${s}`} aria-current={s === slug ? "page" : undefined} sx={{ display: "grid", gap: 0.25, minHeight: 44, p: 1.75, border: 1, borderColor: s === slug ? "primary.main" : "divider", borderRadius: 3, bgcolor: s === slug ? "rgb(var(--mui-palette-primary-mainChannel) / 0.08)" : "background.paper", color: "text.primary", textDecoration: "none", transition: "border-color 160ms ease-out, background-color 160ms ease-out", "&:hover": { borderColor: "primary.main" }, ...ring }}>
                <Typography component="span" sx={{ fontSize: "0.9375rem", fontWeight: 600 }}>{P.features[s].tab}</Typography>
                <Typography component="span" sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}>{P.features[s].blurb}</Typography>
              </Box>
            </li>
          ))}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 1.5 }}>
          {prev ? <Button component={Link} href={`/features/${prev}`} color="inherit" startIcon={<ArrowBackRoundedIcon />} sx={{ minHeight: 44, ...ring }}>{L.prev}: {P.features[prev].tab}</Button> : <span />}
          {next ? <Button component={Link} href={`/features/${next}`} color="inherit" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 44, ...ring }}>{L.next}: {P.features[next].tab}</Button> : <span />}
        </Box>
      </Box>
    </Shell>
  );
}

// "How it works" and "FAQ": sections of short titled points.
export function InfoView({ kind }: { kind: "how" | "faq" }) {
  const { L, P } = useCopy();
  const page = P[kind];
  return (
    <Shell active={kind} trail={kind === "how" ? L.navHow : L.navCheck}>
      <Box sx={{ display: "grid", gap: 2 }}>
        <Typography component="h1" className="rise" sx={h1}>{page.title}</Typography>
        <Typography className="rise" style={{ "--i": 1 } as React.CSSProperties} sx={lead}>{page.lead}</Typography>
      </Box>
      {page.sections.map((sec, si) => (
        <Box component="section" key={sec.head} aria-labelledby={`sec-${si}`} sx={{ display: "grid", gap: 2 }}>
          <Typography id={`sec-${si}`} component="h2" sx={h2}>{sec.head}</Typography>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: kind === "faq" ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))" } }}>
            {sec.items.map((it, k) => (
              <Box component="li" key={it.t} className="rise" style={{ "--i": k } as React.CSSProperties} sx={card}>
                <Typography component="h3" sx={{ m: 0, fontSize: "1.0625rem", fontWeight: 600, lineHeight: 1.5 }}>{it.t}</Typography>
                <Typography sx={{ fontSize: "0.9375rem", lineHeight: 1.75, color: "text.secondary", textWrap: "pretty" }}>{it.d}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
      <Note>{page.note}</Note>
    </Shell>
  );
}

// The guide is not written yet: say so plainly and point to what exists.
export function DocsView() {
  const { L, P } = useCopy();
  const d = P.docs;
  return (
    <Shell active="docs" trail={L.navDocs}>
      <Box className="rise" sx={{ display: "grid", gap: 2, justifyItems: "start" }}>
        <Box component="span" role="status" sx={{ px: 1.5, py: 0.5, borderRadius: 999, border: 1, borderColor: "evidence.unverified", color: "evidence.unverified", fontSize: "0.875rem", fontWeight: 600 }}>{L.soon}</Box>
        <Typography component="h1" sx={h1}>{d.title}</Typography>
        <Typography sx={lead}>{d.lead}</Typography>
        <Typography sx={{ ...lead, fontSize: "1rem" }}>{d.body}</Typography>
      </Box>
      <Box component="section" aria-labelledby="docs-links" sx={{ display: "grid", gap: 2 }}>
        <Typography id="docs-links" component="h2" sx={{ ...h2, fontSize: "1.25rem" }}>{d.links}</Typography>
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))" } }}>
          {([["/how-it-works", L.navHow, P.how.lead], ["/faq", L.navCheck, P.faq.lead]] as const).map(([href, t, n]) => (
            <li key={href}>
              <Box component={Link} href={href} sx={{ display: "grid", gap: 0.25, minHeight: 44, p: 2, border: 1, borderColor: "divider", borderRadius: 3, bgcolor: "background.paper", color: "text.primary", textDecoration: "none", transition: "border-color 160ms ease-out", "&:hover": { borderColor: "primary.main" }, ...ring }}>
                <Typography component="span" sx={{ fontWeight: 600 }}>{t}</Typography>
                <Typography component="span" sx={{ fontSize: "0.875rem", color: "text.secondary", lineHeight: 1.6 }}>{n}</Typography>
              </Box>
            </li>
          ))}
        </Box>
      </Box>
    </Shell>
  );
}
