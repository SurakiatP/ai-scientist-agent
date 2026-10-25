import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Palette } from "@mui/material/styles";
import { theme } from "./theme";

const schemes = (theme as unknown as { colorSchemes: Record<"light" | "dark", { palette: Palette }> }).colorSchemes;

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("theme", () => {
  it("uses Noto Sans Thai and data-attribute colour schemes", () => {
    expect(theme.typography.fontFamily).toContain("Noto Sans Thai");
    expect(Object.keys(schemes)).toEqual(expect.arrayContaining(["light", "dark"]));
  });

  it("loads Noto_Sans_Thai with thai + latin subsets", () => {
    const src = readFileSync("src/app/layout.tsx", "utf8");
    expect(src).toMatch(/import\s*{[^}]*Noto_Sans_Thai[^}]*}\s*from\s*"next\/font\/google"/);
    expect(src).toMatch(/subsets:\s*\[[^\]]*"thai"[^\]]*\]/);
    expect(src).toMatch(/subsets:\s*\[[^\]]*"latin"[^\]]*\]/);
    expect(src).toContain("InitColorSchemeScript");
  });

  describe.each(["light", "dark"] as const)("%s scheme", (mode) => {
    const p = schemes[mode].palette;
    it("primary on paper >= 4.5:1, body text on background >= 7:1", () => {
      expect(ratio(p.primary.main, p.background.paper)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(p.text.primary, p.background.default)).toBeGreaterThanOrEqual(7);
      expect(ratio(p.text.primary, p.background.paper)).toBeGreaterThanOrEqual(7);
    });
    it("has evidence and surface tokens, evidence text >= 4.5:1 on paper", () => {
      for (const k of ["verified", "unverified", "unknown"] as const) {
        expect(p.evidence[k], k).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(ratio(p.evidence[k], p.background.paper), k).toBeGreaterThanOrEqual(4.5);
      }
      expect(p.surface.shell).toMatch(/^#/);
      expect(p.surface.raised).toMatch(/^#/);
    });
  });
});
