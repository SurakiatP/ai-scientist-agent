"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import th from "@/content/manual/th.json";
import en from "@/content/manual/en.json";
import { dur, ease } from "@/lib/motion";
import { ring } from "./LandingHeader";
import { Shell, h1, h2, lead, useCopy } from "./SitePage";

type Topic = { id: string; file: string; group: string; title: string; summary: string; sections: { heading: string; body: string }[] };
type Manual = { book: { title: string; description: string }; groups: { id: string; title: string }[]; topics: Topic[] };
const manual: Record<"th" | "en", Manual> = { th, en };

// The three topics a first-time reader needs, in reading order (the manual itself says to start here).
const START = ["getting-started", "ask-a-question", "read-sources"];
const NOTE = /ข้อควรทราบ|good to know/i, RELATED = /คำถามที่เกี่ยวข้อง|related questions/i;
const tint = (a: number) => `rgb(var(--mui-palette-primary-mainChannel) / ${a})`;
const clamp = (n: number) => ({ display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical", overflow: "hidden" }) as const;
const num = (n: number): CSSProperties => ({ "--i": n }) as CSSProperties;

const card = {
  display: "grid", alignContent: "start", gap: 1, minHeight: 44, p: 2.5, borderRadius: "16px", bgcolor: "background.paper", color: "text.primary", textDecoration: "none",
  transition: `background-color ${dur.quick}ms ${ease}`, "&:hover": { bgcolor: tint(0.08) }, ...ring,
} as const;

type Fig = { src: string; alt: string; w: number; h: number; video: boolean; cc: boolean };
function parseFig(src = "", alt = ""): Fig {
  const [path, hash = ""] = src.split("#");
  const m = hash.match(/^(\d+)x(\d+)$/);
  return { src: path, alt, w: m ? +m[1] : 1280, h: m ? +m[2] : 800, video: path.endsWith(".mp4"), cc: hash === "cc" };
}

function Media({ f, lang }: { f: Fig; lang: string }) {
  const frame = { display: "block", width: "100%", height: "auto", maxWidth: "100%", bgcolor: "background.default" } as const;
  return f.video ? (
    <Box component="video" controls muted playsInline preload="none" poster={f.src.replace(/\.mp4$/, ".poster.webp")} aria-label={f.alt} src={f.src} sx={{ ...frame, aspectRatio: "1280 / 800" }}>
      {f.cc && <track kind="captions" src={f.src.replace(/\.mp4$/, ".vtt")} srcLang={lang} label={lang === "th" ? "ไทย" : "English"} default />}
    </Box>
  ) : (
    <Box component="img" src={f.src} alt={f.alt} width={f.w} height={f.h} loading="lazy" decoding="async" sx={{ ...frame, aspectRatio: `${f.w} / ${f.h}` }} />
  );
}

// Markdown of one section: steps become numbered rows, pictures become framed figures, links stay inside the app.
function Body({ md, lang, related }: { md: string; lang: string; related?: boolean }) {
  return (
    <Box sx={{
      display: "grid", gap: 2, fontSize: "1rem", lineHeight: 1.85, minWidth: 0, "& > *": { m: 0 }, overflowWrap: "anywhere",
      "& ul": { m: 0, pl: 3, display: "grid", gap: 1, "& li::marker": { color: "text.secondary" } },
      "& ol": { m: 0, p: 0, listStyle: "none", display: "grid", gap: 3, counterReset: "step" },
      "& ol > li": { display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", columnGap: 1.5, rowGap: 1.5, counterIncrement: "step", "&::before": { content: "counter(step)", fontWeight: 700, color: "primary.main", fontVariantNumeric: "tabular-nums", lineHeight: 1.85 }, "& > p": { m: 0, gridColumn: 2 }, "& > figure": { gridColumn: "1 / -1" } },
      "& p": { m: 0, textWrap: "pretty" }, "& strong": { fontWeight: 600 },
      "& a": { color: "primary.main", textUnderlineOffset: 3, ...ring },
      ...(related && { "& ul": { listStyle: "none", p: 0, m: 0, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))" } }, "& li > a": { ...card, p: 2, color: "text.primary", fontWeight: 500, textDecoration: "none", display: "flex", alignItems: "center" } }),
    }}>
      <Markdown remarkPlugins={[remarkGfm]} components={{
        p: ({ node, children }) => {
          const c = node?.children[0];
          if (node?.children.length === 1 && c?.type === "element" && c.tagName === "img") {
            const props = c.properties as { src?: string; alt?: string; title?: string };
            const caption = props.title;
            return (
              <Box component="figure" sx={{ m: 0, display: "grid", gap: 1, minWidth: 0 }}>
                <Box sx={{ overflow: "hidden", borderRadius: "16px", bgcolor: "background.paper", p: 1, "& img, & video": { borderRadius: "10px" } }}>{children}</Box>
                {caption && <Typography component="figcaption" sx={{ fontSize: "0.875rem", lineHeight: 1.6, color: "text.secondary" }}>{caption}</Typography>}
              </Box>
            );
          }
          return <p>{children}</p>;
        },
        img: ({ src, alt }) => <Media f={parseFig(typeof src === "string" ? src : "", alt ?? "")} lang={lang} />,
        a: ({ href = "", children }) => (href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} rel="noreferrer">{children}</a>),
      }}>{md}</Markdown>
    </Box>
  );
}

// Left tree (desktop): topics by group, the current group open, the current topic expanded to its sections.
function Tree({ m, topic, active, label, sectionsLabel }: { m: Manual; topic: Topic; active: number; label: string; sectionsLabel: string }) {
  return (
    <Box component="nav" aria-label={label} sx={{ display: { xs: "none", md: "block" }, position: "sticky", top: 88, alignSelf: "start", maxHeight: "calc(100dvh - 104px)", overflowY: "auto", pr: 1 }}>
      {m.groups.map((g) => {
        const here = g.id === topic.group;
        return (
          <Box component="details" key={g.id} open={here} sx={{ mb: 0.5, "& > summary": { listStyle: "none", "&::-webkit-details-marker": { display: "none" } } }}>
            <Box component="summary" sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 44, px: 1, borderRadius: 2, cursor: "pointer", color: here ? "text.primary" : "text.secondary", fontSize: "0.875rem", fontWeight: 600, "&:hover": { bgcolor: "action.hover" }, ...ring }}>
              {g.title}<ExpandMoreRoundedIcon aria-hidden="true" sx={{ fontSize: 18, ml: "auto", transition: `transform ${dur.fast}ms ${ease}`, "details[open] > summary &": { transform: "rotate(180deg)" } }} />
            </Box>
            <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
              {m.topics.map((t, k) => t.group === g.id && (
                <li key={t.id}>
                  <Box component={Link} href={`/docs/${t.id}`} aria-current={t.id === topic.id ? "page" : undefined} sx={{ display: "flex", alignItems: "center", boxSizing: "border-box", gap: 1, minHeight: 44, py: 0.5, px: 1.25, borderRadius: 2, textDecoration: "none", fontSize: "1rem", lineHeight: 1.5, color: t.id === topic.id ? "primary.main" : "text.primary", fontWeight: t.id === topic.id ? 600 : 400, bgcolor: t.id === topic.id ? tint(0.1) : "transparent", transition: `background-color ${dur.quick}ms ${ease}`, "&:hover": { bgcolor: t.id === topic.id ? tint(0.1) : "action.hover" }, ...ring }}>
                    <Box component="span" sx={{ width: 20, flexShrink: 0, fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{k + 1}</Box><span>{t.title}</span>
                  </Box>
                  {t.id === topic.id && (
                    <Box component="ul" aria-label={sectionsLabel} sx={{ m: 0, mb: 0.5, ml: 3.5, pl: 0, listStyle: "none" }}>
                      {t.sections.map((s, i) => (
                        <li key={s.heading}>
                          <Box component="a" href={`#section-${i + 1}`} aria-current={i === active ? "location" : undefined} sx={{ display: "block", minHeight: 36, py: 0.75, px: 1.5, fontSize: "0.875rem", lineHeight: 1.5, textDecoration: "none", color: i === active ? "primary.main" : "text.secondary", fontWeight: i === active ? 600 : 400, "&:hover": { color: "text.primary" }, ...ring }}>{s.heading}</Box>
                        </li>
                      ))}
                    </Box>
                  )}
                </li>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

// Phone: all topics as one horizontal strip, then the sections as chips.
function Strip({ m, topic, label, sectionsLabel }: { m: Manual; topic: Topic; label: string; sectionsLabel: string }) {
  const cur = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = cur.current, box = el?.closest("nav");
    if (el && box) box.scrollLeft += el.getBoundingClientRect().left - box.getBoundingClientRect().left - 16; // scroll the strip only, never the page
  }, [topic.id]);
  return (
    <Box sx={{ display: { xs: "grid", md: "none" }, gap: 1.5, minWidth: 0 }}>
      <Box component="nav" aria-label={label} sx={{ overflowX: "auto", mx: -2, px: 2, pb: 0.5 }}>
        <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none", display: "flex", gap: 1, width: "max-content" }}>
          {m.topics.map((t, k) => (
            <li key={t.id}>
              <Box component={Link} ref={t.id === topic.id ? cur : undefined} href={`/docs/${t.id}`} aria-current={t.id === topic.id ? "page" : undefined} sx={{ display: "flex", alignItems: "center", gap: 0.75, minHeight: 44, px: 1.75, borderRadius: 999, bgcolor: t.id === topic.id ? tint(0.14) : "background.paper", color: t.id === topic.id ? "primary.main" : "text.primary", fontWeight: t.id === topic.id ? 600 : 400, fontSize: "0.875rem", whiteSpace: "nowrap", textDecoration: "none", ...ring }}>
                <Box component="span" sx={{ fontSize: "0.75rem", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{k + 1}</Box>{t.title}
              </Box>
            </li>
          ))}
        </Box>
      </Box>
      <Box sx={{ overflowX: "auto", mx: -2, px: 2, pb: 0.5 }}>
      <Box component="ul" aria-label={sectionsLabel} sx={{ m: 0, p: 0, listStyle: "none", display: "flex", gap: 1, width: "max-content" }}>
        {topic.sections.map((s, i) => (
          <li key={s.heading}>
            <Box component="a" href={`#section-${i + 1}`} sx={{ display: "flex", alignItems: "center", minHeight: 44, px: 1.75, borderRadius: 999, bgcolor: "background.paper", color: "text.secondary", fontSize: "0.875rem", whiteSpace: "nowrap", textDecoration: "none", "&:hover": { color: "text.primary", bgcolor: tint(0.08) }, ...ring }}>{s.heading}</Box>
          </li>
        ))}
      </Box>
      </Box>
    </Box>
  );
}

function TopicCard({ t, read, i, h }: { t: Topic; read: string; i: number; h: "h3" | "h4" }) {
  return (
    <Box component={Link} href={`/docs/${t.id}`} className="rise" style={num(i)} sx={card}>
      <Typography component={h} sx={{ m: 0, fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.5 }}>{t.title}</Typography>
      <Typography component="p" sx={{ m: 0, ...clamp(3), fontSize: "1rem", lineHeight: 1.75, color: "text.secondary" }}>{t.summary}</Typography>
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mt: 0.5, fontSize: "0.875rem", fontWeight: 600, color: "primary.main" }}>{read}<ArrowForwardRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} /></Box>
    </Box>
  );
}

export function DocsIndexView() {
  const { lang, L, P } = useCopy();
  const m = manual[lang], d = P.docs;
  const at = (id: string) => m.topics.findIndex((t) => t.id === id);
  const grid = { m: 0, p: 0, listStyle: "none", display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))", lg: "repeat(3, minmax(0,1fr))" } } as const;
  return (
    <Shell active="docs" trail={L.navDocs}>
      <Box className="rise" sx={{ display: "grid", gap: 2 }}>
        <Typography component="h1" sx={h1}>{m.book.title}</Typography>
        <Typography sx={lead}>{m.book.description}</Typography>
      </Box>
      <Box component="section" aria-labelledby="docs-start" sx={{ display: "grid", gap: 2 }}>
        <Typography id="docs-start" component="h2" sx={h2}>{d.start}</Typography>
        <Box component="ol" sx={grid}>
          {START.filter((id) => at(id) >= 0).map((id, k) => <li key={id} style={{ display: "grid" }}><TopicCard t={m.topics[at(id)]} read={d.read} i={k} h="h3" /></li>)}
        </Box>
      </Box>
      <Box component="section" aria-labelledby="docs-all" sx={{ display: "grid", gap: 4 }}>
        <Typography id="docs-all" component="h2" sx={h2}>{d.topics}</Typography>
        {m.groups.map((g) => {
          return (
            <Box component="section" key={g.id} aria-labelledby={`g-${g.id}`} sx={{ display: "grid", gap: 2 }}>
              <Typography id={`g-${g.id}`} component="h3" sx={{ m: 0, fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.5 }}>{g.title}</Typography>
              <Box component="ul" sx={grid}>
                {m.topics.map((t, k) => t.group === g.id && <li key={t.id} style={{ display: "grid" }}><TopicCard t={t} read={d.read} i={k % 6} h="h4" /></li>)}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Shell>
  );
}

export function DocsTopicView({ slug }: { slug: string }) {
  const { lang, L, P } = useCopy();
  const m = manual[lang], d = P.docs;
  const index = m.topics.findIndex((t) => t.id === slug), topic = m.topics[index];
  const [cur, setCur] = useState({ slug, i: 0 }), active = cur.slug === slug ? cur.i : 0;
  useEffect(() => {
    if (!topic || typeof IntersectionObserver === "undefined") return;
    const seen = new Set<number>();
    const io = new IntersectionObserver((es) => {
      for (const e of es) { const n = +e.target.id.replace("section-", "") - 1; if (e.isIntersecting) seen.add(n); else seen.delete(n); }
      if (seen.size) setCur({ slug, i: Math.min(...seen) });
    }, { rootMargin: "-96px 0px -60% 0px" });
    document.querySelectorAll("[id^='section-']").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [topic, lang, slug]);

  if (!topic) return null; // unreachable: dynamicParams = false makes unknown slugs a 404
  const prev = m.topics[index - 1], next = m.topics[index + 1];
  return (
    <Shell active="docs" trail={topic.title}>
      <Box sx={{ display: "grid", gap: { xs: 3, md: 6 }, gridTemplateColumns: { xs: "minmax(0,1fr)", md: "280px minmax(0,1fr)" }, alignItems: "start" }}>
        <Tree m={m} topic={topic} active={active} label={d.navLabel} sectionsLabel={d.onThisPage} />
        <Strip m={m} topic={topic} label={d.navLabel} sectionsLabel={d.onThisPage} />
        <Box component="article" key={`${lang}-${topic.id}`} sx={{ display: "grid", gap: { xs: 4, md: 5 }, minWidth: 0, maxWidth: 820 }}>
          <Box className="rise" sx={{ display: "grid", gap: 1.5 }}>
            <Typography component="h1" sx={h1}>{topic.title}</Typography>
          </Box>
          {topic.sections.map((s, i) => {
            const note = NOTE.test(s.heading), related = RELATED.test(s.heading);
            return (
              <Box component="section" key={s.heading} id={`section-${i + 1}`} aria-labelledby={`section-h-${i + 1}`} className="rise" style={num(Math.min(i + 1, 6))}
                sx={{ display: "grid", gap: 2, scrollMarginTop: 96, ...(note && { p: { xs: 2.5, md: 3.5 }, borderRadius: "16px", bgcolor: tint(0.08) }) }}>
                <Typography id={`section-h-${i + 1}`} component="h2" sx={{ ...h2, fontSize: { xs: "1.25rem", md: "1.5rem" } }}>
                  {s.heading}
                </Typography>
                <Body md={s.body} lang={lang} related={related} />
              </Box>
            );
          })}
          <Box component="nav" aria-label={d.pager} sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0,1fr)", sm: "repeat(2, minmax(0,1fr))" }, pt: 3 }}>
            {prev ? <PagerCard t={prev} dir="prev" label={L.prev} /> : <span />}
            {next && <PagerCard t={next} dir="next" label={L.next} />}
          </Box>
        </Box>
      </Box>
    </Shell>
  );
}

function PagerCard({ t, dir, label }: { t: Topic; dir: "prev" | "next"; label: string }) {
  const next = dir === "next", Icon = next ? ArrowForwardRoundedIcon : ArrowBackRoundedIcon;
  return (
    <Box component={Link} href={`/docs/${t.id}`} rel={dir} sx={{ ...card, display: "flex", alignItems: "center", gap: 1.5, justifyContent: next ? "flex-end" : "flex-start", textAlign: next ? "end" : "start", gridColumn: next ? { sm: 2 } : undefined }}>
      {!next && <Icon aria-hidden="true" sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }} />}
      <Box sx={{ display: "grid", gap: 0.25, minWidth: 0 }}>
        <Typography component="span" sx={{ fontSize: "0.875rem", color: "text.secondary" }}>{label}</Typography>
        <Typography component="span" sx={{ fontSize: "1rem", fontWeight: 600, lineHeight: 1.5 }}>{t.title}</Typography>
      </Box>
      {next && <Icon aria-hidden="true" sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }} />}
    </Box>
  );
}
