import { describe, expect, it } from "vitest";
import { toBibtex, toRis } from "./bibliography";

type P = { title: string; authors: string[]; year: number | null; doi: string | null; pmid: string | null; url: string };
const r = (id: string, p: Partial<P> = {}) => ({ id, status: "verified" as const, paper: { title: "T", authors: ["Jane Smith"], year: 2020, doi: null, pmid: null, url: "https://x", ...p } });

describe("toBibtex", () => {
  it("builds an @article with key, authors, doi, pmid note and url", () => {
    const out = toBibtex([r("1", { title: "Zinc", authors: ["Jane Smith", "Somchai Jaidee"], doi: "10.1/x", pmid: "123" })]);
    expect(out).toContain("@article{smith2020,");
    expect(out).toContain("title = {Zinc}");
    expect(out).toContain("author = {Jane Smith and Somchai Jaidee}");
    expect(out).toContain("year = {2020}");
    expect(out).toContain("doi = {10.1/x}");
    expect(out).toContain("note = {PMID: 123}");
    expect(out).toContain("url = {https://x}");
  });
  it("escapes LaTeX specials and keeps Thai", () => {
    const out = toBibtex([r("1", { title: "A & B_{c} 5% #1 $2 \\ ^ ~", authors: ["สมชาย ใจดี"] })]);
    expect(out).toContain("A \\& B\\_\\textbraceleft{}c\\textbraceright{} 5\\% \\#1 \\$2 \\textbackslash{} \\^{} \\~{}");
    expect(out).toContain("สมชาย ใจดี");
  });
  it("uses ref/nd keys, @misc and omits empty fields", () => {
    const out = toBibtex([r("1", { authors: [], year: null, url: "", title: "" })]);
    expect(out).toContain("@misc{refnd,");
    expect(out).not.toMatch(/author|year|doi|note|url|title/);
  });
  it("folds accents and suffixes duplicate keys", () => {
    const out = toBibtex([r("1", { authors: ["José Müller"] }), r("2", { authors: ["Ann Muller"] }), r("3", { authors: ["Bo Muller"] })]);
    expect(out).toContain("@article{muller2020,");
    expect(out).toContain("@article{muller2020a,");
    expect(out).toContain("@article{muller2020b,");
  });
  it("@article when only a doi is present (no year)", () => {
    expect(toBibtex([r("1", { year: null, doi: "10/x" })])).toContain("@article{smithnd,");
  });
});

describe("untrusted metadata", () => {
  const balanced = (l: string) => { let d = 0; for (const c of l) { if (c === "{") d++; if (c === "}") d--; if (d < 0) return false; } return d === 0; };
  it("cannot break out of a field or start an entry", () => {
    const out = toBibtex([r("1", { title: "a}\n@misc{evil, title={x}", authors: ["Bob} and @x{"] })]);
    for (const l of out.split("\n").filter((l) => l && l !== "}")) { expect(balanced(l.replace(/^@article\{[^,]*,$/, ""))).toBe(true); if (l.startsWith("@")) expect(l).toBe("@article{bob2020,"); }
    expect(out.match(/^@/gm)).toHaveLength(1);
  });
  it("writes doi and url raw but percent-encodes structural characters", () => {
    const out = toBibtex([r("1", { doi: "10.1000/a_b", url: "https://x.org/p?q=a%20b#frag" })]);
    expect(out).toContain("doi = {10.1000/a_b}");
    expect(out).toContain("url = {https://x.org/p?q=a%20b#frag}");
    expect(toBibtex([r("1", { url: "https://x/{a} \\b\nc" })])).toContain("url = {https://x/%7Ba%7D%20%5Cb%20c}");
  });
  it("keeps only digits in the PMID note", () => {
    expect(toBibtex([r("1", { pmid: "12}3x" })])).toContain("note = {PMID: 123}");
    expect(toBibtex([r("1", { pmid: "abc" })])).not.toContain("note");
  });
  it("wraps an author containing ' and ' in braces", () => {
    expect(toBibtex([r("1", { authors: ["Smith and Wesson Group"] })])).toContain("author = {{Smith and Wesson Group}}");
  });
  it("gives 28 duplicates 28 distinct keys, numbering after z", () => {
    const keys = [...toBibtex(Array.from({ length: 28 }, (_, i) => r(String(i)))).matchAll(/^@article\{(.+),$/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(28);
    expect(keys[26]).toBe("smith2020z");
    expect(keys[27]).toBe("smith202027");
  });
  it("never reuses a key that already exists", () => {
    const keys = [...toBibtex([r("1"), r("2", { authors: ["X Smith"], year: 2020 }), r("3", { authors: ["Smitha"], year: 2020 }), r("4")]).matchAll(/^@article\{(.+),$/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(4);
  });
  it("RIS: embedded newlines cannot inject tags or records", () => {
    const out = toRis([r("1", { title: "a\nER  - \nTY  - JOUR", authors: ["b\r\nAU  - c"], url: "u\r\nDO  - x" })]);
    expect(out.match(/ER {2}- /g)).toHaveLength(1);
    expect(out.split("\r\n").filter(Boolean).map((l) => l.slice(0, 2))).toEqual(["TY", "TI", "AU", "PY", "UR", "ER"]);
  });
});

describe("toRis", () => {
  it("uses CRLF, one AU per author and one ER per record", () => {
    const out = toRis([r("1", { authors: ["A B", "C D"], doi: "10/x", pmid: "9" }), r("2")]);
    expect(out).toContain("TY  - JOUR\r\nTI  - T\r\nAU  - A B\r\nAU  - C D\r\nPY  - 2020\r\nDO  - 10/x\r\nUR  - https://x\r\nN1  - PMID: 9\r\nER  - \r\n");
    expect(out.match(/ER {2}- /g)).toHaveLength(2);
    expect(out.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("omits empty fields", () => {
    const out = toRis([r("1", { authors: [], year: null, url: "" })]);
    expect(out).not.toMatch(/^(AU|PY|DO|UR|N1) {2}-/m);
  });
});
