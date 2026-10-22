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
});
