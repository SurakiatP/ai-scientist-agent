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
    expect(out).toContain("A \\& B\\_\\{c\\} 5\\% \\#1 \\$2 \\textbackslash{} \\^{} \\~{}");
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
  it("@article when year without doi; @misc needs neither", () => {
    expect(toBibtex([r("1", { year: null, doi: "10/x" })])).toContain("@article{smithnd,");
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
