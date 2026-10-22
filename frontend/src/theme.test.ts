import { describe, expect, it } from "vitest";
import { palette, theme } from "./theme";

describe("theme", () => {
  it("uses Noto Sans Thai", () => {
    expect(theme.typography.fontFamily).toContain("Noto Sans Thai");
  });
  it("palette tokens are valid hex colours", () => {
    for (const [k, v] of Object.entries(palette)) {
      expect(v, k).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
