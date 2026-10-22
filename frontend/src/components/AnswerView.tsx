"use client";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box } from "@mui/material";

// "[1]" / "[2][3]" -> link to #ref-N so a click jumps to (and :target highlights) the reference.
const cite = (s: string) => s.replace(/\[(\d{1,3})\](?!\()/g, "[[$1]](#ref-$1)");
const safeUrl = (u: string) => (/^#ref-\d+$/.test(u) || /^https?:\/\//i.test(u) ? defaultUrlTransform(u) : "");

export function AnswerView({ content }: { content: string }) {
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
        {cite(content)}
      </Markdown>
    </Box>
  );
}
