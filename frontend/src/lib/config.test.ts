import { describe, expect, it } from "vitest";
import { siteUrl } from "./config";

describe("siteUrl", () => {
  it("accepts only an http(s) origin", () => {
    for (const v of [undefined, "", "javascript:x", "not a url"]) expect(siteUrl(v)).toBeUndefined();
    expect(siteUrl("https://a.example/x")?.href).toBe("https://a.example/x");
  });
});
