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

  it("reviewPlan defaults to true", async () => {
    expect((await load()).getState().reviewPlan).toBe(true);
  });
  it("persists setReviewPlan", async () => {
    const s = await load();
    s.getState().setReviewPlan(false);
    expect(s.getState().reviewPlan).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).state.reviewPlan).toBe(false);
    vi.resetModules();
    expect((await load()).getState().reviewPlan).toBe(false);
  });
  it("reads garbage or missing reviewPlan as true, explicit false survives reload", async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { reviewPlan: "off" }, version: 1 }));
    expect((await load()).getState().reviewPlan).toBe(true);
    vi.resetModules();
    localStorage.setItem(KEY, JSON.stringify({ state: { reviewPlan: false }, version: 1 }));
    expect((await load()).getState().reviewPlan).toBe(false);
  });
});
