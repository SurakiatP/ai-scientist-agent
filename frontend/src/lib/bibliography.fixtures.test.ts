import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toBibtex, toRis } from "./bibliography";

// The same files are asserted by backend/tests/test_bibliography.py against the Python port: the two cannot drift.
const dir = join(__dirname, "../../../backend/tests/fixtures/bibliography");
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

describe("bibliography fixtures shared with the backend", () => {
  it("has fixtures", () => expect(files.length).toBeGreaterThanOrEqual(8));
  it.each(files)("%s", (f) => {
    const c = JSON.parse(readFileSync(join(dir, f), "utf-8"));
    expect(toBibtex(c.references)).toBe(c.bibtex);
    expect(toRis(c.references)).toBe(c.ris);
  });
});
