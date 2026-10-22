"use client";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box } from "@mui/material";

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
        lineHeight: 1.75,
        "& table": { borderCollapse: "collapse", display: "block", overflowX: "auto", my: 2 },
        "& th, & td": { border: 1, borderColor: "divider", p: 1, textAlign: "left", verticalAlign: "top" },
        "& th": { bgcolor: "primary.light" },
        "& a": { color: "primary.dark" },
        "& pre": { overflowX: "auto" },
      }}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        skipHtml
        components={{
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
