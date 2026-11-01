"use client";
import Link from "next/link";
import { Box, Button, Typography } from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import TerminalRoundedIcon from "@mui/icons-material/TerminalRounded";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import GavelRoundedIcon from "@mui/icons-material/GavelRounded";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import { ArrowPill, LandingHeader, lift, ring, wrap } from "@/components/landing/LandingHeader";
import { useHydrated } from "@/lib/history";
import { PACK_IDS } from "@/lib/packs";
import { usePrefs } from "@/lib/prefs";
import { SOURCE_NAMES } from "@/lib/sources";
import { landing } from "@/lib/strings";

const out = "cubic-bezier(0.22, 1, 0.36, 1)";
const line = "1px solid var(--mui-palette-divider)"; // responsive border values need the full shorthand (a bare 1 loses the colour)
const card = { borderRadius: "24px", border: 1, borderColor: "color-mix(in srgb, var(--mui-palette-divider) 60%, transparent)", bgcolor: "background.paper", boxShadow: lift } as const;
const label = { fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.08em", color: "text.secondary", textTransform: "uppercase" } as const;
const h2 = { m: 0, fontSize: { xs: "2rem", md: "2.75rem" }, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.015em", textWrap: "balance" } as const;
const body = { fontSize: "0.9375rem", lineHeight: 1.75, color: "text.secondary", textWrap: "pretty" } as const;
const bar = (w: string, o = 1) => ({ height: 7, width: w, borderRadius: 99, bgcolor: "text.primary", opacity: 0.13 * o }) as const;

// "02 // ความสามารถ" with a hairline running to the edge: the page reads as one numbered document.
function SectionLabel({ n, children }: { n: number; children: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: { xs: 2.5, md: 3.5 } }}>
      <Typography component="span" sx={{ fontSize: "0.8125rem", color: "text.secondary", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{String(n).padStart(2, "0")}{" //"}</Typography>
      <Typography component="span" sx={{ fontSize: "0.875rem", color: "text.secondary", whiteSpace: "nowrap" }}>{children}</Typography>
      <Box aria-hidden="true" sx={{ flex: 1, borderTop: 1, borderColor: "divider" }} />
    </Box>
  );
}

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
      position: "relative", pt: 4, mx: { xs: 1, sm: 4, md: 0 },
      "@media (prefers-reduced-motion: no-preference)": {
        "& .fig-line": { animation: `fig-write 900ms ${out} both`, transformOrigin: "left", animationDelay: "calc(250ms + var(--i) * 110ms)" },
        "& .fig-cite": { animation: `fig-land 420ms ${out} both`, animationDelay: "calc(500ms + var(--i) * 110ms)" },
        "& .fig-note": { animation: `fig-slide 700ms ${out} both`, animationDelay: "1.3s" },
        "& .fig-note + .fig-note": { animationDelay: "1.55s" },
        "@keyframes fig-write": { from: { transform: "scaleX(0.04)" }, to: { transform: "none" } },
        "@keyframes fig-land": { from: { transform: "translateY(-6px) scale(0.6)" }, to: { transform: "none" } },
        "@keyframes fig-slide": { from: { transform: "translateX(14px)", filter: "blur(4px)" }, to: { transform: "none", filter: "none" } },
      },
    }}>
      <Typography sx={{ position: "absolute", top: 0, left: 4, ...label, fontSize: "0.6875rem" }}>{L.figLabel}</Typography>
      <Box sx={{ position: "relative", ...card, borderRadius: "14px", px: { xs: 3, md: 4 }, pt: { xs: 3, md: 3.5 }, pb: { xs: 4, md: 5 }, minHeight: { md: 470 }, boxShadow: "0 40px 80px -40px rgb(28 78 143 / 0.45), 0 4px 14px -6px rgb(14 26 44 / 0.12)" }}>
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
  const stats = [String(Object.keys(SOURCE_NAMES).length), String(PACK_IDS.length), L.langs, L.exportFormats];
  const dataIcons = [CloudUploadOutlinedIcon, TerminalRoundedIcon, KeyOutlinedIcon, GavelRoundedIcon];
  const moreIcons = [PictureAsPdfOutlinedIcon, IosShareRoundedIcon, HubOutlinedIcon];
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

      <Box sx={{ position: "relative" }}>
        {/* hero */}
        <Box sx={{ ...section, pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 12 }, display: "grid", gap: { xs: 7, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.1fr) minmax(0,0.9fr)" }, alignItems: "center" }}>
          <Box>
            <Typography sx={label}>{L.heroLabel}</Typography>
            <Typography component="h1" sx={{ m: 0, mt: 2.5, fontSize: { xs: "2.375rem", sm: "3rem", lg: "3.75rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>
              <Box component="span" sx={{ display: "block" }}>{L.titleA}</Box>
              <Box component="span" sx={{ display: "block" }}>{b1}</Box>
              <Box component="span" sx={{ display: "block", color: "primary.main" }}>{b2}</Box>
            </Typography>
            <Typography sx={{ mt: { xs: 3, md: 4 }, maxWidth: "36rem", fontSize: { xs: "1rem", md: "1.0625rem" }, lineHeight: 1.8, color: "text.secondary", textWrap: "pretty" }}>{L.lead}</Typography>
            <Box sx={{ mt: { xs: 4, md: 5 }, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
              <ArrowPill href="/chat" big>{L.cta}</ArrowPill>
              <Button component="a" href="#how" color="inherit" sx={{ minHeight: 52, px: 2.5, borderRadius: 999, fontSize: "1rem", fontWeight: 500, color: "text.secondary", "&:hover": { color: "text.primary", bgcolor: "rgb(var(--mui-palette-primary-mainChannel) / 0.06)" }, ...ring }}>{L.how}</Button>
            </Box>
            <Typography sx={{ mt: 1.5, fontSize: "0.875rem", color: "text.secondary" }}>{L.footerSub}</Typography>
            <Box component={Link} href="/chat" aria-label={`${L.example}. ${L.exampleHint}`}
              sx={{ mt: { xs: 4, md: 6 }, display: "flex", gap: 1.5, alignItems: "flex-start", maxWidth: "36rem", p: 2, borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 55%, transparent)", color: "text.primary", textDecoration: "none", transition: `background-color 200ms ${out}, border-color 200ms ${out}`, ...ring, "&:hover": { bgcolor: "background.paper", borderColor: "primary.main" } }}>
              <AutoAwesomeRoundedIcon sx={{ mt: 0.25, fontSize: 18, color: "surface.ai" }} />
              <Box>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{L.exampleLabel}</Typography>
                <Typography sx={{ mt: 0.25, fontSize: "0.9375rem", lineHeight: 1.6, textWrap: "pretty" }}>“{L.example}”</Typography>
                <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: "primary.main", fontWeight: 600 }}>{L.exampleHint}</Typography>
              </Box>
            </Box>
          </Box>
          <AnswerSheet L={L} />
        </Box>

        {/* the numbers, all read from the code */}
        <Box component="section" aria-label={L.stats[0].t} sx={{ borderBlock: 1, borderColor: "divider", bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 35%, transparent)" }}>
          <Box sx={{ ...section, display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0,1fr))", md: "repeat(4, minmax(0,1fr))" } }}>
            {L.stats.map((s, i) => (
              <Box key={s.t} sx={{ py: { xs: 3, md: 4.5 }, pl: { xs: i % 2 ? 2.5 : 0, md: i ? 4 : 0 }, borderLeft: { xs: i % 2 ? line : "none", md: i ? line : "none" }, borderTop: { xs: i > 1 ? line : "none", md: "none" } }}>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</Typography>
                <Typography sx={{ mt: 1, fontSize: { xs: "1.75rem", md: "2.5rem" }, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{stats[i]}</Typography>
                <Typography sx={{ mt: 1, fontSize: "0.875rem", fontWeight: 600 }}>{s.t}</Typography>
                <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", lineHeight: 1.6 }}>{s.d}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* the statement */}
        <Box component="section" aria-labelledby="pain-h" sx={{ ...section, py: { xs: 9, md: 14 } }}>
          <SectionLabel n={1}>{L.painLabel}</SectionLabel>
          <Typography id="pain-h" component="h2" sx={{ ...h2, fontSize: { xs: "1.625rem", md: "2.5rem" }, lineHeight: 1.45, maxWidth: "26em" }}>
            {L.painA}<Box component="span" sx={{ color: "text.secondary", opacity: 0.75 }}>{L.painB}</Box>{L.painC}
          </Typography>
          <Typography sx={{ ...body, mt: 3, fontSize: "1.0625rem", maxWidth: "38rem" }}>{L.painSub}</Typography>
        </Box>

        {/* capabilities: one lead card and its evidence, then the smaller tools */}
        <Box id="why" component="section" aria-labelledby="cap-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <SectionLabel n={2}>{L.capLabel}</SectionLabel>
          <Typography id="cap-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>
            {L.capTitle.split("|").map((x) => <Box key={x} component="span" sx={{ display: "block" }}>{x}</Box>)}
          </Typography>
          <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "minmax(0,1.85fr) minmax(0,1fr)" } }}>
            <Box sx={{ ...card, position: "relative", overflow: "hidden", p: { xs: 3, md: 4.5 }, "&::after": { content: '""', position: "absolute", top: -80, right: -60, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(closest-side, color-mix(in srgb, var(--mui-palette-surface-ai) 18%, transparent), transparent)", pointerEvents: "none" } }}>
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, px: 1.25, py: 0.25, borderRadius: 99, bgcolor: "surface.aiSoft", color: "surface.ai", fontSize: "0.75rem", fontWeight: 600 }}><AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />{L.capMain.chip}</Box>
              <Typography component="h3" sx={{ m: 0, mt: 2, fontSize: { xs: "1.375rem", md: "1.875rem" }, fontWeight: 700, lineHeight: 1.4, textWrap: "balance" }}>{L.capMain.t}</Typography>
              <Box sx={{ mt: 2, display: "inline-flex", p: 0.5, gap: 0.5, borderRadius: 99, bgcolor: "background.default", flexWrap: "wrap" }}>
                {L.capMain.tabs.map((x, i) => <Box key={x} component="span" sx={{ px: 1.5, py: 0.5, borderRadius: 99, fontSize: "0.8125rem", fontWeight: i ? 400 : 600, color: i ? "text.secondary" : "primary.main", bgcolor: i ? "transparent" : "background.paper", boxShadow: i ? "none" : "0 1px 3px rgb(14 26 44 / 0.1)" }}>{x}</Box>)}
              </Box>
              <Typography sx={{ ...body, mt: 2, maxWidth: "36rem" }}>{L.capMain.d}</Typography>
              <Box sx={{ mt: 3.5, display: "grid", gap: 3, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "minmax(0,1.1fr) minmax(0,1fr)" }, alignItems: "end" }}>
                <Box aria-hidden="true" sx={{ p: 2.5, borderRadius: "16px", border: 1, borderColor: "divider", bgcolor: "background.paper", boxShadow: lift }}>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: "surface.ai" }}>{L.capMain.plan}</Typography>
                  <Box sx={{ mt: 1.5, pl: 1.75, borderLeft: 1, borderColor: "surface.ai", display: "grid", gap: 1.25 }}>
                    {["retrieval-augmented generation clinical QA", "LLM fine-tuning medical question answering", "RAG versus fine-tuning benchmark"].map((q, i) => (
                      <Box key={q}>
                        <Typography sx={{ fontSize: "0.625rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</Typography>
                        <Typography sx={{ fontSize: "0.8125rem", lineHeight: 1.5 }}>{q}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: 1.5 }}>
                  {L.capMain.bullets.map((x) => (
                    <Box component="li" key={x} sx={{ display: "flex", gap: 1.25, fontSize: "0.875rem", lineHeight: 1.6, color: "text.secondary" }}>
                      <Box aria-hidden="true" sx={{ mt: "0.8em", width: 12, flexShrink: 0, borderTop: 1, borderColor: "surface.ai" }} />{x}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: "grid", gap: 2.5 }}>
              <Box sx={{ ...card, p: { xs: 3, md: 3.5 } }}>
                <Typography component="h3" sx={{ m: 0, fontSize: "1.1875rem", fontWeight: 700, lineHeight: 1.5 }}>{L.capCheck.t}</Typography>
                <Box aria-hidden="true" sx={{ my: 2, display: "grid", gap: 1 }}>
                  {[["DOI", "82%", true], ["PMID", "66%", true], ["ID", "54%", false]].map(([k, w, ok]) => (
                    <Box key={k as string} sx={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", alignItems: "center", gap: 1.25 }}>
                      <Typography sx={{ fontSize: "0.6875rem", color: "text.secondary" }}>{k}</Typography>
                      <Box sx={bar(w as string, 0.9)} />
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.6875rem", fontWeight: 600, color: ok ? "evidence.verified" : "evidence.unverified" }}>
                        {ok ? <CheckCircleRoundedIcon sx={{ fontSize: 14 }} /> : <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />}{ok ? L.capCheck.ok : L.capCheck.warn}
                      </Box>
                    </Box>
                  ))}
                </Box>
                <Typography sx={{ ...body, fontSize: "0.875rem" }}>{L.capCheck.d}</Typography>
              </Box>
              <Box sx={{ ...card, p: { xs: 3, md: 3.5 } }}>
                <Typography component="h3" sx={{ m: 0, fontSize: "1.1875rem", fontWeight: 700, lineHeight: 1.5 }}>{L.capData.t}</Typography>
                <Box aria-hidden="true" sx={{ my: 2, height: 64, px: 2, pb: 1.25, display: "flex", alignItems: "flex-end", gap: 1, borderRadius: "12px", border: 1, borderColor: "divider" }}>
                  {[38, 62, 48, 80, 70, 92, 58].map((h, i) => <Box key={i} sx={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0", bgcolor: i === 5 ? "primary.main" : "color-mix(in srgb, var(--mui-palette-primary-main) 22%, transparent)" }} />)}
                </Box>
                <Typography sx={{ ...body, fontSize: "0.875rem" }}>{L.capData.d}</Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ mt: 2.5, display: "grid", gap: 2.5, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(3, minmax(0,1fr))" } }}>
            {L.capMore.map((c, i) => {
              const Icon = moreIcons[i];
              return (
                <Box key={c.t} sx={{ ...card, p: 3, boxShadow: "none", bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 70%, transparent)" }}>
                  <Icon aria-hidden sx={{ fontSize: 22, color: "primary.main" }} />
                  <Typography component="h3" sx={{ m: 0, mt: 1.5, fontSize: "1.0625rem", fontWeight: 700, lineHeight: 1.5 }}>{c.t}</Typography>
                  <Typography sx={{ ...body, mt: 0.75, fontSize: "0.875rem" }}>{c.d}</Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* how it works: three steps on one rule */}
        <Box id="how" component="section" aria-labelledby="how-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <SectionLabel n={3}>{L.howLabel}</SectionLabel>
          <Typography id="how-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>{L.howTitle}</Typography>
          <Box component="ol" aria-label={L.howTitle} sx={{ m: 0, p: 0, listStyle: "none", display: "grid", gap: { xs: 3, md: 0 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(3, minmax(0,1fr))" }, borderTop: { md: line } }}>
            {L.steps.map((s, i) => (
              <Box component="li" key={s.t} sx={{ position: "relative", pt: { md: 3.5 }, pr: { md: 5 } }}>
                <Box aria-hidden="true" sx={{ display: { xs: "none", md: "block" }, position: "absolute", top: -6, left: 0, width: 11, height: 11, borderRadius: "50%", bgcolor: "primary.main", boxShadow: "0 0 0 4px var(--mui-palette-background-default)" }} />
                <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</Typography>
                <Typography component="h3" sx={{ m: 0, mt: 0.5, fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.4 }}>{s.t}</Typography>
                <Typography sx={{ ...body, mt: 1 }}>{s.d}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* where the data goes: a 2x2 ledger, the one external hop tinted */}
        <Box component="section" aria-labelledby="data-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <SectionLabel n={4}>{L.dataLabel}</SectionLabel>
          <Typography id="data-h" component="h2" sx={{ ...h2, mb: { xs: 4, md: 6 } }}>{L.dataTitle}</Typography>
          <Box sx={{ borderRadius: "24px", border: line, overflow: "hidden", display: "grid", gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            {L.data.map((c, i) => {
              const Icon = dataIcons[i];
              return (
                <Box key={c.t} sx={{ p: { xs: 3, md: 4 }, borderTop: { xs: i ? line : "none", md: i > 1 ? line : "none" }, borderLeft: { xs: "none", md: i % 2 ? line : "none" }, bgcolor: i === 0 ? "surface.aiSoft" : "transparent" }}>
                  <Icon aria-hidden sx={{ fontSize: 22, color: i === 0 ? "surface.ai" : "primary.main" }} />
                  <Typography component="h3" sx={{ m: 0, mt: 1.5, fontSize: "1.0625rem", fontWeight: 700, lineHeight: 1.5 }}>{c.t}</Typography>
                  <Typography sx={{ ...body, mt: 0.75, fontSize: "0.875rem", maxWidth: "34rem", color: i === 0 ? "text.primary" : "text.secondary" }}>{c.d}</Typography>
                </Box>
              );
            })}
          </Box>
          <Typography sx={{ ...body, mt: 2.5, fontSize: "0.8125rem" }}>{L.scope}</Typography>
        </Box>

        <Box id="faq" component="section" aria-labelledby="faq-h" sx={{ ...section, pb: { xs: 9, md: 14 } }}>
          <SectionLabel n={5}>{L.faqLabel}</SectionLabel>
          <Typography id="faq-h" component="h2" sx={{ ...h2, mb: { xs: 3, md: 5 } }}>{L.faqTitle}</Typography>
          <Box sx={{ display: "grid", gap: { xs: 3, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "repeat(2, minmax(0,1fr))" } }}>
            {[[L.checkTitle, L.checkBody], [L.scopeQ, L.scope]].map(([q, a]) => (
              <Box key={q} sx={{ pt: 2.5, borderTop: 1, borderColor: "divider" }}>
                <Typography component="h3" sx={{ m: 0, fontSize: "1.125rem", fontWeight: 700, lineHeight: 1.6 }}>{q}</Typography>
                <Typography sx={{ ...body, mt: 1 }}>{a}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box component="footer" sx={{ position: "relative", px: { xs: 2, sm: 4 }, pb: { xs: 4, md: 6 } }}>
        <Box sx={{ ...card, maxWidth: 1180, mx: "auto", px: { xs: 3, md: 6 }, py: { xs: 5, md: 7 }, display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, alignItems: { md: "center" }, justifyContent: "space-between", position: "relative", overflow: "hidden",
          background: "radial-gradient(60% 120% at 100% 0%, rgb(var(--mui-palette-primary-mainChannel) / 0.12), transparent 70%), var(--mui-palette-background-paper)" }}>
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
