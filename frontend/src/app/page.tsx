"use client";
import Link from "next/link";
import { Box, Button, Typography } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import { ArrowPill, LandingHeader, lift, ring, wrap } from "@/components/landing/LandingHeader";
import { useHydrated } from "@/lib/history";
import { PACK_IDS } from "@/lib/packs";
import { usePrefs } from "@/lib/prefs";
import { usableCounts } from "@/lib/sources";
import { landing } from "@/lib/strings";
import { dur, ease } from "@/lib/motion";

const card = { borderRadius: "24px", border: 1, borderColor: "color-mix(in srgb, var(--mui-palette-divider) 60%, transparent)", bgcolor: "background.paper", boxShadow: lift } as const;
const h2 = { m: 0, fontSize: { xs: "2rem", md: "2.75rem" }, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.015em", textWrap: "balance" } as const;
const body = { fontSize: "0.9375rem", lineHeight: 1.75, color: "text.secondary", textWrap: "pretty" } as const;
const bar = (w: string, o = 1) => ({ height: 7, width: w, borderRadius: 99, bgcolor: "text.primary", opacity: 0.13 * o }) as const;

// A small floating note pinned to the answer sheet (what the agent did).
function Note({ icon, t, d, sx }: { icon: React.ReactNode; t: string; d: string; sx: object }) {
  return (
    <Box className="fig-note" sx={{ position: "absolute", display: "flex", alignItems: "center", gap: 1.25, py: 1, pl: 1, pr: 2, borderRadius: "14px", bgcolor: "background.paper", border: 1, borderColor: "divider", boxShadow: lift, ...sx }}>
      <Box sx={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: "50%", bgcolor: "surface.aiSoft", color: "surface.ai", flexShrink: 0, "& svg": { fontSize: 18 } }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4 }}>{t}</Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary", lineHeight: 1.4 }}>{d}</Typography>
      </Box>
    </Box>
  );
}

