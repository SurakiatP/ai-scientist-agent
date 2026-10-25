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

describe("analysis turns", () => {
  const analysis = (over: Record<string, unknown> = {}) => ({
    fileId: "f".repeat(32), fileName: "data.csv", steps: ["profiling", "writing_script"],
    script: "finding('x')", quality: { rows: 2, columns: 1, columns_info: [{ name: "a", dtype: "int64", null_pct: 0 }] },
    tables: [{ name: "t", columns: ["a"], rows: [[1], [2]] }], findings: ["f"], timings: { total_s: 0.1 },
    artifacts: [{ id: "a1", name: "fig-1.png", kind: "figure", url: "/v1/artifacts/a1" }],
    ...over,
  });

  it("round-trips a valid analysis turn and keeps kind", async () => {
    const s = await load();
    const id = s.getState().newSession();
    s.getState().addTurn(id, { ...turn("a"), kind: "analysis", analysis: analysis() } as never);
    vi.resetModules();
    const s2 = await load();
    expect(s2.getState().sessions[0].turns[0]).toMatchObject({ kind: "analysis", analysis: { fileId: "f".repeat(32), steps: ["profiling", "writing_script"] } });
  });

  it("clamps script, rows, findings, artifacts and steps on write", async () => {
    const s = await load();
    const id = s.getState().newSession();
    s.getState().addTurn(id, { ...turn("a"), kind: "analysis", analysis: analysis({
      steps: ["profiling", "profiling", ...Array.from({ length: 30 }, () => "running")],
      script: "x".repeat(25_000),
      tables: [{ name: "t", columns: ["a"], rows: Array.from({ length: 300 }, (_, i) => [i]), truncated: true }],
      findings: Array.from({ length: 60 }, () => "f"),
      artifacts: Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, name: "x", kind: "figure", url: "/v1/artifacts/x" })),
      timings: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`t${i}`, 0.1])),
    }) } as never);
    vi.resetModules();
    const t = (await load()).getState().sessions[0].turns[0];
    expect(t.analysis!.steps).toHaveLength(2);
    expect(t.analysis!.script).toHaveLength(20_000);
    expect(t.analysis!.tables![0].rows).toHaveLength(200);
    expect(t.analysis!.findings).toHaveLength(50);
    expect(t.analysis!.artifacts).toHaveLength(20);
    expect(Object.keys(t.analysis!.timings!)).toHaveLength(50);
  });

  it("drops a turn whose persisted analysis is malformed, keeps its siblings", async () => {
    const sid = "s";
    const bad = [
      { ...turn("a"), kind: "analysis", analysis: analysis({ steps: ["nope"] }) },
      { ...turn("b"), kind: "analysis", analysis: analysis({ tables: [{ name: "t", columns: ["a"], rows: "no" }] }) },
      { ...turn("c"), kind: "nope", analysis: analysis() },
      { ...turn("d"), kind: "analysis", analysis: analysis({ timings: { x: "slow" } }) },
      { ...turn("e"), kind: "analysis", analysis: analysis({ fileId: "" }) },
    ];
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess(sid, [...bad, { ...turn("good"), kind: "analysis", analysis: analysis() }])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns.map((t) => t.id)).toEqual(["good"]);
  });

  it("rehydrates a running analysis as interrupted with its data", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [{ ...turn("t", "running"), kind: "analysis", analysis: analysis({ steps: ["running"] }) }])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns[0]).toMatchObject({ status: "interrupted", analysis: { steps: ["running"] } });
  });
});

describe("plan turns", () => {
  const plan = [{ term: "t1", instructions: "i1" }, { term: "t2", instructions: "" }];
  const awaiting = (over: Record<string, unknown> = {}, id = "p1") => ({ ...turn(id, "awaiting_plan"), plan, ...over });

  it("an awaiting_plan turn survives a reload with its plan", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [awaiting()])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns[0]).toMatchObject({ status: "awaiting_plan", plan });
  });

  it("a finished turn keeps its approved plan as the plan used", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [awaiting({ status: "done" }, "p2")])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns[0]).toMatchObject({ status: "done", plan });
  });

  it("drops turns whose stored plan is malformed, or an awaiting one without a plan", async () => {
    const bad = [
      awaiting({ plan: [] }, "a"),
      awaiting({ plan: [{ term: "", instructions: "" }] }, "b"),
      awaiting({ plan: [{ term: 1, instructions: "" }] }, "c"),
      awaiting({ plan: [{ term: "t", instructions: 9 }] }, "d"),
      awaiting({ plan: [...plan, plan[0], plan[0], plan[0], plan[0]] }, "e"), // six rows: one past the cap
      awaiting({ plan: undefined }, "f"),
      awaiting({ plan: "nope" }, "g"),
    ];
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [...bad, awaiting({}, "good")])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns.map((t) => t.id)).toEqual(["good"]);
  });

  it("a whole-session term over the limit still fails the turn (write clamps keep this unreachable)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [awaiting({ plan: [{ term: "x".repeat(201), instructions: "" }] }, "big")])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns).toEqual([]);
  });

  it("clamps oversized plan writes so they reload", async () => {
    const s = await load();
    const id = s.getState().newSession();
    const big = { term: "x".repeat(9999), instructions: "y".repeat(9999) };
    s.getState().addTurn(id, { ...turn("a", "awaiting_plan"), plan: Array.from({ length: 8 }, () => ({ ...big })) } as never);
    vi.resetModules();
    const t = (await load()).getState().sessions[0].turns[0];
    expect(t.status).toBe("awaiting_plan");
    expect(t.plan).toHaveLength(5);
    for (const row of t.plan!) {
      expect(row.term).toHaveLength(200);
      expect(row.instructions).toHaveLength(500);
    }
  });

  it("rehydrates a running plan turn as interrupted, the waiting one stays waiting", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { sessions: [sess("s", [turn("r", "running"), awaiting()])] } }));
    const s = await load();
    expect(s.getState().sessions[0].turns.map((t) => t.status)).toEqual(["interrupted", "awaiting_plan"]);
  });
});
