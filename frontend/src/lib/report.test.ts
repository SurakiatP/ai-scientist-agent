import { describe, expect, it } from "vitest";
import type { Session, Turn } from "./chat";
import { emptyProgress } from "./progress";
import { buildReportMarkdown } from "./report";
import type { Reference } from "./sse";

const ref = (id: string, status: Reference["status"], p: Partial<Reference["paper"]> = {}): Reference => ({
  id, status, paper: { title: `Paper ${id}`, authors: ["Ada"], year: 2024, doi: null, pmid: null, url: "", ...p },
});
const mk = (refs: Reference[], content = "Claim [1]."): [Session, Turn] => {
  const turn: Turn = { id: "t1", question: "What is X?", createdAt: 0, status: "done", progress: emptyProgress, answer: { content, references: refs } };
  return [{ id: "s", projectId: "personal", title: "What is X?", createdAt: 0, updatedAt: 0, turns: [turn] }, turn];
};

describe("buildReportMarkdown", () => {
  it("numbers references like the answer and keeps unverified ones with their status", () => {
    const [s, t] = mk([ref("1", "verified", { doi: "10.1000/a" }), ref("2", "unverified"), ref("3", "unknown", { pmid: "99" })]);
    const md = buildReportMarkdown(s, t, "en");
    expect(md).toContain("[1] Paper 1");
    expect(md).toContain("[2] Paper 2");
    expect(md).toContain("[3] Paper 3");
    expect(md).toContain("DOI: 10.1000/a");
    expect(md).toContain("PMID: 99");
    expect(md).toContain("No identifier to check");
    expect(md).toContain("Could not check");
    expect(md).toContain("Identifier exists");
    expect(md).toContain("What is X?");
    expect(md).toContain("Claim [1].");
  });
  it("uses Thai and English headings", () => {
    const [s, t] = mk([ref("1", "verified")]);
    expect(buildReportMarkdown(s, t, "th")).toContain("## เอกสารอ้างอิง");
    expect(buildReportMarkdown(s, t, "en")).toContain("## References");
  });
  it("does not carry raw html and drops non-http urls", () => {
    const [s, t] = mk([ref("1", "unknown", { title: "<img src=x onerror=1>", url: "javascript:alert(1)" })], "a <script>x</script> b");
    const md = buildReportMarkdown(s, t, "en");
    expect(md).not.toMatch(/<[a-z!/]/i);
    expect(md).not.toContain("javascript:");
  });
  it("neutralises images, non-http link targets and raw html outside code only", () => {
    const [s, t] = mk([ref("1", "unknown", { title: "[x](javascript:alert(1)) ![i](https://evil.example/p.png)", authors: ["<b>Eve</b>"] })],
      "![x](https://evil.example/x.png?q=1) [a](javascript:alert(1)) [b](data:text/html,x) [ok](https://ok.example) <script>x</script>\n\n```\nif (a <b) { <div> }\n```\n\n`<i>`\n\n[r]: javascript:alert(1)");
    const md = buildReportMarkdown(s, t, "en");
    expect(md).not.toMatch(/(^|[^\\])!\[/);
    expect(md).not.toMatch(/\]\(\s*(javascript|data):/i);
    expect(md).not.toMatch(/^\s*\[r\]:\s*javascript/m);
    expect(md).toContain("[ok](https://ok.example)");
    expect(md).not.toContain("<script>");
    expect(md).not.toContain("<b>");
    expect(md).toContain("if (a <b) { <div> }");
    expect(md).toContain("`<i>`");
  });
  it("does not treat escaped backticks as code", () => {
    const [s, t] = mk([], "\\`[x](javascript:alert(1))\\` and `[ok](javascript:keep)`");
    const md = buildReportMarkdown(s, t, "en");
    expect(md).not.toContain("\\`[x](javascript:");
    expect(md).toContain("`[ok](javascript:keep)`");
  });
  it("neutralises definitions inside blockquotes and lists", () => {
    const [s, t] = mk([], "> [r]: javascript:alert(1)\n- [q]: data:text/html,x\n1. [z]: https://ok.example\n\n[x][r] [q]");
    const md = buildReportMarkdown(s, t, "en");
    expect(md).not.toMatch(/\]:\s*(javascript|data):/i);
    expect(md).toContain("[z]: https://ok.example");
  });
});
