import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACK_IDS, PACK_NAMES, type PackId, usablePack } from "./packs";

const PY = new URL("../../../backend/src/scientist/packs.py", import.meta.url);

describe("packs", () => {
  it("validates ids; unknown values give nothing", () => {
    expect(usablePack("chem")).toBe("chem");
    expect(usablePack("nope")).toBeUndefined();
    expect(usablePack("toString")).toBeUndefined();
    expect(usablePack(3)).toBeUndefined();
    expect(usablePack(null)).toBeUndefined();
    expect(Object.keys(PACK_NAMES)).toEqual([...PACK_IDS]);
  });
  it.skipIf(!existsSync(PY) && !process.env.CI)("ids equal the PACKS keys in backend/src/scientist/packs.py", () => {
    expect(existsSync(PY)).toBe(true); // in CI a missing backend file fails instead of skipping
    const py = readFileSync(PY, "utf8");
    const body = py.slice(py.indexOf("PACKS: dict"));
    const ids = [...body.matchAll(/^\s+"([a-z]+)": Pack\(/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect([...ids].sort()).toEqual([...PACK_IDS].sort());
  });
  it.skipIf(!existsSync(PY) && !process.env.CI)("names equal the PACKS names in backend/src/scientist/packs.py", () => {
    expect(existsSync(PY)).toBe(true);
    const body = readFileSync(PY, "utf8");
    const rows = [...body.slice(body.indexOf("PACKS: dict")).matchAll(/^\s+"([a-z]+)": Pack\("([^"]+)", "([^"]+)"/gm)];
    expect(rows.length).toBe(PACK_IDS.length);
    for (const [, id, th, en] of rows) expect({ th, en }).toEqual(PACK_NAMES[id as PackId]);
  });
});
