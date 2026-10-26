import { afterEach, describe, expect, it, vi } from "vitest";
import type { Turn } from "./chat";
import { blocksOf, docFromSections, draftIssue, draftSections, errorText, fileNameOf, initialDraft, requestExport, sectionsOf, toPayload, refLines, hasLead, FONTS, defaultFont, LIM } from "./exportReport";
import { strings } from "./strings";

const turn = { id: "t", question: "Q?", createdAt: 0, status: "done", progress: {} as never, answer: { content: "intro\n\n## A\n\np1\n\np2\n\n```\n# not heading\n```\n\n### B\n\nx", references: [{ id: "1", status: "verified", paper: { title: "T", authors: ["a"], year: 2020, doi: "doi:10.1000/x", pmid: null, url: "javascript:1" } }] } } as Turn;
afterEach(() => vi.unstubAllGlobals());

describe("export draft", () => {
  it("splits headings outside fences, keeps text before the first heading", () => {
    const s = draftSections(turn.answer!.content, "Answer");
    expect(s.map((x) => x.heading)).toEqual(["Answer", "A", "B"]);
    expect(s[1].text).toContain("# not heading");
    expect(blocksOf(s[1].text)).toHaveLength(3);
  });
  it("round trip sections -> doc -> sections keeps headings, runs, lists, tables", () => {
    const text = "Hi **bold** and *it*\n\n- one\n- two\n\n1. a\n2. b\n\n| h1 | h2 |\n|---|---|\n| x | y |";
    const doc = docFromSections([{ heading: "H", text }]);
    expect(doc.content![0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    const d = { ...initialDraft(turn, "en", strings.en), doc };
    expect(sectionsOf(d)).toEqual([{ heading: "H", blocks: blocksOf(text) }]);
  });
  it("text before the first heading goes under the fallback; empty paragraphs are dropped", () => {
    const d = { ...initialDraft(turn, "en", strings.en), lead: "Lead", doc: { type: "doc", content: [{ type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "a" }] }, { type: "paragraph", content: [{ type: "text", text: "  " }] }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] }] } };
    expect(sectionsOf(d)).toEqual([{ heading: "Lead", blocks: [{ type: "paragraph", runs: [{ text: "a" }] }] }, { heading: "H", blocks: [] }]);
  });
  it("splits an over-long paragraph without losing text and flags section limits", () => {
    const long = "word ".repeat(2000);
    const d0 = initialDraft(turn, "th", strings.th);
    const bs = sectionsOf({ ...d0, doc: docFromSections([{ heading: "h", text: long }]) })[0].blocks;
    expect(bs[0].type === "paragraph" && bs[0].runs.length).toBeGreaterThan(1);
    expect(bs.every((b) => b.type === "paragraph" && b.runs.every((r) => r.text.length <= LIM.para))).toBe(true);
    expect(bs.map((b) => b.type === "paragraph" && b.runs.map((r) => r.text).join("")).join("").replace(/\s+/g, " ")).toBe(long.trim());
    expect(draftIssue(d0)).toBeNull();
    expect(draftIssue({ ...d0, title: " " })).toBe("title");
    expect(draftIssue({ ...d0, doc: docFromSections(Array.from({ length: 31 }, () => ({ heading: "h", text: "x" }))) })).toBe("limits");
  });
  it("payload follows the contract and drops non-http urls", () => {
    const p = toPayload(initialDraft(turn, "en", strings.en), "pdf", turn);
    expect(p).toMatchObject({ format: "pdf", language: "en", references: [{ id: "1", doi: "10.1000/x", url: "https://doi.org/10.1000/x", status: "verified" }] });
    expect(p.font).toBe("sarabun");
    expect(toPayload({ ...initialDraft(turn, "en", strings.en), font: "th-niramit" }, "pdf", turn).font).toBe("th-niramit");
    expect(toPayload({ ...initialDraft(turn, "en", strings.en), refs: false }, "docx", turn).references).toEqual([]);
  });
});

