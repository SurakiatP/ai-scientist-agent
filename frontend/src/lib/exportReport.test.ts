import { afterEach, describe, expect, it, vi } from "vitest";
import type { Turn } from "./chat";
import { blocksOf, docFromSections, draftIssue, draftSections, errorText, fileNameOf, initialDraft, requestExport, sectionsOf, toPayload, LIM } from "./exportReport";
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
    expect(toPayload({ ...initialDraft(turn, "en", strings.en), refs: false }, "docx", turn).references).toEqual([]);
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
