import type { Reference } from "./sse";

const TEX: Record<string, string> = { "\\": "\\textbackslash{}", "^": "\\^{}", "~": "\\~{}" };
const esc = (s: string) => s.replace(/[{}%&_#$\\^~]/g, (c) => TEX[c] ?? `\\${c}`);

// Family name = text before a comma, else the last word; ASCII letters only (accents folded, Thai etc. dropped).
const family = (a: string) => {
  const name = a.includes(",") ? a.split(",")[0] : a.trim().split(/\s+/).pop() ?? "";
  return name.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase();
};

/** BibTeX for the answer's references. Keys are family name + year, with a/b/c on duplicates. */
export function toBibtex(refs: Reference[]): string {
  const seen = new Map<string, number>();
  return refs.map(({ paper: p }) => {
    const base = (family(p.authors[0] ?? "") || "ref") + (p.year ?? "nd");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const key = base + (n ? String.fromCharCode(96 + n) : ""); // ponytail: past 26 duplicates the suffix leaves a-z
    const fields: [string, string][] = [
      ["title", p.title], ["author", p.authors.map(esc).join(" and ")], ["year", p.year == null ? "" : String(p.year)],
      ["doi", p.doi ?? ""], ["note", p.pmid ? `PMID: ${p.pmid}` : ""], ["url", p.url],
    ];
    const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${k === "author" || k === "note" ? v : esc(v)}}`);
    return `@${p.doi || p.year != null ? "article" : "misc"}{${key},\n${body.join(",\n")}\n}\n`;
  }).join("\n");
}

/** RIS for the answer's references (CRLF line endings, one ER per record). */
export function toRis(refs: Reference[]): string {
  return refs.map(({ paper: p }) => [
    "TY  - JOUR", p.title && `TI  - ${p.title}`, ...p.authors.map((a) => `AU  - ${a}`),
    p.year != null && `PY  - ${p.year}`, p.doi && `DO  - ${p.doi}`, p.url && `UR  - ${p.url}`, p.pmid && `N1  - PMID: ${p.pmid}`, "ER  - ",
  ].filter(Boolean).map((l) => `${l}\r\n`).join("")).join("");
}