describe("FONTS", () => {
  it("lists the 14 backend ids once, with a face each; style picks the default", () => {
    expect(FONTS).toHaveLength(14);
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(14);
    expect(FONTS.every((f) => f.cssFamily && f.label)).toBe(true);
    expect([defaultFont("standard"), defaultFont("official")]).toEqual(["sarabun", "th-sarabun-new"]);
  });
});

describe("requestExport", () => {
  it("returns blob and server filename; maps statuses and network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 200, headers: { "Content-Disposition": "attachment; filename*=UTF-8''%E0%B8%A3%E0%B8%B2%E0%B8%A2.pdf" } })));
    const r = await requestExport(toPayload(initialDraft(turn, "th", strings.th), "pdf", turn));
    expect(r.name).toBe("ราย.pdf");
    for (const [status, code] of [[413, "413"], [422, "422"], [503, "503"], [500, "other"]] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status })));
      await expect(requestExport({} as never)).rejects.toBe(code);
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("x")));
    await expect(requestExport({} as never)).rejects.toBe("net");
    expect(errorText("net", strings.en)).toBe(strings.en.fErrNet);
    expect(fileNameOf(null, "docx")).toBe("report.docx");
  });
});

describe("markdown blocks", () => {
  it("builds runs, lists, tables; keeps [1]; flattens nested lists; pads nothing it does not own", () => {
    const b = blocksOf("Hi **bold** and *it* and `a|b` [1] ไทย\n\n- one\n  - nested\n- **สอง**\n\n1. a\n2. b\n\n| ชื่อ | ค่า |\n|---|---|\n| น้ำ | |\n| `x\\|y` |");
    expect(b[0]).toEqual({ type: "paragraph", runs: [{ text: "Hi " }, { text: "bold", bold: true }, { text: " and " }, { text: "it", italic: true }, { text: " and " }, { text: "a|b", code: true }, { text: " [1] ไทย" }] });
    expect(b[1]).toMatchObject({ type: "bullets", items: [[{ text: "one" }], [{ text: "nested" }], [{ text: "สอง", bold: true }]] });
    expect(b[2]).toMatchObject({ type: "numbered", items: [[{ text: "a" }], [{ text: "b" }]] });
    expect(b[3]).toEqual({ type: "table", header: ["ชื่อ", "ค่า"], rows: [["น้ำ", ""], ["x|y"]] });
  });
  it("heading becomes a bold paragraph; links keep their url; no html is produced", () => {
    expect(blocksOf("#### Head\n\n[site](https://a.b) <b>x</b>")).toMatchObject([
      { type: "paragraph", runs: [{ text: "Head", bold: true }] },
      { type: "paragraph", runs: [{ text: "site (https://a.b) <b>x</b>" }] },
    ]);
  });
  it("splits huge tables and flags wide ones", () => {
    const rows = Array.from({ length: 250 }, (_, i) => `| ${i} | y |`).join("\n");
    const t = blocksOf(`| a | b |\n|---|---|\n${rows}`);
    expect(t.map((x) => x.type === "table" && x.rows.length)).toEqual([100, 100, 50]);
    const d = initialDraft(turn, "th", strings.th);
    const wide = (n: number) => ({ ...d, doc: docFromSections([{ heading: "h", text: `|${"a|".repeat(n)}\n|${"-|".repeat(n)}\n|${"b|".repeat(n)}` }]) });
    expect(draftIssue(wide(12))).toBeNull();
    expect(draftIssue(wide(13))).toBe("table");
    expect(toPayload(wide(3), "pdf", turn).sections[0].blocks[0]).toMatchObject({ type: "table", header: ["a", "a", "a"] });
  });
});

