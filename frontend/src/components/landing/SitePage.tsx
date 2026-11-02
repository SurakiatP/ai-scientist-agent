"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { useHydrated } from "@/lib/history";
import { usePrefs } from "@/lib/prefs";
import { featureSlugs, landing, sitePages, type FeatureSlug } from "@/lib/strings";
import { ArrowPill, LandingHeader, ring, wrap, type NavKey } from "./LandingHeader";
import { dur, ease } from "@/lib/motion";

const rise = { "@media (prefers-reduced-motion: no-preference)": { "& .rise": { animation: `site-rise ${dur.slow}ms ${ease} both`, animationDelay: "calc(var(--i, 0) * 40ms)" }, "@keyframes site-rise": { from: { transform: "translateY(12px)" }, to: { transform: "none" } } } } as const;

export function useCopy() {
  const lang = usePrefs((s) => s.lang), hydrated = useHydrated();
  const l = hydrated ? lang : "th";
  return { lang: l, L: landing[l], P: sitePages[l] };
}

// Shell of every public page behind the header menu: header, breadcrumb, content, and a closing way in.
export function Shell({ active, trail, children }: { active: NavKey; trail: string; children: ReactNode }) {
  const { lang, L } = useCopy();
  return (
    <Box lang={lang} sx={{ ...rise, position: "relative", overflow: "clip" }}>
      <LandingHeader active={active} />
      <Box component="main" id="content" tabIndex={-1} sx={{ ...wrap, outline: "none", maxWidth: 1080, py: { xs: 3, md: 6 }, display: "grid", gap: { xs: 6, md: 10 } }}>
        <Box component="nav" aria-label="breadcrumb" sx={{ display: "flex", flexWrap: "wrap", gap: 1, fontSize: "0.875rem", color: "text.secondary" }}>
          <Box component={Link} href="/" sx={{ color: "inherit", ...ring, "&:hover": { color: "text.primary" } }}>{L.home}</Box><span aria-hidden="true">/</span>
          <Box component="span" aria-current="page" sx={{ color: "text.primary", fontWeight: 500 }}>{trail}</Box>
        </Box>
        {children}
      </Box>
      <Box component="footer" sx={{ ...wrap, maxWidth: 1080, pb: { xs: 5, md: 7 } }}>
        <Box sx={{ p: { xs: 3, md: 5 }, borderRadius: "24px", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.1)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 3 }}>
          <Typography component="p" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "2rem" }, fontWeight: 700, lineHeight: 1.4, textWrap: "balance" }}>{L.footer}</Typography>
          <ArrowPill href="/chat" big>{L.cta}</ArrowPill>
        </Box>
      </Box>
    </Box>
  );
}

