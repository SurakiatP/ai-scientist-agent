// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "scientist-prefs-v1";
const load = async () => (await import("./prefs")).usePrefs;

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

describe("prefs store", () => {
  it("defaults to th", async () => {
    expect((await load()).getState().lang).toBe("th");
  });
  it("persists setLang", async () => {
    const s = await load();
    s.getState().setLang("en");
    expect(s.getState().lang).toBe("en");
    expect(JSON.parse(localStorage.getItem(KEY)!).state.lang).toBe("en");
  });
  it("reads garbage stored value as th", async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { lang: "xx" }, version: 1 }));
    expect((await load()).getState().lang).toBe("th");
    vi.resetModules();
    localStorage.setItem(KEY, "{not json");
    expect((await load()).getState().lang).toBe("th");
  });
});
