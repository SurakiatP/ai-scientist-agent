import type { Reference } from "./sse";

const TEX: Record<string, string> = { "\\": "\\textbackslash{}", "^": "\\^{}", "~": "\\~{}", "{": "\\textbraceleft{}", "}": "\\textbraceright{}" };
const one = (s: string) => s.replace(/\s+/g, " ").trim(); // untrusted metadata: no newline may start a new line or entry
const esc = (s: string) => one(s).replace(/[{}%&_#$\\^~]/g, (c) => TEX[c] ?? `\\${c}`);
const raw = (s: string) => one(s).replace(/[{}\\ ]/g, (c) => ({ "{": "%7B", "}": "%7D", "\\": "%5C", " ": "%20" })[c] ?? c); // doi/url stay unescaped for LaTeX
const author = (a: string) => (/\sand\s/i.test(one(a)) ? `{${esc(a)}}` : esc(a)); // a name containing " and " would split into two authors

// Family name = text before a comma, else the last word; ASCII letters only (accents folded, Thai etc. dropped).
const family = (a: string) => {
  const name = a.includes(",") ? a.split(",")[0] : a.trim().split(/\s+/).pop() ?? "";
  return name.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase();
};

/** BibTeX for the answer's references. Keys are family name + year, with a/b/c on duplicates. */
export function toBibtex(refs: Reference[]): string {
  const count = new Map<string, number>();
  const used = new Set<string>();
  return refs.map(({ paper: p }) => {
    const base = (family(p.authors[0] ?? "") || "ref") + (p.year ?? "nd");
    let i = count.get(base) ?? 0;
    let key: string;
    do { key = base + (i === 0 ? "" : i <= 26 ? String.fromCharCode(96 + i) : i); i++; } while (used.has(key));
    count.set(base, i);
    used.add(key);
    const pmid = (p.pmid ?? "").replace(/\D/g, "");
    const fields: [string, string][] = [
      ["title", esc(p.title)], ["author", p.authors.map(author).join(" and ")], ["year", p.year == null ? "" : String(p.year)],
      ["doi", raw(p.doi ?? "")], ["note", pmid && `PMID: ${pmid}`], ["url", raw(p.url)],
    ];
    const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`);
    return `@${p.doi || p.year != null ? "article" : "misc"}{${key},\n${body.join(",\n")}\n}\n`;
  }).join("\n");
}

/** RIS for the answer's references (CRLF line endings, one ER per record). */
export function toRis(refs: Reference[]): string {
  const line = (tag: string, v: string) => `${tag}  - ${one(v)}\r\n`;
  return refs.map(({ paper: p }) => [
    line("TY", "JOUR"), p.title && line("TI", p.title), ...p.authors.map((a) => line("AU", a)),
    p.year != null && line("PY", String(p.year)), p.doi && line("DO", p.doi), p.url && line("UR", p.url),
    p.pmid && line("N1", `PMID: ${p.pmid}`), line("ER", ""),
  ].filter(Boolean).join("")).join("");
}
