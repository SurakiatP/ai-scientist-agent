"use client";
import { Box, TextareaAutosize } from "@mui/material";
import { EditorContent, type Editor } from "@tiptap/react";
import { FONTS, LIM, REF_TEXT, refLines, type FontId, type RefOut, type ReportStyle } from "@/lib/exportReport";
import { useT } from "@/lib/prefs";
import type { Lang } from "@/lib/strings";
import { ease } from "@/lib/motion";

// Mirrors STYLES in backend/src/scientist/report_render.py. 1 cm = 37.8 px, 1 pt = 1.333 px.
const cm = (n: number) => `${(n * 37.8).toFixed(1)}px`;
const pt = (n: number) => `${(n * 1.333).toFixed(2)}px`;
const SHEET = {
  standard: { pad: [2.5, 2.5, 2.5, 2.5], body: 12, head: 15, title: 22 },
  official: { pad: [3, 2, 2, 3], body: 16, head: 18, title: 20 }, // top, right, bottom, left
} as const;
const W = 21 * 37.8; // A4 width in px

const field = { display: "block", width: "100%", border: 0, outline: 0, bgcolor: "transparent", color: "inherit", font: "inherit", textAlign: "center", resize: "none", p: 0, m: 0, overflow: "hidden", "&::placeholder": { color: "#6b6b6b", opacity: 1 }, "&:focus-visible": { outline: "2px solid #1565c0", outlineOffset: 2, borderRadius: "2px" } } as const;

// The A4 page. Typing happens on it; margins and sizes follow the chosen style like the exported file.
export function ReportSheet({ editor, wide, style, font, lang, refs, title, subtitle, onTitle, onSubtitle }: { editor: Editor | null; wide: boolean; style: ReportStyle; font: FontId; lang: Lang; refs: RefOut[] | null; title: string; subtitle: string; onTitle: (v: string) => void; onSubtitle: (v: string) => void }) {
  const t = useT();
  const a4 = SHEET[style];
  // Below md the page reflows at a readable size (16px body, same proportions) instead of shrinking the A4 sheet.
  const k = wide ? 1 : 16 / (a4.body * 1.333);
  const s = { body: a4.body * k, head: a4.head * k, title: a4.title * k };
  const [top, right, bottom, left] = a4.pad;
  const next = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); editor?.commands.focus("start"); } };
  return (
    <Box sx={{ flex: 1, minWidth: 0, overflow: "auto", bgcolor: "action.selected", py: { xs: 0, md: 3 }, px: { xs: 0, md: 2 } }}>
      <Box
        component="article"
        data-numbered={style === "official" || undefined}
        sx={{
          width: wide ? W : "100%", minHeight: wide ? 297 * 3.78 : "100%", mx: "auto", boxSizing: "border-box", bgcolor: "#fff", color: "#1b1b1b",
          boxShadow: "0 1px 3px rgba(16,24,40,0.14), 0 10px 28px rgba(16,24,40,0.1)",
          p: wide ? `${cm(top)} ${cm(right)} ${cm(bottom)} ${cm(left)}` : "24px 20px",
          fontFamily: FONTS.find((f) => f.id === font)?.cssFamily, fontSize: pt(s.body), lineHeight: 1.55, colorScheme: "light",
          "& ::selection": { bgcolor: "#cfe3ff", color: "#111" },
          "& textarea, & .ProseMirror": { caretColor: "#1b1b1b" },
          "& .ProseMirror": {
            outline: 0, minHeight: 360, overflowWrap: "anywhere",
            "& p": { m: `0 0 ${pt(s.body * 0.6)}` },
            ...(style === "official" && { counterReset: "sec", "& h2::before": { counterIncrement: "sec", content: 'counter(sec) ". "' } }), // numbers are shown, never stored in the document
            "& h2": { fontSize: pt(s.head), fontWeight: 700, lineHeight: 1.35, m: `${pt(s.head * 0.9)} 0 ${pt(s.head * 0.35)}`, textWrap: "balance" },
            "& ul, & ol": { m: `0 0 ${pt(s.body * 0.6)}`, pl: "1.6em" },
            "& li > p": { m: 0 },
            "& code": { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: "0.9em", bgcolor: "#f1f2f4", borderRadius: "3px", px: "0.25em" },
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
        {/* Generated list, read-only: grid-rows transition fades it in and out; reduced motion is handled by the theme zeroing durations. */}
        <Box data-testid="sheet-refs" sx={{ display: "grid", gridTemplateRows: refs?.length ? "1fr" : "0fr", opacity: refs?.length ? 1 : 0, transition: `grid-template-rows 180ms ${ease}, opacity 180ms ${ease}`, "@media (prefers-reduced-motion: reduce)": { transition: "none" } }}>
          <Box sx={{ overflow: "hidden", minHeight: 0 }}>
            {!!refs?.length && (
              <Box component="section" aria-label={t.fRefsAria} sx={{ borderTop: "1px solid #d5d7db", mt: 2, pt: 1, userSelect: "text" }}>
                <Box sx={{ fontSize: "0.75rem", color: "#6b6b6b" }}>{t.fRefsAuto}</Box>
                <Box component="h2" sx={{ fontSize: pt(s.head), fontWeight: 700, lineHeight: 1.35, m: `${pt(s.head * 0.5)} 0 ${pt(s.head * 0.35)}` }}>{REF_TEXT[lang].refs}</Box>
                {refLines(refs, lang).map((l, i) => <Box component="p" key={i} sx={{ m: `0 0 ${pt(s.body * 0.3)}`, fontSize: pt(s.body - 1 * k), overflowWrap: "anywhere" }}>{l}</Box>)}
                <Box component="p" sx={{ m: `${pt(s.body * 0.4)} 0 0`, fontSize: pt(s.body - 1 * k) }}>{REF_TEXT[lang].note}</Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
