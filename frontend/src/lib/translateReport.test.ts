// @vitest-environment jsdom
import type { JSONContent } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { applySegments, cachedTranslation, hashOf, runsFromMd, segmentsOf, translateSegments } from "./translateReport";

const t = (text: string, ...marks: string[]): JSONContent => ({ type: "text", text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", ...(content.length ? { content } : {}) });
const doc: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [t("Intro")] },
    p(t("Plain "), t("bold", "bold"), t(" and "), t("both", "bold", "italic"), { type: "hardBreak" }, t("next *star* line "), t("x=1", "code")),
    p(),
    { type: "bulletList", content: [
      { type: "listItem", content: [p(t("one")), { type: "orderedList", content: [{ type: "listItem", content: [p(t("nested", "italic"))] }] }] },
      { type: "listItem", content: [p(t("two"))] },
    ] },
    { type: "table", content: [
      { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 1 }, content: [p(t("H1"))] }] },
      { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1 }, content: [p(t("cell [3]"))] }] },
    ] },
  ],
};

describe("segments", () => {
  it("lists title, subtitle, then every text block in order with inline markdown", () => {
    expect(segmentsOf(doc, "T", "S")).toEqual([
      "T", "S", "Intro", "Plain **bold** and ***both***\nnext \\*star\\* line `x=1`", "", "one", "*nested*", "two", "H1", "cell [3]",
    ]);
  });
  it("round trip keeps structure, marks, hard breaks and code", () => {
    const segs = segmentsOf(doc, "T", "S");
    const r = applySegments(doc, segs);
    expect(r.doc).toEqual(doc);
    expect([r.title, r.subtitle]).toEqual(["T", "S"]);
    expect(segmentsOf(r.doc, r.title, r.subtitle)).toEqual(segs);
  });
  it("pours a translation into the same nodes and strips markdown from title and subtitle", () => {
    const segs = segmentsOf(doc, "T", "S").map((s) => (s ? `ท:${s}` : s));
    segs[0] = "**ชื่อ**";
    const r = applySegments(doc, segs);
    expect(r.title).toBe("ชื่อ");
    expect(r.doc.content![0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [t("ท:Intro")] });
    expect(r.doc.content![2]).toEqual(p()); // empty block untouched
    expect(r.doc.content![4].content![1].content![0].attrs).toEqual({ colspan: 1 });
  });
  it("hash tells same from edited", () => {
    expect(hashOf(["a", "b"])).toBe(hashOf(["a", "b"]));
    expect(hashOf(["a", "b"])).not.toBe(hashOf(["a", "c"]));
  });
});

describe("inline tokenizer", () => {
  const r = (md: string) => runsFromMd(md);
  it("toggles ** and * without flanking rules (Thai has no spaces)", () => {
    expect(r("value**(p<0.05)**")).toEqual([{ text: "value" }, { text: "(p<0.05)", bold: true }]);
    expect(r("**ผล.**ต่อ")).toEqual([{ text: "ผล.", bold: true }, { text: "ต่อ" }]);
    expect(r("***ab***")).toEqual([{ text: "ab", bold: true, italic: true }]);
  });
  it("everything else is literal", () => {
    for (const x of ["1. **Intro**", "- item", "# x", "&amp;", "[a](b)", "<http://a.b>", "> q", "a_b_c"]) expect(r(x).map((y) => y.text).join("")).toBe(x.replace(/\*\*/g, ""));
    expect(r("1. **Intro**")).toEqual([{ text: "1. " }, { text: "Intro", bold: true }]);
  });
  it("hard breaks, unmatched markers, escapes and code", () => {
    expect(r("a\n\nb")).toEqual([{ text: "a\n\nb" }]);
    expect(r("a **b")).toEqual([{ text: "a **b" }]);
    expect(r("a * b")).toEqual([{ text: "a * b" }]);
    expect(r("\\*x\\* \\\\")).toEqual([{ text: "*x* \\" }]);
    expect(r("`a*b` and `` x`y ``")).toEqual([{ text: "a*b", code: true }, { text: " and " }, { text: "x`y", code: true }]);
    expect(r("`open")).toEqual([{ text: "`open" }]);
  });
  it("identity round trip of tricky text", () => {
    const d: JSONContent = { type: "doc", content: [
      p(t("1. "), t("Intro", "bold")), p(t("- item & [a](b) <http://a.b> # x *star* \\ back")), p(t("a"), { type: "hardBreak" }, { type: "hardBreak" }, t("b")),
      p(t("x*y", "code"), t(" `tick` **lit**")), p(t("ผล.", "bold"), t("ต่อ")),
    ] };
    const segs = segmentsOf(d, "A *b* `c`", "S\\");
    const out = applySegments(d, segs);
    expect(out.doc).toEqual(d);
    expect([out.title, out.subtitle]).toEqual(["A *b* `c`", "S\\"]);
  });
});

describe("session cache", () => {
  it("ignores corrupted entries", async () => {
    for (const bad of ["not json", "{}", '[1,["a"]]', '[["k",[1]]]', '[["k","x"]]']) {
      sessionStorage.setItem("scientist-tr-v1", bad);
      expect(cachedTranslation("th", ["a"])).toBeUndefined();
    }
    sessionStorage.setItem("scientist-tr-v1", JSON.stringify([["junk", 3], [`th:${hashOf(["a"])}`, ["ก"]]]));
    expect(cachedTranslation("th", ["a"])).toEqual(["ก"]);
    await expect(translateSegments("th", ["a"], new AbortController().signal)).resolves.toEqual(["ก"]);
  });
});