describe("editor schema and limits", () => {
  const d0 = () => initialDraft(turn, "en", strings.en);
  it("inline code and fenced code survive loading into a real editor", async () => {
    const { Editor } = await import("@tiptap/core");
    const { reportExtensions } = await import("./reportExtensions");
    const sections = [{ heading: "H", text: "use `x` here\n\n```\ncode line\n```\n\n- item `y`" }];
    const doc = docFromSections(sections);
    const ed = new Editor({ extensions: reportExtensions, content: doc });
    const got = sectionsOf({ doc: ed.getJSON(), lead: "L" });
    expect(got).toEqual(sectionsOf({ doc, lead: "L" }));
    expect(JSON.stringify(got)).toContain("code line");
    expect(JSON.stringify(got)).toContain('"code":true');
    expect(got[0].heading).toBe("H");
    ed.destroy();
  });
  it("splits an over-long list item run and flags too many runs / over 200k chars", () => {
    const item = (text: string) => ({ ...d0(), doc: docFromSections([{ heading: "h", text: `- ${text}` }]) });
    const b = sectionsOf(item("word ".repeat(1200)))[0].blocks[0];
    expect(b.type === "bullets" && b.items[0].every((r) => r.text.length <= LIM.para) && b.items[0].length > 1).toBe(true);
    expect(draftIssue(item("word ".repeat(1200)))).toBeNull();
    const many = { ...d0(), doc: { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: Array.from({ length: 201 }, (_, i) => ({ type: "text", text: "a", marks: [{ type: i % 2 ? "bold" : "italic" }] })) }] }] }] } };
    expect(draftIssue(many)).toBe("limits");
    const para = (n: number) => ({ type: "paragraph", content: [{ type: "text", text: "a".repeat(n) }] });
    const big = (total: number) => ({ ...d0(), title: "T", doc: { type: "doc", content: Array.from({ length: total / 5000 }, () => para(5000)).reduce<object[]>((a, p, i) => [...a, ...(i % 40 === 0 ? [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "h" }] }] : []), p], []) } });
    expect(draftIssue(big(195000))).toBeNull();
    expect(draftIssue({ ...big(200000), title: "TT" })).toBe("limits");
    // empty headings are sent as " " and the server counts them
    const emptyHead = { type: "heading", attrs: { level: 2 }, content: [] };
    const tight = { ...d0(), title: "T", doc: { type: "doc", content: [emptyHead, ...Array.from({ length: 39 }, () => para(5000)), emptyHead, para(4999)] } };
    expect(draftIssue(tight)).toBe("limits");
  });
  it("keeps text of a table inside a list item; hard breaks become spaces; long heading has its own issue", () => {
    const cellP = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
    const doc = { type: "doc", content: [
      { type: "bulletList", content: [{ type: "listItem", content: [cellP("a"), { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [cellP("SECRET")] }] }] }] }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A" }, { type: "hardBreak" }, { type: "text", text: "B" }] },
    ] };
    const ss = sectionsOf({ doc, lead: "L" });
    expect(JSON.stringify(ss[0].blocks)).toContain("SECRET");
    expect(ss[1].heading).toBe("A B");
    expect(draftIssue({ ...d0(), doc: docFromSections([{ heading: "x".repeat(201), text: "" }]) })).toBe("heading");
  });
});

describe("refLines", () => {
  const R = { id: "1", title: "T", authors: [] as string[], year: null as number | null, doi: null as string | null, url: null as string | null, status: "unknown" as const };
  it("follows ref_line() in the backend", () => {
    expect(refLines([R], "en")).toEqual(["[1] T. (could not be checked)"]);
    expect(refLines([{ ...R, year: 2020 }], "en")).toEqual(["[1] (2020). T. (could not be checked)"]);
    expect(refLines([{ ...R, authors: ["A", "B"], year: 2020, doi: "10/x", url: "https://u", status: "verified" }], "th")).toEqual(["[1] A, B (2020). T. DOI: 10/x https://u (พบตัวระบุอ้างอิง)"]);
    expect(refLines([{ ...R, authors: ["A"], url: "javascript:x", status: "unverified" }], "th")).toEqual(["[1] A. T. (ยังไม่ยืนยัน)"]);
  });
});

describe("hasLead", () => {
  const h = { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H" }] };
  const p = (text?: string) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
  it("is true only when real content sits above the first heading", () => {
    expect(hasLead({ doc: { type: "doc", content: [h, p("x")] } })).toBe(false);
    expect(hasLead({ doc: { type: "doc", content: [p(), h, p("x")] } })).toBe(false);
    expect(hasLead({ doc: { type: "doc", content: [p("lead"), h] } })).toBe(true);
    expect(hasLead({ doc: { type: "doc", content: [p("only")] } })).toBe(true);
  });
});
