import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOURCE_NAMES, sourceName, sourceNames } from "./sources";

const PY = new URL("../../../backend/src/scientist/sources.py", import.meta.url);

describe("source names", () => {
  it("map ids to display names; unknown or missing ids give nothing", () => {
    expect(sourceName("europepmc")).toBe("Europe PMC");
    expect(sourceName("uniprot")).toBe("UniProt");
    expect(sourceName(null)).toBe("");
    expect(sourceName(undefined)).toBe("");
    expect(sourceName("toString")).toBe("");
    expect(sourceNames(["pubmed", "nope", "arxiv"])).toBe("PubMed · arXiv");
    expect(sourceNames(undefined)).toBe("");
  });
  // Cross-language check: the table must list exactly the backend's ids and names (parsed from sources.py).
  it.skipIf(!existsSync(PY))("matches backend/src/scientist/sources.py", () => {
    const py = readFileSync(PY, "utf8");
    const papers = py.slice(py.indexOf("PAPER_SOURCES: dict"), py.indexOf("def _squash"));
    const data = py.slice(py.indexOf("DATA_SOURCES: dict"), py.indexOf("def record_host_ok"));
    const expected: Record<string, string> = {};
    for (const m of papers.matchAll(/"([a-z0-9-]+)": "([^"]+)"/g)) expected[m[1]] = m[2];
    for (const m of data.matchAll(/"([a-z0-9-]+)": _d\("([^"]+)"/g)) expected[m[1]] = m[2];
    expect(Object.keys(expected).length).toBeGreaterThan(70);
    expect(SOURCE_NAMES).toEqual(expected);
  });
});