export const h1 = { m: 0, fontSize: { xs: "2.25rem", md: "3.25rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", textWrap: "balance", maxWidth: "20em" } as const;
export const lead = { m: 0, maxWidth: "40rem", fontSize: { xs: "1.0625rem", md: "1.25rem" }, lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" } as const;
export const h2 = { m: 0, fontSize: { xs: "1.5rem", md: "2rem" }, fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.01em", textWrap: "balance" } as const;
const idx = (k: number) => ({ "--i": k }) as React.CSSProperties;

// A section: its heading on the left, the content on the right at desktop; stacked on a phone. No rules, no boxes.
function Part({ id, head, children }: { id: string; head: string; children: ReactNode }) {
  return (
    <Box component="section" aria-labelledby={id} sx={{ display: "grid", gap: { xs: 3, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) minmax(0,2.2fr)" }, alignItems: "start" }}>
      <Typography id={id} component="h2" sx={{ ...h2, position: { md: "sticky" }, top: { md: 96 } }}>{head}</Typography>
      <Box>{children}</Box>
    </Box>
  );
}

// Titled points as large type: the title, then what it means. `n` marks an ordered list with "Step N" in words.
function Points({ items, n, label }: { items: readonly { t: string; d: string }[]; n?: string; label?: string }) {
  return (
    <Box component={n ? "ol" : "ul"} aria-label={label} sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: { xs: 4, md: 5 } }}>
      {items.map((it, k) => (
        <Box component="li" key={it.t} className="rise" style={idx(k)} sx={{ display: "grid", gap: 0.75 }}>
          {n && <Typography component="span" sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{n.replace("{n}", String(k + 1))}</Typography>}
          <Typography component="h3" sx={{ m: 0, fontSize: { xs: "1.25rem", md: "1.5rem" }, fontWeight: 700, lineHeight: 1.4 }}>{it.t.replace(/^\d+\.\s*/, "")}</Typography>
          <Typography sx={{ maxWidth: "38rem", fontSize: "1rem", lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{it.d}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ maxWidth: "38rem", color: "text.secondary", fontSize: "1rem", lineHeight: 1.8 }}>{children}</Box>
  );
}

function Intro({ title, lead: text }: { title: string; lead: string }) {
  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <Typography component="h1" className="rise" sx={h1}>{title}</Typography>
      <Typography className="rise" style={idx(1)} sx={lead}>{text}</Typography>
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
      <Intro title={page.title} lead={page.lead} />
      <Part id="steps-h" head={L.stepsHead}><Points items={page.steps} n={L.stepN} label={L.stepsHead} /></Part>
      <Part id="good-h" head={L.goodHead}>
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 2 }}>
            {page.good.map((g) => <Box component="li" key={g}><Note>{g}</Note></Box>)}
          </Box>
          <Typography sx={{ maxWidth: "38rem", mt: 1, fontSize: "1.0625rem", lineHeight: 1.8, fontWeight: 600 }}>{page.note}</Typography>
        </Box>
      </Part>
      <Part id="more-h" head={L.other}>
        <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1 }}>
          {featureSlugs.map((s) => (
            <li key={s}>
              <Box component={Link} href={`/features/${s}`} aria-current={s === slug ? "page" : undefined} sx={{ display: "grid", gap: 0.25, minHeight: 44, py: 1, color: s === slug ? "primary.main" : "text.primary", textDecoration: "none", ...ring, "&:hover .t": { color: "primary.main" } }}>
                <Typography className="t" component="span" sx={{ fontSize: { xs: "1.25rem", md: "1.5rem" }, fontWeight: 700, lineHeight: 1.4, transition: `color ${dur.quick}ms ${ease}` }}>{P.features[s].tab}</Typography>
                <Typography component="span" sx={{ fontSize: "0.9375rem", color: "text.secondary", lineHeight: 1.6 }}>{P.features[s].blurb}</Typography>
              </Box>
            </li>
          ))}
        </Box>
        <Box sx={{ mt: 3, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 1.5 }}>
          {prev ? <Button component={Link} href={`/features/${prev}`} color="inherit" startIcon={<ArrowBackRoundedIcon />} sx={{ minHeight: 44, ...ring }}>{L.prev}: {P.features[prev].tab}</Button> : <span />}
          {next ? <Button component={Link} href={`/features/${next}`} color="inherit" endIcon={<ArrowForwardRoundedIcon />} sx={{ minHeight: 44, ...ring }}>{L.next}: {P.features[next].tab}</Button> : <span />}
        </Box>
      </Part>
    </Shell>
  );
}

// "How it works" and "FAQ": sections of short titled points. The ordered section of "how" counts its steps.
export function InfoView({ kind }: { kind: "how" | "faq" }) {
  const { L, P } = useCopy();
  const page = P[kind];
  return (
    <Shell active={kind} trail={kind === "how" ? L.navHow : L.navCheck}>
      <Intro title={page.title} lead={page.lead} />
      {page.sections.map((sec, si) => (
        page.sections.length === 1 ? <Points key={sec.head} items={sec.items} label={sec.head} /> : (
          <Part key={sec.head} id={`sec-${si}`} head={sec.head}><Points items={sec.items} n={kind === "how" && si === 0 ? L.stepN : undefined} label={sec.head} /></Part>
        )
      ))}
      <Note>{kind === "faq" ? page.note.split(L.navHow).flatMap((x, i) => i ? [<Box key={i} component={Link} href="/how-it-works" sx={{ color: "primary.main", ...ring }}>{L.navHow}</Box>, x] : [x]) : page.note}</Note>
    </Shell>
  );
}
