import type { JSONContent } from "@tiptap/react";
import type { Lang } from "./strings";

// Paper types and their outlines: a client-side helper only, the backend never sees the type. Labels are the headings written into the draft.
export const PAPER_TYPES = ["research", "cs", "review", "thesis_th", "proposal"] as const;
export type PaperType = (typeof PAPER_TYPES)[number];
const O = (th: string[], en: string[]) => ({ th, en });
export const OUTLINES: Record<PaperType, Record<Lang, string[]>> = {
  research: O(["บทนำ", "วิธีการ", "ผลการวิจัย", "อภิปรายผล", "สรุป"], ["Introduction", "Methods", "Results", "Discussion", "Conclusion"]),
  cs: O(["บทนำ", "งานที่เกี่ยวข้อง", "วิธีการ", "การทดลอง", "ผลลัพธ์", "อภิปรายผล", "สรุป"], ["Introduction", "Related Work", "Method", "Experiments", "Results", "Discussion", "Conclusion"]),
  review: O(["บทนำ", "วิธีการสืบค้น", "การสังเคราะห์ผลการศึกษา", "อภิปรายผล", "สรุป"], ["Introduction", "Search methods", "Synthesis of findings", "Discussion", "Conclusion"]),
  // Thai chapters keep the Thai wording in both languages: the university manual fixes the names
  thesis_th: O(["บทที่ 1 บทนำ", "บทที่ 2 เอกสารและงานวิจัยที่เกี่ยวข้อง", "บทที่ 3 วิธีดำเนินการวิจัย", "บทที่ 4 ผลการวิจัย", "บทที่ 5 สรุป อภิปรายผล และข้อเสนอแนะ"],
    ["บทที่ 1 บทนำ", "บทที่ 2 เอกสารและงานวิจัยที่เกี่ยวข้อง", "บทที่ 3 วิธีดำเนินการวิจัย", "บทที่ 4 ผลการวิจัย", "บทที่ 5 สรุป อภิปรายผล และข้อเสนอแนะ"]),
  proposal: O(["ความเป็นมาและความสำคัญ", "วัตถุประสงค์", "ขอบเขต", "ระเบียบวิธีวิจัย", "แผนการดำเนินงาน", "ผลที่คาดว่าจะได้รับ"],
    ["Background and rationale", "Objectives", "Scope", "Methodology", "Work plan", "Expected outcomes"]),
};

// Case, spacing and numbering ("1.", "I.", "บทที่ 1") are ignored, so "1. Introduction" counts as Introduction.
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase().replace(/^(\d+(\.\d+)*\.?|[ivx]+\.|บทที่\s*\d+)\s*/, "");
const headingText = (n: JSONContent): string => n.text ?? (n.content ?? []).map(headingText).join("");

// Outline headings that the document does not have yet (case and spacing ignored). Existing text is never compared away or touched.
export function missingHeadings(doc: JSONContent, type: PaperType, lang: Lang): string[] {
  const have = new Set((doc.content ?? []).filter((n) => n.type === "heading").map((n) => norm(headingText(n))));
  return OUTLINES[type][lang].filter((h, i) => !have.has(norm(h)) && !have.has(norm(OUTLINES[type][lang === "th" ? "en" : "th"][i]))); // the other language at the same position counts too
}

// Heading + empty paragraph per missing heading, to append after the existing content.
export const outlineNodes = (heads: string[]): JSONContent[] => heads.flatMap((h) => [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: h }] }, { type: "paragraph" }]);
