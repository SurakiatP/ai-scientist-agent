
import type { Session, Turn } from "./chat";
import { checkLabel, doiOf, paperLink } from "./refs";
import { strings, type Lang } from "./strings";

// Keep the export as safe as AnswerView: outside code spans/fences, no raw HTML, no images,
// and no link target other than http(s) or a #fragment. Code is left untouched.
const SAFE = /^(https?:\/\/|#)/i;
const prose = (s: string) => s
  .replace(/!\[/g, "\\![")
  .replace(/\]\(\s*<?([^)\s>]*)>?/g, (m, u) => (SAFE.test(u) ? m : "](#"))
  .replace(/^([>\s\-*+\d.]*\[[^\]]+\]:\s*)<?(\S+)>?/gm, (m, k, u) => (SAFE.test(u) ? m : `${k}#`))
  .replace(/<(?=[a-z!/?])/gi, "&lt;");
export const esc = (s: string) =>
  s.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|(?<!\\)`[^`\n]*(?<!\\)`)/).map((part, i) => (i % 2 ? part : prose(part))).join("");

export function buildReportMarkdown(session: Session, turn: Turn, lang: Lang): string {
  const t = strings[lang];
  const refs = turn.answer?.references ?? [];
  const out = [`# ${esc(session.title || turn.question.slice(0, 60))}`, "", `## ${t.asked}`, "", esc(turn.question), "", `## ${t.answer}`, "", esc(turn.answer?.content ?? "")];
  if (refs.length) {
    out.push("", `## ${t.references}`, "");
    for (const r of refs) {
      const p = r.paper, doi = doiOf(p), link = paperLink(p);
      const meta = [p.authors.join(", "), p.year].filter(Boolean).join(" · ");
      out.push(`- [${r.id}] ${esc(p.title)}`);
      if (meta) out.push(`  - ${esc(meta)}`);
      if (doi) out.push(`  - ${t.doi}: ${esc(doi)}`);
      if (p.pmid?.trim()) out.push(`  - ${t.pmid}: ${esc(p.pmid.trim())}`);
      if (link) out.push(`  - ${link}`);
      out.push(`  - ${t.idCheck}: ${checkLabel(r, t)}`);
    }
  }
  return out.join("\n") + "\n";
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Section outline of an answer: markdown headings (outside code fences) and their paragraph counts.
export function reportSections(content: string, fallbackTitle: string): { title: string; paragraphs: number }[] {
  const out: { title: string; paragraphs: number }[] = [];
  let cur: { title: string; paragraphs: number } | null = null, fence = false, inPara = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; }
    const h = !fence && /^#{1,3}\s+(.+?)\s*#*$/.exec(line);
    if (h) { cur = { title: h[1], paragraphs: 0 }; out.push(cur); inPara = false; continue; }
    if (!line.trim()) { inPara = false; continue; }
    if (!inPara) { if (!cur) { cur = { title: fallbackTitle, paragraphs: 0 }; out.push(cur); } cur.paragraphs++; inPara = true; }
  }
  return out;
}
