import type { JSONContent } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { applySegments, hashOf, segmentsOf } from "./translateReport";

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
