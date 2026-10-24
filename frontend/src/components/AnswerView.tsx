"use client";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { strings } from "@/lib/strings";
import { palette } from "@/theme";

// "[1]" / "[2][3]" -> link to #ref-N so a click jumps to (and :target highlights) the reference.
// Only ids that exist in the reference list; never inside inline or fenced code.
export function cite(s: string, ids: Set<string>) {
  return s
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/\[(\d{1,3})\](?!\()/g, (m, n) => (ids.has(n) ? `[[${n}]](#ref-${n})` : m))))
    .join("");
}
const safeUrl = (u: string) => (/^#ref-\d+$/.test(u) || /^https?:\/\//i.test(u) ? defaultUrlTransform(u) : "");

export function AnswerView({ content, references = [] }: { content: string; references?: { id: string }[] }) {
  return (
    <Box
      sx={{
        overflowWrap: "anywhere",
        fontSize: "1rem",
        lineHeight: 1.8,
        color: "text.primary",
        "& > :first-of-type": { mt: 0 },
        "& > :last-child": { mb: 0 },
        "& h1, & h2, & h3, & h4": { fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.01em", mt: 2.5, mb: 1, maxWidth: "68ch" },
        "& h1": { fontSize: "1.5rem" },
        "& h2": { fontSize: "1.25rem" },
        "& h3": { fontSize: "1.0625rem" },
        "& h4": { fontSize: "1rem" },
        "& p": { my: 1.25, maxWidth: "68ch" },
        "& ul, & ol": { my: 1.5, pl: 3, maxWidth: "68ch" },
        "& li": { my: 0.5 },
        "& li::marker": { color: "text.secondary" },
        "& strong": { fontWeight: 700 },
        "& a": { color: palette.teal, textDecorationColor: alpha(palette.teal, 0.35), textUnderlineOffset: "3px" },
        "& a:hover": { textDecorationColor: palette.teal },
        "& blockquote": { m: 0, my: 2, maxWidth: "68ch", px: 2, py: 1.5, bgcolor: palette.background, borderRadius: 1.5, color: "text.secondary" },
        "& blockquote p": { my: 0.5 },
        "& hr": { border: 0, borderTop: 1, borderColor: "divider", my: 3 },
        "& code": { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "0.875em", bgcolor: palette.sidebar, px: 0.6, py: 0.15, borderRadius: 0.5 },
        "& pre": { bgcolor: palette.textPrimary, color: palette.background, p: 2, borderRadius: 1.5, overflowX: "auto", my: 2, fontSize: "0.8125rem", lineHeight: 1.7 },
        "& pre code": { bgcolor: "transparent", color: "inherit", p: 0, fontSize: "inherit" },
        "& table": { borderCollapse: "collapse", width: "100%", minWidth: { xs: 460, sm: 0 }, fontSize: { xs: "0.875rem", sm: "0.9375rem" } },
        "& th, & td": { border: 1, borderColor: "divider", p: 1.25, textAlign: "left", verticalAlign: "top" },
        "& th": { bgcolor: palette.background, fontWeight: 700, fontSize: "0.8125rem" },
        "& th:first-of-type, & td:first-of-type": { position: "sticky", left: 0, zIndex: 1, width: { xs: "20%", sm: "auto" }, minWidth: { xs: 88, sm: 0 }, bgcolor: palette.surface, borderRight: 1, borderColor: "divider" },
        "& th:first-of-type": { zIndex: 2, bgcolor: palette.background },
        "& tbody tr:nth-of-type(even)": { bgcolor: palette.rowStripe },
        "& a[href^='#ref-']": {
          display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 19, height: 19,
          px: 0.5, mx: 0.15, borderRadius: 0.75, bgcolor: palette.tealLight, color: palette.teal,
          fontSize: "0.6875rem", fontWeight: 700, lineHeight: 1, textDecoration: "none", verticalAlign: "text-top",
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
                {strings.th.tableScroll}
              </Box>
              <Box sx={{ maxWidth: "100%", overflowX: "auto", scrollbarWidth: "thin" }}>
                <table>{children}</table>
              </Box>
            </Box>
          ),
          // images would let injected paper text exfiltrate data via a GET; show the alt text only
          img: ({ alt }) => <span>{alt}</span>,
          a: ({ href, children }) =>
            href?.startsWith("#") ? (
              <a href={href}>{children}</a>
            ) : href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
            ) : (
              <>{children}</>
            ),
        }}
      >
        {cite(content, new Set(references.map((r) => r.id)))}
      </Markdown>
    </Box>
  );
}
