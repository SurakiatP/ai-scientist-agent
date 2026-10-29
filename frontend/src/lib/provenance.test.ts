// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Turn } from "./chat";
import { emptyProgress } from "./progress";
import { buildProvenanceFile, downloadProvenance, provenanceFilename, provenanceOf } from "./provenance";
import { usableProvenance } from "./sources";

const prov = { schema: 1 as const, created_at: "2026-10-29T08:00:00+00:00", models: { main: "m", fallback: "s" }, prompts: { branch: "abc" } };
const ref = { id: "r1", paper: { title: "T", authors: ["A"], year: 2020, doi: "10/x", pmid: null, url: "https://x", abstract: "SECRET ABSTRACT", source: "pubmed" }, status: "verified" as const };
const turn = (p: Partial<Turn> = {}): Turn => ({ id: "abcdef123456", question: "Q?", createdAt: Date.UTC(2026, 9, 29), status: "done", progress: emptyProgress, mode: "deep", answer: { content: "A", references: [ref], provenance: prov }, ...p });

describe("provenance file", () => {
  it("has the agreed shape and no abstracts", () => {
    const f = buildProvenanceFile(turn(), new Date(5))!;
    expect(f).toMatchObject({ format: "ai-scientist-provenance", version: 1, exported_at: "1970-01-01T00:00:00.005Z", analysis: null, provenance: prov,
      turn: { id: "abcdef123456", question: "Q?", mode: "deep", created_at: "2026-10-29T00:00:00.000Z" } });
    expect(f.answer.references[0]).toEqual({ id: "r1", title: "T", authors: ["A"], year: 2020, doi: "10/x", pmid: null, url: "https://x", source: "pubmed", status: "verified", checks: [] });
    expect(JSON.stringify(f)).not.toContain("SECRET ABSTRACT");
  });
  it("analysis turns carry the script and their own provenance", () => {
    const t = turn({ kind: "analysis", answer: undefined, analysis: { fileId: "f", steps: [], script: "print(1)", findings: ["x"], provenance: prov } });
    expect(buildProvenanceFile(t)).toMatchObject({ analysis: { script: "print(1)" }, provenance: prov, answer: { content: "x", references: [] } });
  });
  it("old turns have none", () => {
    expect(provenanceOf(turn({ answer: { content: "A", references: [] } }))).toBeUndefined();
    expect(buildProvenanceFile(turn({ answer: { content: "A", references: [] } }))).toBeNull();
  });
  it("filename is dated and short", () => expect(provenanceFilename(turn())).toBe("provenance-2026-10-29-abcdef12.json"));
  it("downloads pretty JSON through a temporary link", async () => {
    let blob: Blob | undefined; let name = "";
    URL.createObjectURL = ((b: Blob) => { blob = b; return "blob:x"; }) as never; URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { name = this.download; };
    downloadProvenance(turn());
    expect(name).toBe("provenance-2026-10-29-abcdef12.json");
    expect(blob!.type).toContain("application/json");
    expect(await blob!.text()).toContain('\n  "format": "ai-scientist-provenance"');
  });
  it("usableProvenance drops non-objects, other schemas and oversize", () => {
    expect(usableProvenance(prov)).toBe(prov);
    for (const bad of [null, "x", [], { schema: 2 }, {}, { schema: 1, big: "x".repeat(50_001) }]) expect(usableProvenance(bad)).toBeUndefined();
  });
});