// The hero figure: a cited answer as a sheet of paper. Pure markup, decorative (the words beside it carry the meaning).
// The one authored motion moment: the answer lines write themselves in, the citations land, then the notes slide onto the sheet.
function AnswerSheet({ L }: { L: (typeof landing)["th"] | (typeof landing)["en"] }) {
  const lines: [string, string?][] = [["100%"], ["94%", "1"], ["97%"], ["62%", "2"], ["0"], ["100%"], ["88%", "3"], ["45%"]];
  return (
    <Box aria-hidden="true" sx={{
      position: "relative", mx: { xs: 1, sm: 4, md: 0 },
      "@media (prefers-reduced-motion: no-preference)": {
        "& .fig-line": { animation: `fig-write 900ms ${ease} both`, transformOrigin: "left", animationDelay: "calc(250ms + var(--i) * 110ms)" },
        "& .fig-cite": { animation: `fig-land 420ms ${ease} both`, animationDelay: "calc(500ms + var(--i) * 110ms)" },
        "& .fig-note": { animation: `fig-slide 700ms ${ease} both`, animationDelay: "1.3s" },
        "& .fig-note + .fig-note": { animationDelay: "1.55s" },
        "@keyframes fig-write": { from: { transform: "scaleX(0.04)" }, to: { transform: "none" } },
        "@keyframes fig-land": { from: { transform: "translateY(-6px) scale(0.6)" }, to: { transform: "none" } },
        "@keyframes fig-slide": { from: { transform: "translateX(12px)", filter: "blur(3px)" }, to: { transform: "none", filter: "none" } },
      },
    }}>
      <Box sx={{ position: "relative", ...card, borderRadius: "14px", px: { xs: 3, md: 4 }, pt: { xs: 3, md: 3.5 }, pb: { xs: 4, md: 5 }, minHeight: { md: 470 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1.5, borderBottom: 2, borderColor: "text.primary" }}>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>AI Scientist</Typography>
          <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{L.figAnswer}</Typography>
        </Box>
        <Typography sx={{ mt: 2, fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.6, textWrap: "pretty" }}>{L.example}</Typography>
        <Box sx={{ mt: 2.5, display: "grid", gap: 1.5, pl: 2, borderLeft: 1, borderColor: "surface.ai" }}>
          {lines.map(([w, n], i) => w === "0" ? <Box key={i} sx={{ height: 4 }} /> : (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75 }} style={{ "--i": i } as React.CSSProperties}>
              <Box className="fig-line" sx={{ ...bar(w), flexShrink: 1 }} />
              {n && <Box className="fig-cite" sx={{ flexShrink: 0, px: 0.75, borderRadius: 1, fontSize: "0.625rem", fontWeight: 700, lineHeight: "16px", bgcolor: "surface.aiSoft", color: "surface.ai" }}>{n}</Box>}
            </Box>
          ))}
        </Box>
        <Typography sx={{ mt: 3.5, mb: 1.25, fontSize: "0.6875rem", fontWeight: 600, color: "text.secondary" }}>{L.figRefs}</Typography>
        {[["DOI", "70%"], ["PMID", "58%"], ["arXiv", "64%"]].map(([k, w], i) => (
          <Box key={k} sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75, borderTop: i ? 1 : 0, borderColor: "divider" }}>
            <Typography sx={{ width: 16, fontSize: "0.6875rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{i + 1}</Typography>
            <Box sx={{ ...bar(w, 0.8), flex: "none" }} />
            <Box sx={{ ml: "auto", display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.625rem", fontWeight: 600, color: "evidence.verified" }}><CheckCircleRoundedIcon sx={{ fontSize: 13 }} />{k}</Box>
          </Box>
        ))}
        <Note icon={<TravelExploreRoundedIcon />} t={L.chipSearch.t} d={L.chipSearch.d} sx={{ top: { xs: 120, md: 150 }, left: { xs: -8, md: -56 } }} />
        <Note icon={<VerifiedOutlinedIcon />} t={L.chipCheck.t} d={L.chipCheck.d} sx={{ bottom: { xs: -18, md: 56 }, right: { xs: -8, md: -40 } }} />
      </Box>
    </Box>
  );
}

export default function Home() {
  const hydrated = useHydrated();
  const prefLang = usePrefs((s) => s.lang);
  const lang = hydrated ? prefLang : "th";
  const L = landing[lang];
  const [b1, b2] = L.titleB.split("|");
  const usable = usableCounts();
  const stats = [String(usable.all), String(PACK_IDS.length), L.langs, L.exportFormats];
  const section = { ...wrap, maxWidth: 1180, scrollMarginTop: 96 } as const;

  return (
    <Box lang={lang} sx={{
      position: "relative", overflow: "clip",
      // cool paper with one soft wash of light behind the hero, and faint ruled lines like a scanner bed under the figure
      "&::before": { content: '""', position: "absolute", inset: "0 0 auto 0", height: 1000, pointerEvents: "none",
        backgroundImage: "radial-gradient(55% 60% at 80% 18%, rgb(var(--mui-palette-primary-mainChannel) / 0.16), transparent 70%), radial-gradient(40% 45% at 8% 70%, rgb(255 255 255 / 0.5), transparent 70%)",
        "[data-dark] &": { backgroundImage: "radial-gradient(55% 60% at 80% 18%, rgb(var(--mui-palette-primary-mainChannel) / 0.14), transparent 70%)" } },
    }}>
      <LandingHeader />

      <Box component="main" id="content" tabIndex={-1} sx={{ position: "relative", outline: "none" }}>
        {/* hero */}
        <Box sx={{ ...section, pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 12 }, display: "grid", gap: { xs: 7, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.1fr) minmax(0,0.9fr)" }, alignItems: "center", gridTemplateAreas: { xs: '"h1" "text" "fig"', md: '"h1 h1" "text fig"' } }}>
          <Typography component="h1" sx={{ m: 0, gridArea: "h1", fontSize: { xs: "2.375rem", sm: "3rem", lg: "3.75rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>
            {[L.titleA, b1].map((x) => <Box key={x} component="span" sx={{ display: lang === "th" ? "inline-block" : "inline", mr: "0.25em" }}>{x}</Box>)}
            <Box component="span" sx={{ display: lang === "th" ? "inline-block" : "inline", color: "primary.main" }}>{b2}</Box>
          </Typography>
          <Box sx={{ gridArea: "text" }}>
            <Typography sx={{ mt: { xs: 3, md: 4 }, maxWidth: "36rem", fontSize: { xs: "1rem", md: "1.0625rem" }, lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{L.lead}</Typography>
            <Box sx={{ mt: { xs: 4, md: 5 }, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
              <ArrowPill href="/chat" big>{L.cta}</ArrowPill>
              <Button component="a" href="#how" color="inherit" sx={{ minHeight: 52, px: 2.5, borderRadius: 999, fontSize: "1rem", fontWeight: 500, color: "text.secondary", "&:hover": { color: "text.primary", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.06)" }, ...ring }}>{L.how}</Button>
            </Box>
            <Typography sx={{ mt: 1.5, fontSize: "0.875rem", color: "text.secondary" }}>{L.footerSub}</Typography>
            <Box component={Link} href="/chat" aria-label={`${L.example}. ${L.exampleHint}`}
              sx={{ mt: { xs: 4, md: 6 }, display: "flex", gap: 1.5, alignItems: "flex-start", maxWidth: "36rem", p: 2, borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 55%, transparent)", color: "text.primary", textDecoration: "none", transition: `background-color ${dur.quick}ms ${ease}, border-color ${dur.quick}ms ${ease}`, ...ring, "&:hover": { bgcolor: "background.paper", borderColor: "primary.main" } }}>
              <Box>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{L.exampleLabel}</Typography>
                <Typography sx={{ mt: 0.25, fontSize: "0.9375rem", lineHeight: 1.6, textWrap: "pretty" }}>“{L.example}”</Typography>
                <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: "primary.main", fontWeight: 600 }}>{L.exampleHint}</Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ gridArea: "fig" }}><AnswerSheet L={L} /></Box>
        </Box>

        {/* the numbers, all read from the code: a tone step, no rules */}
        <Box component="section" aria-label={L.stats[0].t} sx={{ bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 45%, transparent)" }}>
          <Box sx={{ ...section, py: { xs: 4, md: 6 }, display: "grid", gap: { xs: 4, md: 6 }, gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
            {L.stats.map((s, i) => (
              <Box key={s.t}>
                <Typography sx={{ fontSize: { xs: "1.75rem", md: "2.5rem" }, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{stats[i]}</Typography>
                <Typography sx={{ mt: 1, fontSize: "0.875rem", fontWeight: 600 }}>{s.t}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.6 }}>{s.d.replace("{papers}", String(usable.papers)).replace("{dbs}", String(usable.dbs))}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* the statement */}
        <Box component="section" aria-labelledby="pain-h" sx={{ ...section, py: { xs: 9, md: 14 } }}>
          <Typography id="pain-h" component="h2" sx={{ ...h2, fontSize: { xs: "1.625rem", md: "2.5rem" }, lineHeight: 1.45, maxWidth: "26em" }}>
            {L.painA}<Box component="span" sx={{ color: "text.secondary", opacity: 0.75 }}>{L.painB}</Box>{L.painC}
          </Typography>
          <Typography sx={{ ...body, mt: 3, fontSize: "1.0625rem", maxWidth: "38rem" }}>{L.painSub}</Typography>
        </Box>

        {/* capabilities: one lead card with the plan as a real fragment, then the other tools as a plain list in large type */}
        <Box id="why" component="section" aria-labelledby="cap-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <Typography id="cap-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>
            {L.capTitle.split("|").map((x) => <Box key={x} component="span" sx={{ display: "block" }}>{x}</Box>)}
          </Typography>
          <Box sx={{ ...card, p: { xs: 3, md: 5 }, display: "grid", gap: { xs: 4, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.1fr) minmax(0,1fr)" }, alignItems: "center" }}>
            <Box>
              <Typography component="h3" sx={{ m: 0, fontSize: { xs: "1.5rem", md: "2rem" }, fontWeight: 700, lineHeight: 1.4, textWrap: "balance" }}>{L.capMain.t}</Typography>
              <Typography sx={{ mt: 1.5, fontSize: "0.875rem", color: "text.secondary" }}>{L.capMain.tabs.join(" · ")}</Typography>
              <Typography sx={{ ...body, mt: 2, fontSize: "1rem", maxWidth: "36rem" }}>{L.capMain.d}</Typography>
              <Box component="ul" sx={{ m: 0, mt: 3, p: 0, listStyle: "none", display: "grid", gap: 1.5 }}>
                {L.capMain.bullets.map((x) => <Box component="li" key={x} sx={{ ...body, fontSize: "0.9375rem" }}>{x}</Box>)}
              </Box>
            </Box>
            <Box aria-hidden="true" sx={{ p: 2.5, borderRadius: "16px", bgcolor: "surface.shell" }}>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: "surface.ai" }}>{L.capMain.plan}</Typography>
              <Box sx={{ mt: 1.5, pl: 1.75, borderLeft: 1, borderColor: "surface.ai", display: "grid", gap: 1.5 }}>
                {["retrieval-augmented generation clinical QA", "LLM fine-tuning medical question answering", "RAG versus fine-tuning benchmark"].map((q) => (
                  <Typography key={q} sx={{ fontSize: "0.875rem", lineHeight: 1.5 }}>{q}</Typography>
                ))}
              </Box>
            </Box>
          </Box>
          <Box component="ul" sx={{ m: 0, mt: { xs: 5, md: 8 }, p: 0, listStyle: "none", display: "grid", columnGap: 8, rowGap: { xs: 4, md: 5 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            {[L.capCheck, L.capData, ...L.capMore].map((c) => (
              <Box component="li" key={c.t}>
                <Typography component="h3" sx={{ m: 0, fontSize: { xs: "1.25rem", md: "1.5rem" }, fontWeight: 700, lineHeight: 1.4 }}>{c.t}</Typography>
                <Typography sx={{ ...body, mt: 1, fontSize: "1rem", maxWidth: "34rem" }}>{c.d}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* how it works: three steps, "Step N" in words */}
        <Box id="how" component="section" aria-labelledby="how-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <Typography id="how-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>{L.howTitle}</Typography>
          <Box component="ol" aria-label={L.howTitle} sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: { xs: 4, md: 8 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(3, minmax(0,1fr))" } }}>
            {L.steps.map((s, i) => (
              <Box component="li" key={s.t}>
                <Typography sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{L.stepN.replace("{n}", String(i + 1))}</Typography>
                <Typography component="h3" sx={{ m: 0, mt: 0.5, fontSize: { xs: "1.5rem", md: "2rem" }, fontWeight: 700, lineHeight: 1.4 }}>{s.t}</Typography>
                <Typography sx={{ ...body, mt: 1.5, fontSize: "1rem" }}>{s.d}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* where the data goes: the one external hop as the tinted lead, the other three as a plain list */}
        <Box component="section" aria-labelledby="data-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <Typography id="data-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>{L.dataTitle}</Typography>
          <Box sx={{ display: "grid", gap: { xs: 4, md: 8 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1fr) minmax(0,1fr)" }, alignItems: "start" }}>
            <Box sx={{ p: { xs: 3, md: 5 }, borderRadius: "24px", bgcolor: "surface.aiSoft" }}>
              <Typography component="h3" sx={{ m: 0, fontSize: { xs: "1.375rem", md: "1.75rem" }, fontWeight: 700, lineHeight: 1.4 }}>{L.data[0].t}</Typography>
              <Typography sx={{ ...body, mt: 1.5, fontSize: "1rem", color: "text.primary" }}>{L.data[0].d}</Typography>
            </Box>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {L.data.slice(1).map((c) => (
                <Box component="li" key={c.t}>
                  <Typography component="h3" sx={{ m: 0, fontSize: { xs: "1.125rem", md: "1.25rem" }, fontWeight: 700, lineHeight: 1.5 }}>{c.t}</Typography>
                  <Typography sx={{ ...body, mt: 0.75, fontSize: "1rem", maxWidth: "34rem" }}>{c.d}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
          <Typography sx={{ ...body, mt: 4, fontSize: "0.875rem" }}>{L.scope}</Typography>
        </Box>

        <Box id="faq" component="section" aria-labelledby="faq-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <Typography id="faq-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>{L.faqTitle}</Typography>
          <Box sx={{ display: "grid", gap: { xs: 3, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            {[[L.checkTitle, L.checkBody], [L.scopeQ, L.scope]].map(([q, a]) => (
              <Box key={q}>
                <Typography component="h3" sx={{ m: 0, fontSize: { xs: "1.25rem", md: "1.5rem" }, fontWeight: 700, lineHeight: 1.5 }}>{q}</Typography>
                <Typography sx={{ ...body, mt: 1.5, fontSize: "1rem" }}>{a}</Typography>
              </Box>
            ))}
          </Box>
          <Box component={Link} href="/faq" sx={{ mt: 4, display: "inline-flex", alignItems: "center", gap: 0.5, fontWeight: 600, color: "primary.main", textDecoration: "none", minHeight: 44, ...ring, "&:hover": { textDecoration: "underline" } }}>{L.faqMore}<ArrowForwardRoundedIcon sx={{ fontSize: 18 }} /></Box>
        </Box>
      </Box>

      <Box component="footer" sx={{ position: "relative", px: { xs: 2, sm: 4 }, pb: { xs: 4, md: 6 } }}>
        <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 3, md: 6 }, py: { xs: 5, md: 7 }, borderRadius: "24px", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.1)", display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: { md: "center" }, justifyContent: "space-between" }}>
          <Box>
            <Typography sx={{ fontSize: { xs: "1.5rem", md: "2rem" }, fontWeight: 700, lineHeight: 1.4, textWrap: "balance" }}>{L.footer}</Typography>
            <Typography sx={{ ...body, mt: 0.75 }}>{L.footerSub}</Typography>
          </Box>
          <Box sx={{ flexShrink: 0 }}><ArrowPill href="/chat" big>{L.cta}</ArrowPill></Box>
        </Box>
      </Box>
    </Box>
  );
}
