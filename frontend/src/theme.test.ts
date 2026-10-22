import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palette, paletteDark, theme } from "./theme";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("theme", () => {
  it("uses Noto Sans Thai", () => {
    expect(theme.typography.fontFamily).toContain("Noto Sans Thai");
  });
  it("theme colors come from palette", () => {
    expect(theme.palette.primary.main).toBe(palette.primary);
    expect(theme.palette.background.default).toBe(palette.background);
    if (theme.palette.secondary) expect(theme.palette.secondary.main).toBeDefined();
  });
  it("layout still loads Noto_Sans_Thai with thai and latin subsets", () => {
    const src = readFileSync("src/app/layout.tsx", "utf8");
    expect(src).toMatch(/import\s*{[^}]*Noto_Sans_Thai[^}]*}\s*from\s*"next\/font\/google"/);
    expect(src).toMatch(/subsets:\s*\[[^\]]*"thai"[^\]]*\]/);
    expect(src).toMatch(/subsets:\s*\[[^\]]*"latin"[^\]]*\]/);
  });
});

describe.each([
  ["light", palette],
  ["dark", paletteDark],
])("%s palette", (_n, p) => {
  it("tokens are valid hex colours", () => {
    for (const [k, v] of Object.entries(p)) expect(v, k).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("text tokens meet WCAG 4.5:1 on backgrounds", () => {
    for (const bg of [p.background, p.surface]) {
      for (const k of ["textPrimary", "textSecondary", "success", "error"] as const) {
        expect(ratio(p[k], bg), `${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(ratio(p.onPrimary, p.primary), "onPrimary on primary").toBeGreaterThanOrEqual(4.5);
  });
});
