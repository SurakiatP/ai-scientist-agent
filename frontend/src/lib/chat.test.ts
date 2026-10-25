// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "scientist-chat-v1";
const load = async () => (await import("./chat")).useChatStore;
const prog = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };
const turn = (id: string, status = "done", q = "q") => ({ id, question: q, createdAt: 1, status, progress: prog });
const sess = (id: string, turns: unknown[] = [], over = {}) => ({ id, projectId: "personal", title: "t", createdAt: 1, updatedAt: 1, turns, ...over });

beforeEach(() => { localStorage.clear(); vi.resetModules(); });

describe("chat store", () => {
  it("creates, renames, moves, deletes sessions", async () => {
    const s = await load();
    const p = s.getState().addProject("Lab");
    const id = s.getState().newSession();
    expect(s.getState().activeId).toBe(id);
    s.getState().renameSession(id, "Hello");
    s.getState().moveSession(id, p);
    expect(s.getState().sessions[0]).toMatchObject({ title: "Hello", projectId: p });
    s.getState().deleteSession(id);
    expect(s.getState().sessions).toEqual([]);
    expect(s.getState().activeId).toBeNull();
  });
  it("deleting a project moves its sessions to personal", async () => {
    const s = await load();
    const p = s.getState().addProject("Lab");
    const id = s.getState().newSession(p);
    s.getState().deleteProject(p);
    expect(s.getState().projects.map((x) => x.id)).toEqual(["personal"]);
    expect(s.getState().sessions.find((x) => x.id === id)?.projectId).toBe("personal");
    expect(s.getState().activeProjectId).toBe("personal");
  });
  it("derives the title from the first question, capped at 60", async () => {
    const s = await load();
    const id = s.getState().newSession();
    s.getState().addTurn(id, turn("a", "running", "  " + "x".repeat(100)) as never);
    s.getState().addTurn(id, turn("b", "running", "second") as never);
    expect(s.getState().sessions[0].title).toBe("x".repeat(60));
  });
  it("caps turns per session at 50", async () => {
    const s = await load();
    const id = s.getState().newSession();
    for (let i = 0; i < 55; i++) s.getState().addTurn(id, turn(String(i)) as never);
    expect(s.getState().sessions[0].turns).toHaveLength(50);
  });
  it("rehydrates running turns as interrupted", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [turn("t", "running")])], activeId: "s" } }));
    const s = await load();
    expect(s.getState().sessions[0].turns[0].status).toBe("interrupted");
    expect(s.getState().activeId).toBe("s");
  });
  it("ignores garbage and malformed entries", async () => {
    localStorage.setItem(KEY, "{not json");
    expect((await load()).getState().sessions).toEqual([]);
    vi.resetModules();
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: {
      sessions: [sess("ok"), sess("bad", [{ id: 1 }]), sess("big", [], { title: "x".repeat(500) }), 7, null,
        sess("g1", [turn("a", "done")], {}), ],
      projects: [{ id: "p" }, "x"], activeId: "gone" } }));
    const s = await load();
    expect(s.getState().sessions.map((x) => x.id).sort()).toEqual(["g1", "ok"].concat(["bad"]).sort()); // "bad" keeps the session, drops its turn
    expect(s.getState().sessions.find((x) => x.id === "bad")!.turns).toEqual([]);
    expect(s.getState().projects.map((x) => x.id)).toEqual(["personal"]);
    expect(s.getState().activeId).toBeNull();
  });
  it("imports legacy history once", async () => {
    const ref = { id: "R1", status: "verified", paper: { title: "P", authors: [], year: null, doi: null, pmid: null, url: "u" } };
    localStorage.setItem("scientist-history-v1", JSON.stringify({ version: 1, state: { items: [{ id: "h", question: "old q", answer: "old a", references: [ref], createdAt: 5 }] } }));
    const s = await load();
    s.getState().importLegacyHistory();
    s.getState().importLegacyHistory();
    expect(s.getState().sessions).toHaveLength(1);
    const x = s.getState().sessions[0];
    expect(x).toMatchObject({ projectId: "personal", title: "old q" });
    expect(x.turns[0]).toMatchObject({ question: "old q", status: "done", answer: { content: "old a", references: [ref] } });
  });
  it("drops malformed progress elements", async () => {
    const bad = [{ searches: [null] }, { searches: [{ term: {} , instructions: "" }] }, { answered: [1] }, { sources: { a: "x" } }, { waiting: "1" }];
    const turns = bad.map((b, i) => ({ ...turn("b" + i), progress: { ...prog, ...b } }));
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [...turns, turn("good")])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns.map((t) => t.id)).toEqual(["good"]);
  });
  it("one oversized turn keeps the session's good turns", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [turn("a"), { ...turn("big"), error: "x".repeat(5000) }, turn("c")])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns.map((t) => t.id)).toEqual(["a", "c"]);
  });
  it("clamps oversized writes so they reload", async () => {
    const s = await load();
    const id = s.getState().newSession();
    s.getState().addTurn(id, turn("a", "running") as never);
    s.getState().patchTurn(id, "a", { status: "error", error: "e".repeat(9000), progress: { ...prog, reasoning: "r".repeat(30_000), searches: Array.from({ length: 80 }, () => ({ term: "t".repeat(5000), instructions: "" })) } } as never);
    vi.resetModules();
    const s2 = await load();
    expect(s2.getState().sessions[0].turns).toHaveLength(1);
    expect(s2.getState().sessions[0].turns[0].progress.searches).toHaveLength(50);
  });
  it("addProject at the cap returns empty id and adds nothing", async () => {
    const s = await load();
    for (let i = 0; i < 29; i++) expect(s.getState().addProject("p" + i)).not.toBe("");
    expect(s.getState().addProject("over")).toBe("");
    expect(s.getState().projects).toHaveLength(30);
  });
});
