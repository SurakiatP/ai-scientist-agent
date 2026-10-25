"use client";
import type { ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box } from "@mui/material";
import { useInspector } from "@/lib/inspector";
import { revealStagger } from "@/lib/motion";
import { useT } from "@/lib/prefs";
import { sourceHost } from "@/lib/refs";
import type { Reference } from "@/lib/sse";

// "[1]" / "[2][3]" -> link to #ref-N so a click jumps to (and :target highlights) the reference.
// Only ids that exist in the reference list; never inside inline or fenced code.
export function cite(s: string, ids: Set<string>, prefix = "ref-") {
  return s
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/(?:\[\d{1,3}\](?!\())+/g, (run) => {
      // adjacent ids "[1][2][3]" become ONE chip: "[[1,2,3]](#ref-1)"; unknown ids stay as plain text
      const all = run.match(/\d+/g) ?? [];
      const known = all.filter((n) => ids.has(n));
      if (!known.length) return run;
      const rest = all.length === known.length ? "" : all.filter((n) => !ids.has(n)).map((n) => `[${n}]`).join("");
      return `[[${known.join(",")}]](#${prefix}${known[0]})${rest}`;
    })))
    .join("");
}
const safeUrl = (u: string) => (/^#ref-\S+$/.test(u) || /^https?:\/\//i.test(u) ? defaultUrlTransform(u) : "");

// With `scope`, anchors are unique per turn (ref-<turnId>-N) and a pill opens the source inspector.
export function AnswerView({ content, references = [], scope, reveal }: { content: string; references?: { id: string; paper?: Reference["paper"] }[]; scope?: { sessionId: string; turnId: string }; reveal?: boolean }) {
  const t = useT();
  const open = useInspector((s) => s.open);
  const ids = new Set(references.map((r) => r.id));
  const byId = new Map(references.map((r) => [r.id, r]));
  const prefix = scope ? `ref-${scope.turnId}-` : "ref-";
  // "[1,2]" -> ids; label = domain of the first cited source (+n more), else the bare "[1]"
  const chip = (children: ReactNode) => {
    const text = (Array.isArray(children) ? children.join("") : String(children ?? "")).replace(/[[\]]/g, "");
    const list = text.split(",").filter(Boolean);
    const first = byId.get(list[0] ?? "");
    const host = first?.paper ? sourceHost(first.paper) : "";
    const label = first ? `${t.citeRef} ${list.join(", ")}${first.paper ? `: ${first.paper.title}` : ""}` : undefined;
    return { label, body: host ? <><span className="cite-host">{host}</span>{list.length > 1 && <span className="cite-more">+{list.length - 1}</span>}</> : `[${list.join(",")}]` };
  };
  return (
    <Box
      sx={{
        ...(reveal ? revealStagger : {}),
        overflowWrap: "anywhere",
        fontSize: { xs: "1rem", sm: "1.0625rem" },
        lineHeight: 1.75,
        color: "text.primary",
        "& > :first-of-type": { mt: 0 },
        "& > :last-child": { mb: 0 },
        "& h1, & h2, & h3, & h4": { fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.01em", mt: 2.5, mb: 1, maxWidth: "68ch" },
        "& h1": { fontSize: "1.75rem" },
        "& h2": { fontSize: "1.4375rem", pb: 0.5, borderBottom: 1, borderColor: "divider" },
        "& h3": { fontSize: "1.1875rem" },
        "& h4": { fontSize: "1.0625rem", color: "text.secondary" },
        "& p": { my: 1.25, maxWidth: "68ch" },
        "& ul, & ol": { my: 1.5, pl: 3, maxWidth: "68ch" },
        "& li": { my: 0.5 },
        "& li::marker": { color: "text.secondary" },
        "& strong": { fontWeight: 700 },
        "& a": { color: "primary.main", textDecorationColor: "color-mix(in srgb, var(--mui-palette-primary-main) 35%, transparent)", textUnderlineOffset: "3px" },
        "& a:hover": { textDecorationColor: "primary.main" },
        "& blockquote": { m: 0, my: 2, maxWidth: "68ch", px: 2, py: 1.5, bgcolor: "surface.shell", borderRadius: 1.5, color: "text.secondary" },
        "& blockquote p": { my: 0.5 },
        "& hr": { border: 0, borderTop: 1, borderColor: "divider", my: 3 },
        "& code": { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "0.875em", bgcolor: "surface.shell", px: 0.6, py: 0.15, borderRadius: 0.5 },
        "& pre": { bgcolor: "surface.shell", color: "text.primary", border: 1, borderColor: "divider", p: 2, borderRadius: 1.5, overflowX: "auto", my: 2, fontSize: "0.8125rem", lineHeight: 1.7 },
        "& pre code": { bgcolor: "transparent", color: "inherit", p: 0, fontSize: "inherit" },
        "& table": { borderCollapse: "collapse", width: "100%", minWidth: { xs: 460, sm: 0 }, fontSize: { xs: "0.875rem", sm: "0.9375rem" } },
        "& th, & td": { border: 1, borderColor: "divider", p: 1.25, textAlign: "left", verticalAlign: "top", overflowWrap: "break-word" }, // not "anywhere": that lets columns collapse to one letter wide
        "& th": { bgcolor: "surface.shell", fontWeight: 700, fontSize: "0.8125rem" },
        "& th:first-of-type, & td:first-of-type": { position: "sticky", left: 0, zIndex: 1, width: { xs: "20%", sm: "auto" }, minWidth: { xs: 88, sm: 120 }, bgcolor: "background.paper", borderRight: 1, borderColor: "divider" },
        "& th:first-of-type": { zIndex: 2, bgcolor: "surface.shell" },
        "& tbody tr:nth-of-type(even)": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 5%, transparent)" },
        // citation chip: source domain (+n for grouped ids); a pseudo-element grows the hit area to 32px without growing the chip
        "& a[href^='#ref-']": {
          position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", maxWidth: "24ch", verticalAlign: "middle",
          px: 0.9, mx: 0.25, borderRadius: 999, border: 1, borderColor: "primary.main", color: "primary.main",
          fontSize: "0.75rem", fontWeight: 600, lineHeight: 1, textDecoration: "none", minWidth: 24, height: 24, "&::after": { content: '""', position: "absolute", inset: "-4px -2px" },
          "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
          "& .cite-host": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
          "& .cite-more": { flexShrink: 0, ml: 0.5 },
        },
      }}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        skipHtml
        components={{
          // tables scroll inside their own box on narrow screens; the page itself never scrolls sideways
          table: ({ children }) => (
            <Box sx={{ my: 2.5 }}>
              <Box sx={{ display: { xs: "flex", sm: "none" }, alignItems: "center", mb: 0.75, color: "text.secondary", fontSize: "0.6875rem" }}>
                {t.tableScroll}
              </Box>
              <Box sx={{ maxWidth: "100%", overflowX: "auto", scrollbarWidth: "thin", border: 1, borderColor: "divider", borderRadius: 2, "& table": { border: 0 }, "& th, & td": { borderTop: 0, borderLeft: 0 }, "& tr > :last-child": { borderRight: 0 }, "& tbody tr:last-child td": { borderBottom: 0 } }}>
                <table>{children}</table>
              </Box>
            </Box>
          ),
          // images would let injected paper text exfiltrate data via a GET; show the alt text only
          img: ({ alt }) => <span>{alt}</span>,
          a: ({ href, children }) =>
            href?.startsWith("#") ? (
              <a href={href} aria-label={chip(children).label} onClick={scope ? (e) => {
                const h = e.currentTarget.getAttribute("href") ?? "";
                if (!h.startsWith(`#${prefix}`) || !ids.has(h.slice(1 + prefix.length))) return; // not one of this turn's refs
                e.preventDefault(); open({ ...scope, refId: h.slice(1 + prefix.length) }, e.currentTarget);
              } : undefined}>{chip(children).body}</a>
            ) : href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {cite(content, ids, prefix)}
      </Markdown>
    </Box>
  );
}
