import { checkLabel, doiOf, paperLink } from "@/components/ReferenceList";
import type { Session, Turn } from "./chat";
import { strings, type Lang } from "./strings";

// Neutralise anything that would start an HTML tag; markdown viewers then show it as text (entity).
const esc = (s: string) => s.replace(/<(?=[a-z!/?])/gi, "&lt;");

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
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
