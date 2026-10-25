// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "scientist-history-v1";
const mk = (id: string, createdAt: number, savedAt?: number) => ({ id, question: "q" + id, answer: "a", references: [], createdAt, savedAt });
const load = async () => (await import("./history")).useHistoryStore;

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

describe("history store", () => {
  it("adds newest first, toggles saved, removes, clears", async () => {
    const s = await load();
    s.getState().add(mk("1", 1)); s.getState().add(mk("2", 2));
    expect(s.getState().items.map((i) => i.id)).toEqual(["2", "1"]);
    s.getState().toggleSaved("1");
    expect(s.getState().items[1].savedAt).toBeTypeOf("number");
    s.getState().toggleSaved("1");
    expect(s.getState().items[1].savedAt).toBeUndefined();
    s.getState().remove("2");
    expect(s.getState().items.map((i) => i.id)).toEqual(["1"]);
    s.getState().clear();
    expect(s.getState().items).toEqual([]);
  });

  it("cap drops oldest unsaved, never a saved one", async () => {
    const s = await load();
    s.getState().add(mk("old-saved", 0, 5));
    for (let i = 1; i <= 200; i++) s.getState().add(mk("n" + i, i));
    const ids = s.getState().items.map((i) => i.id);
    expect(ids).toHaveLength(200);
    expect(ids).toContain("old-saved");
    expect(ids).not.toContain("n1");
    expect(ids).toContain("n200");
  });

  it("persists across store re-creation", async () => {
    let s = await load();
    s.getState().add(mk("1", 1));
    vi.resetModules();
    s = await load();
    expect(s.getState().items.map((i) => i.id)).toEqual(["1"]);
  });

  it("starts empty on corrupted JSON", async () => {
    localStorage.setItem(KEY, "{not json");
    expect((await load()).getState().items).toEqual([]);
  });

  it("drops invalid items, keeps valid ones", async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { items: [mk("ok", 1), { id: 1 }, null, { ...mk("bad", 2), references: [{ id: "1" }] }] }, version: 0 }));
    expect((await load()).getState().items.map((i) => i.id)).toEqual(["ok"]);
  });

  it("saved-only cap: 201 saved keeps all; 201 with 150 saved drops only oldest unsaved", async () => {
    let s = await load();
    for (let i = 1; i <= 201; i++) s.getState().add(mk("s" + i, i, 1));
    expect(s.getState().items).toHaveLength(201);
    localStorage.clear(); vi.resetModules(); s = await load();
    for (let i = 1; i <= 150; i++) s.getState().add(mk("s" + i, i, 1));
    for (let i = 151; i <= 201; i++) s.getState().add(mk("u" + i, i));
    const ids = s.getState().items.map((i) => i.id);
    expect(ids).toHaveLength(200);
    expect(ids).not.toContain("u151");
    expect(ids).toContain("u152");
    expect(ids.filter((i) => i.startsWith("s"))).toHaveLength(150);
  });

  it("duplicate id keeps one item and its savedAt", async () => {
    const s = await load();
    s.getState().add(mk("1", 1, 9)); s.getState().add(mk("1", 2));
    expect(s.getState().items).toHaveLength(1);
    expect(s.getState().items[0].savedAt).toBe(9);
  });

  it("ties on createdAt drop the oldest by insertion", async () => {
    const s = await load();
    for (let i = 1; i <= 201; i++) s.getState().add(mk("t" + i, 5));
    const ids = s.getState().items.map((i) => i.id);
    expect(ids).not.toContain("t1");
    expect(ids).toContain("t2");
  });

  it("throwing setItem does not throw and keeps memory state", async () => {
    const s = await load();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => s.getState().add(mk("1", 1))).not.toThrow();
    expect(() => s.getState().toggleSaved("1")).not.toThrow();
    expect(s.getState().items[0].savedAt).toBeTypeOf("number");
    expect(() => s.getState().clear()).not.toThrow();
    vi.restoreAllMocks();
  });

  it("throwing getItem starts empty", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect((await load()).getState().items).toEqual([]);
    vi.restoreAllMocks();
  });

  it("corrupt value self-heals on next write", async () => {
    localStorage.setItem(KEY, "{nope");
    const s = await load();
    s.getState().add(mk("1", 1));
    expect(JSON.parse(localStorage.getItem(KEY)!).state.items).toHaveLength(1);
  });

  it("handles v1, version 0 and unknown versions without crashing", async () => {
    for (const version of [1, 0, 99]) {
      localStorage.setItem(KEY, JSON.stringify({ state: { items: [mk("ok", 1)] }, version })); vi.resetModules();
      expect((await load()).getState().items.map((i) => i.id)).toEqual(["ok"]);
    }
    localStorage.setItem(KEY, JSON.stringify({ state: null, version: 7 })); vi.resetModules();
    expect((await load()).getState().items).toEqual([]);
  });

  it("drops oversize items (multi-MB answer, 5000 references)", async () => {
    const ref = { id: "1", status: "verified", paper: { title: "t", authors: [], year: null, doi: null, pmid: null, url: "https://x.y" } };
    localStorage.setItem(KEY, JSON.stringify({ state: { items: [
      mk("ok", 1), { ...mk("big", 2), answer: "x".repeat(2_000_000) }, { ...mk("refs", 3), references: Array(5000).fill(ref) },
    ] }, version: 1 }));
    expect((await load()).getState().items.map((i) => i.id)).toEqual(["ok"]);
  });

  it("newId falls back when randomUUID is missing", async () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint32Array) => a.fill(123456) });
    const { newId } = await import("./history");
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newId()).not.toBe("");
    vi.unstubAllGlobals();
  });
});
