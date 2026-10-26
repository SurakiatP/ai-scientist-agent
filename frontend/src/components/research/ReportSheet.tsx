"use client";
import { Box, TextareaAutosize } from "@mui/material";
import { EditorContent, type Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { LIM, type ReportStyle } from "@/lib/exportReport";
import { useT } from "@/lib/prefs";
import { sarabun } from "@/lib/sheetFont";

// Mirrors STYLES in backend/src/scientist/report_render.py. 1 cm = 37.8 px, 1 pt = 1.333 px.
const cm = (n: number) => `${(n * 37.8).toFixed(1)}px`;
const pt = (n: number) => `${(n * 1.333).toFixed(2)}px`;
const SHEET = {
  standard: { pad: [2.5, 2.5, 2.5, 2.5], body: 12, head: 15, title: 22 },
  official: { pad: [3, 2, 2, 3], body: 16, head: 18, title: 20 }, // top, right, bottom, left
} as const;
const W = 21 * 37.8; // A4 width in px

const field = { display: "block", width: "100%", border: 0, outline: 0, bgcolor: "transparent", color: "inherit", font: "inherit", textAlign: "center", resize: "none", p: 0, m: 0, overflow: "hidden", "&::placeholder": { color: "#6b6b6b", opacity: 1 } } as const;

// The A4 page. Typing happens on it; margins and sizes follow the chosen style like the exported file.
export function ReportSheet({ editor, style, title, subtitle, onTitle, onSubtitle }: { editor: Editor | null; style: ReportStyle; title: string; subtitle: string; onTitle: (v: string) => void; onSubtitle: (v: string) => void }) {
  const t = useT();
  const s = SHEET[style];
  const [top, right, bottom, left] = s.pad;
  const wrap = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setZoom(Math.min(1, Math.max(0.3, (el.clientWidth - 32) / W))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const next = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); editor?.commands.focus("start"); } };
  return (
    <Box ref={wrap} sx={{ flex: 1, minWidth: 0, overflow: "auto", bgcolor: "action.selected", py: 3, px: 2 }}>
      <Box
        component="article"
        sx={{
          zoom, width: W, minHeight: 297 * 3.78, mx: "auto", boxSizing: "border-box", bgcolor: "#fff", color: "#1b1b1b",
          boxShadow: "0 1px 3px rgba(16,24,40,0.14), 0 10px 28px rgba(16,24,40,0.1)",
          p: `${cm(top)} ${cm(right)} ${cm(bottom)} ${cm(left)}`,
          fontFamily: sarabun.style.fontFamily, fontSize: pt(s.body), lineHeight: 1.55, colorScheme: "light",
          "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 3 },
          "& ::selection": { bgcolor: "#cfe3ff", color: "#111" },
          "& textarea, & .ProseMirror": { caretColor: "#1b1b1b" },
          "& .ProseMirror": {
            outline: 0, minHeight: 360, overflowWrap: "anywhere",
            "& p": { m: `0 0 ${pt(s.body * 0.6)}` },
            "& h2": { fontSize: pt(s.head), fontWeight: 700, lineHeight: 1.35, m: `${pt(s.head * 0.9)} 0 ${pt(s.head * 0.35)}`, textWrap: "balance" },
            "& ul, & ol": { m: `0 0 ${pt(s.body * 0.6)}`, pl: "1.6em" },
            "& li > p": { m: 0 },
            "& code": { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "0.9em" },
            "& table": { borderCollapse: "collapse", width: "100%", tableLayout: "fixed", m: `0 0 ${pt(s.body * 0.8)}` },
            "& th, & td": { border: "1px solid #3a3a3a", p: "4px 8px", verticalAlign: "top", textAlign: "left", position: "relative", minWidth: 40 },
            "& th": { fontWeight: 700, bgcolor: "#eef0f3" },
            "& th > p, & td > p": { m: 0 },
            "& .selectedCell::after": { content: '""', position: "absolute", inset: 0, bgcolor: "rgba(60,120,255,0.18)", pointerEvents: "none" },
          },
        }}
      >
        <Box component={TextareaAutosize} value={title} onChange={(e) => onTitle(e.target.value)} onKeyDown={next} maxLength={LIM.title} placeholder={t.fDocTitle} aria-label={t.fDocTitle} aria-required aria-invalid={!title.trim()} aria-describedby="rf-need-title" sx={{ ...field, fontSize: pt(s.title), fontWeight: 700, lineHeight: 1.3, mb: 0.5 }} />
        {!title.trim() && <Box id="rf-need-title" sx={{ textAlign: "center", fontSize: "0.8125rem", color: "#c62828", mb: 1 }}>{t.fNeedTitle}</Box>}
        <Box component={TextareaAutosize} value={subtitle} onChange={(e) => onSubtitle(e.target.value)} onKeyDown={next} maxLength={LIM.subtitle} placeholder={t.fSubtitle} aria-label={t.fSubtitle} sx={{ ...field, color: "#555", mb: 2 }} />
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}
