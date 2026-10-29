// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { toTurn } from "./sync";
import type { Turn } from "./chat";
import { emptyProgress } from "./progress";
import { buildProvenanceFile, downloadProvenance, provenanceFilename, provenanceOf } from "./provenance";
import { usableProvenance } from "./sources";

const prov = { schema: 1 as const, created_at: "2026-10-29T08:00:00+00:00", models: { main: "m", fallback: "s" }, prompts: { branch: "abc" } };
const ref = { id: "r1", paper: { title: "T", authors: ["A"], year: 2020, doi: "10/x", pmid: null, url: "https://x", abstract: "SECRET ABSTRACT", source: "pubmed" }, status: "verified" as const };
const turn = (p: Partial<Turn> = {}): Turn => ({ id: "abcdef123456", question: "Q?", createdAt: Date.UTC(2026, 9, 29), status: "done", progress: emptyProgress, mode: "deep", answer: { content: "A", references: [ref], provenance: prov }, ...p });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("provenance file", () => {
  it("has the agreed shape and no abstracts", () => {
    const f = buildProvenanceFile(turn(), new Date(5))!;
    expect(f).toMatchObject({ format: "ai-scientist-provenance", version: 1, exported_at: "1970-01-01T00:00:00.005Z", analysis: null, provenance: prov,
      turn: { id: "abcdef123456", question: "Q?", mode: "deep", created_at: "2026-10-29T00:00:00.000Z" } });
    expect(f.answer.references[0]).toEqual({ id: "r1", title: "T", authors: ["A"], year: 2020, doi: "10/x", pmid: null, url: "https://x", source: "pubmed", status: "verified", checks: [] });
    expect(JSON.stringify(f)).not.toContain("SECRET ABSTRACT");
  });
  it("analysis turns carry the script and their own provenance", () => {
    const t = turn({ kind: "analysis", answer: undefined, analysis: { fileId: "f", fileName: "d.csv", steps: [], script: "print(1)", findings: ["x"], provenance: prov } });
    expect(buildProvenanceFile(t)).toMatchObject({ analysis: { script: "print(1)", file_id: "f", file_name: "d.csv" }, provenance: prov, answer: { content: "x", references: [] } });
  });
  it("a malformed createdAt does not throw: the current time stands in", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
    const t = turn({ createdAt: Number.NaN });
    expect(buildProvenanceFile(t, new Date("2026-11-02T10:00:00Z"))!.turn.created_at).toBe("2026-11-02T10:00:00.000Z");
    expect(provenanceFilename(t)).toBe("ai-scientist-provenance-2026-11-02-abcdef12.json");
    expect(provenanceFilename(turn({ createdAt: 1e20 }))).toBe("ai-scientist-provenance-2026-11-02-abcdef12.json");
  });
  it("old turns have none", () => {
    expect(provenanceOf(turn({ answer: { content: "A", references: [] } }))).toBeUndefined();
    expect(buildProvenanceFile(turn({ answer: { content: "A", references: [] } }))).toBeNull();
  });
  it("filename is dated and short", () => expect(provenanceFilename(turn())).toBe("ai-scientist-provenance-2026-10-29-abcdef12.json"));
  it("a server-synced turn with a bad provenance has none to download", () => {
    const row = (provenance: unknown) => ({ id: "x", question: "q", status: "done", mode: "deep", created_at: "2026-10-29T00:00:00Z", progress: {}, answer: { content: "a", references: [], provenance } });
    expect(provenanceOf(toTurn(row(prov))!)).toEqual(prov);
    expect(provenanceOf(toTurn(row({ schema: 2 }))!)).toBeUndefined();
    expect(provenanceOf(toTurn(row({ schema: 1, big: "x".repeat(50_001) }))!)).toBeUndefined();
    const an = (provenance: unknown) => ({ id: "x", question: "q", status: "done", mode: "analysis", created_at: "2026-10-29T00:00:00Z", progress: {}, analysis: { fileId: "f", steps: [], provenance } });
    expect(provenanceOf(toTurn(an({ schema: 2 }))!)).toBeUndefined();
  });
  it("downloads pretty JSON through a connected temporary link and revokes the URL", async () => {
    vi.useFakeTimers();
    let blob: Blob | undefined; let name = ""; let connected = false;
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = (b: Blob) => { blob = b; return "blob:x"; }; static revokeObjectURL = revoke; });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { name = this.download; connected = this.isConnected; });
    downloadProvenance(turn());
    expect(name).toBe("ai-scientist-provenance-2026-10-29-abcdef12.json");
    expect(connected).toBe(true);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(blob!.type).toContain("application/json");
    expect(blob!.type).toContain("charset=utf-8");
    expect(await blob!.text()).toContain('\n  "format": "ai-scientist-provenance"');
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });
  it("usableProvenance drops non-objects, other schemas and oversize", () => {
    expect(usableProvenance(prov)).toBe(prov);
    for (const bad of [null, "x", [], { schema: 2 }, {}, { schema: 1, big: "x".repeat(50_001) }]) expect(usableProvenance(bad)).toBeUndefined();
  });
});
