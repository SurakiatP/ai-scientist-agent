// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "scientist-files-v1";
const id = (n: number) => n.toString(16).padStart(32, "0");
const entry = (n: number, over = {}) => ({ id: id(n), name: `f${n}.csv`, size: 5, kind: "csv", createdAt: n, projectId: "personal", ...over });
const load = async () => await import("./files");

beforeEach(() => { localStorage.clear(); vi.resetModules(); });
afterEach(() => vi.unstubAllGlobals());

describe("files store", () => {
  it("adds newest first, dedupes by id, renames, moves, removes", async () => {
    const { useFilesStore: s } = await load();
    s.getState().add(entry(1)); s.getState().add(entry(2)); s.getState().add(entry(1, { name: "again.csv", createdAt: 3 }));
    expect(s.getState().files.map((f) => f.name)).toEqual(["again.csv", "f2.csv"]);
    s.getState().rename(id(2), "new.json");
    s.getState().move(id(2), "p9");
    expect(s.getState().files.find((f) => f.id === id(2))).toMatchObject({ name: "new.json", kind: "json", projectId: "p9" });
    s.getState().remove(id(1));
    expect(s.getState().files).toHaveLength(1);
  });
  it("drops malformed persisted entries and keeps good ones", async () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { files: [entry(1), entry(1), { ...entry(2), id: "../x" }, { ...entry(3), size: -1 }, { ...entry(4), name: "" }, "x", null, entry(5)] }, version: 1 }));
    const { useFilesStore: s } = await load();
    expect(s.getState().files.map((f) => f.id)).toEqual([id(5), id(1)]);
  });
  it("clamps the write side and caps the list", async () => {
    const { useFilesStore: s, MAX_FILES } = await load();
    s.getState().add(entry(1, { name: "x".repeat(300) + ".csv" }));
    expect(s.getState().files[0].name.length).toBe(120);
    for (let i = 2; i < MAX_FILES + 5; i++) s.getState().add(entry(i));
    expect(s.getState().files).toHaveLength(MAX_FILES);
  });
  it("registerUpload stores the kind from the name", async () => {
    const { registerUpload, useFilesStore: s } = await load();
    registerUpload({ id: id(7), name: "Data.XLSX", size: 9 }, "p1");
    expect(s.getState().files[0]).toMatchObject({ kind: "xlsx", projectId: "p1" });
  });
});

describe("checkName", () => {
  it("mirrors the server rules", async () => {
    const { checkName } = await load();
    expect(checkName(" a/b.csv ", "csv")).toEqual({ name: "b.csv" });
    expect(checkName("A.CSV", "csv")).toEqual({ name: "A.CSV" });
    expect(checkName("  ", "csv")).toEqual({ problem: "empty" });
    expect(checkName("x".repeat(118) + ".csv", "csv")).toEqual({ problem: "long" });
    expect(checkName("a\nb.csv", "csv")).toEqual({ problem: "chars" });
    expect(checkName("a.json", "csv")).toEqual({ problem: "ext" });
    expect(checkName("noext", "csv")).toEqual({ problem: "ext" });
  });
});

describe("file api", () => {
  const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  it("PATCH sends the name and returns the meta", async () => {
    const f = reply(200, { id: id(1), name: "n.csv", size: 3, kind: "csv" });
    vi.stubGlobal("fetch", f);
    const { renameFile } = await load();
    expect(await renameFile(id(1), "n.csv")).toEqual({ id: id(1), name: "n.csv", size: 3, kind: "csv" });
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ method: "PATCH", body: '{"name":"n.csv"}' });
  });
  it("maps status codes, network failure and bad bodies to FileApiError", async () => {
    const { fetchMeta, deleteFile, FileApiError } = await load();
    for (const status of [404, 422, 503]) {
      vi.stubGlobal("fetch", reply(status));
      await expect(deleteFile(id(1))).rejects.toMatchObject({ status });
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("net"); }));
    await expect(fetchMeta(id(1))).rejects.toMatchObject({ status: 0 });
    vi.stubGlobal("fetch", reply(200, { id: 1 }));
    await expect(fetchMeta(id(1))).rejects.toBeInstanceOf(FileApiError);
  });
  it("validates the preview shape", async () => {
    const { fetchPreview } = await load();
    vi.stubGlobal("fetch", reply(200, { columns: ["a"], rows: [["1"]], truncated: true, total_rows: null }));
    expect(await fetchPreview(id(1), new AbortController().signal)).toEqual({ columns: ["a"], rows: [["1"]], truncated: true, total: null });
    vi.stubGlobal("fetch", reply(200, { columns: ["a"], rows: [[1]], truncated: false }));
    await expect(fetchPreview(id(1), new AbortController().signal)).rejects.toMatchObject({ status: -1 });
  });
});
