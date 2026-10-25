// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAL, useChatStore } from "./chat";
import { gate } from "./config";
import { useFilesStore } from "./files";
import { emptyProgress } from "./progress";
import { __queue, __resetSync, startSync, TURN_GAP_MS, useSync } from "./sync";

const run = vi.hoisted(() => ({ turn: null as string | null }));
vi.mock("./run", () => ({ runningTurnId: () => run.turn, useRunState: () => ({ sessionId: null, turnId: null }), stopRun: vi.fn() }));

const U = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Call = { method: string; url: string; body?: Record<string, unknown> };
type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "net";

let calls: Call[], routes: ((c: Call) => Reply | undefined)[], snapshot: Record<string, unknown>;
const emptySnap = () => ({ projects: [], sessions: [], files: [], server_time: "2026-01-01T00:00:00Z" });
const row = (id: string, extra: object = {}) => ({ id, version: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...extra });

class FakeES {
  static all: FakeES[] = [];
  onmessage: ((m: { data: string }) => void) | null = null; onerror: (() => void) | null = null; onopen: (() => void) | null = null; readyState = 1;
  constructor(public url: string) { FakeES.all.push(this); }
  close() { this.readyState = 2; }
  emit(o: object) { this.onmessage?.({ data: JSON.stringify(o) }); }
}

beforeEach(() => {
  calls = []; routes = []; snapshot = emptySnap(); FakeES.all = [];
  vi.stubGlobal("EventSource", FakeES);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url: url.replace("http://localhost:8000", ""), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    let r: Reply | undefined;
    for (const f of routes) if ((r = f(c))) break;
    if (!r) r = c.url.startsWith("/v1/health") ? { body: { db: "ok" } } : c.url.startsWith("/v1/store/snapshot") ? { body: snapshot } : { body: row(c.url.split("/").pop()!.split("?")[0], { version: 2 }) };
    if (r === "net") throw new TypeError("network");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }));
  sessionStorage.clear(); localStorage.clear();
  useChatStore.getState().clearAll(); useFilesStore.setState({ files: [] });
  __resetSync(); gate.writes = true; run.turn = null;
});
afterEach(() => { __resetSync(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const online = async () => { await startSync(); await vi.waitFor(() => expect(useSync.getState().status).toBe("online")); };
const puts = (re: RegExp) => calls.filter((c) => c.method === "PUT" && re.test(c.url));
const done = () => vi.waitFor(() => expect(useSync.getState().pending).toBe(0));
const turn = (id: string, extra: object = {}) => ({ id, question: "q " + id, createdAt: 1, status: "done" as const, progress: { ...emptyProgress, phase: "done" as const }, ...extra });

describe("sync lifecycle", () => {
  it("stays disabled and silent when the database is off", async () => {
    routes.push((c) => (c.url.startsWith("/v1/health") ? { body: { db: "disabled" } } : undefined));
    await startSync();
    expect(useSync.getState()).toMatchObject({ status: "disabled", ready: true });
    useChatStore.getState().renameSession(useChatStore.getState().newSession(), "x");
    expect(calls.map((c) => c.url)).toEqual(["/v1/health"]);
    expect(FakeES.all).toHaveLength(0);
    expect(gate.writes).toBe(true); // browser-only: localStorage keeps working
  });

  it("goes online, replaces the cache with the snapshot and opens the event stream", async () => {
    localStorage.setItem("scientist-chat-v1", "keep me");
    snapshot = { ...emptySnap(), projects: [row(U(1), { name: "Lab" })], sessions: [row(U(2), { title: "From server", project_id: U(1), turns: [row(U(3), { idx: 0, question: "hi", status: "done", progress: null, answer: { content: "ok", references: [] } })] })], files: [row("a".repeat(32), { name: "d.csv", size: 5, kind: "csv", added_at: "2026-01-01T00:00:00Z" })] };
    await online();
    const s = useChatStore.getState();
    expect(s.projects.map((p) => p.name)).toEqual(["", "Lab"]);
    expect(s.sessions[0]).toMatchObject({ id: U(2), title: "From server", projectId: U(1) });
    expect(s.sessions[0].turns[0]).toMatchObject({ id: U(3), question: "hi", answer: { content: "ok" } });
    expect(useFilesStore.getState().files[0]).toMatchObject({ name: "d.csv", kind: "csv" });
    expect(FakeES.all[0].url).toContain("/v1/store/events");
    expect(gate.writes).toBe(false);
    expect(localStorage.getItem("scientist-chat-v1")).toBe("keep me"); // old browser data untouched until imported
    expect(calls.some((c) => c.method !== "GET")).toBe(false); // the replace is not echoed back as writes
  });
});

describe("mirror", () => {
  it("sends each mutation to the right route with the known version", async () => {
    await online();
    const st = useChatStore.getState();
    const blank = st.newSession();
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0); // a blank chat is not shared
    const pid = st.addProject("Lab");
    useChatStore.getState().addTurn(blank, turn(U(50)));
    await done();
    expect(puts(new RegExp(`/projects/${pid}$`))[0].body).toEqual({ name: "Lab" });
    expect(puts(new RegExp(`/sessions/${blank}$`))[0].body).toMatchObject({ project_id: null, title: `q ${U(50)}` });
    expect(puts(/\/turns\//)[0]).toMatchObject({ url: `/v1/store/sessions/${blank}/turns/${U(50)}`, body: { idx: 0, status: "done" } });
    useChatStore.getState().renameSession(blank, "Renamed");
    useChatStore.getState().moveSession(blank, pid);
    await done();
    const last = puts(new RegExp(`/sessions/${blank}$`)).at(-1)!;
    expect(last.body).toMatchObject({ title: "Renamed", project_id: pid, version: 2 }); // version the server returned for the previous write
    useChatStore.getState().renameProject(pid, "Lab 2");
    useChatStore.getState().deleteSession(blank);
    useChatStore.getState().deleteProject(pid);
    await done();
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([`/v1/store/sessions/${blank}`, `/v1/store/projects/${pid}`]);
  });

  it("an edit truncates from the removed position BEFORE writing the replacing turn, which reuses that position", async () => {
    await online();
    const id = useChatStore.getState().newSession();
    useChatStore.getState().addTurn(id, turn(U(60)));
    useChatStore.getState().addTurn(id, turn(U(61)));
    await done();
    calls.length = 0;
    useChatStore.getState().truncateFrom(id, U(61));
    useChatStore.getState().addTurn(id, turn(U(62)));
    await done();
    const seq = calls.filter((c) => /\/turns\//.test(c.url)).map((c) => `${c.method} ${c.url.replace(/^.*\/turns\//, "")}`);
    // one truncate call from position 1 first, then the new turn written at position 1
    expect(seq).toEqual(["DELETE from/1", `PUT ${U(62)}`]);
    expect(puts(/\/turns\//).map((c) => c.body!.idx)).toEqual([1]);
  });

  it("a turn that never reached the server is dropped locally without any delete call", async () => {
    await online();
    const id = useChatStore.getState().newSession();
    useChatStore.getState().addTurn(id, turn(U(63)));
    useChatStore.getState().truncateFrom(id, U(63));
    await done();
    expect(calls.some((c) => c.method === "DELETE" && /\/turns\//.test(c.url))).toBe(false);
  });

  it("mirrors files (rename, move, remove)", async () => {
    await online();
    const f = "b".repeat(32);
    useFilesStore.getState().add({ id: f, name: "a.csv", size: 3, kind: "csv", createdAt: 1, projectId: PERSONAL });
    await done();
    useFilesStore.getState().rename(f, "b.csv");
    useFilesStore.getState().remove(f);
    await done();
    expect(puts(/\/files\//)[0].body).toMatchObject({ name: "a.csv", project_id: null });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: `/v1/store/files/${f}` });
  });

  it("writes a running turn at most once per second and flushes its completion at once", async () => {
    await online();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const id = useChatStore.getState().newSession();
    useChatStore.getState().addTurn(id, turn(U(70), { status: "running" }));
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 6; i++) useChatStore.getState().patchTurn(id, U(70), { progress: { ...emptyProgress, reasoning: "r".repeat(i + 1) } });
    await vi.advanceTimersByTimeAsync(TURN_GAP_MS / 2);
    expect(puts(/\/turns\//)).toHaveLength(1); // still inside the gap
    await vi.advanceTimersByTimeAsync(TURN_GAP_MS);
    expect(puts(/\/turns\//)).toHaveLength(2);
    expect((puts(/\/turns\//)[1].body!.progress as { reasoning: string }).reasoning).toBe("rrrrrr"); // the six patches became one write of the latest state
    useChatStore.getState().patchTurn(id, U(70), { status: "done", answer: { content: "A", references: [] } });
    await vi.advanceTimersByTimeAsync(10);
    expect(puts(/\/turns\//)).toHaveLength(3);
    expect(puts(/\/turns\//)[2].body).toMatchObject({ status: "done" });
  });
});

describe("failure handling", () => {
  it("adopts the server copy on 409 and tells the user calmly", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "Mine", turns: [] })] };
    await online();
    routes.push((c) => (c.method === "PUT" ? { status: 409, body: { detail: "version conflict", current: row(U(2), { title: "Theirs", version: 7 }) } } : undefined));
    useChatStore.getState().renameSession(U(2), "Edited here");
    await vi.waitFor(() => expect(useSync.getState().notice).toBe("conflict"));
    expect(useChatStore.getState().sessions[0].title).toBe("Theirs");
    expect(useSync.getState().status).toBe("conflict");
    expect(__queue()).toHaveLength(0);
  });

  it("honours Retry-After on 429 and then resends", async () => {
    await online();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    let first = true;
    routes.push((c) => (c.method === "PUT" && first ? ((first = false), { status: 429, headers: { "Retry-After": "3" }, body: {} }) : undefined));
    const id = useChatStore.getState().newSession();
    useChatStore.getState().renameSession(id, "x");
    await vi.advanceTimersByTimeAsync(100);
    expect(puts(/sessions/)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(puts(/sessions/)).toHaveLength(1); // still waiting
    await vi.advanceTimersByTimeAsync(12000);
    expect(puts(/sessions/).length).toBeGreaterThanOrEqual(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(__queue()).toHaveLength(0);
  });

  it("goes offline on network failure, keeps the edit queued (and persisted), and replays it when back", async () => {
    await online();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    let down = true;
    routes.push((c) => (down && c.method !== "GET" ? "net" : undefined));
    const id = useChatStore.getState().newSession();
    useChatStore.getState().renameSession(id, "while offline");
    await vi.advanceTimersByTimeAsync(50);
    expect(useSync.getState()).toMatchObject({ status: "offline", pending: 1 });
    expect(JSON.parse(sessionStorage.getItem("scientist-queue-v1")!)).toEqual([{ k: "session", id, a: "put" }]);
    expect(useChatStore.getState().sessions[0].title).toBe("while offline"); // the cache keeps working
    down = false;
    await vi.advanceTimersByTimeAsync(3000);
    expect(useSync.getState().status).toBe("online");
    expect(__queue()).toHaveLength(0);
    expect(puts(new RegExp(`/sessions/${id}$`)).at(-1)!.body).toMatchObject({ title: "while offline" });
  });

  it("drops invalid ids from a persisted queue", async () => {
    sessionStorage.setItem("scientist-queue-v1", JSON.stringify([{ k: "session", id: "../../x", a: "put" }, { k: "project", id: U(9), a: "del" }]));
    await online();
    expect(calls.map((c) => c.url).some((u) => u.includes(".."))).toBe(false);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith(U(9)))).toBe(true);
  });
});

describe("realtime", () => {
  it("refetches on a changed event and merges, but ignores its own echo", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "Old", turns: [] })] };
    await online();
    const n = () => calls.filter((c) => c.url.startsWith("/v1/store/snapshot")).length;
    const before = n();
    FakeES.all[0].emit({ type: "changed", entity: "session", id: U(2), version: 1 }); // already known
    await new Promise((r) => setTimeout(r, 500));
    expect(n()).toBe(before);
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "Changed elsewhere", version: 2, turns: [] }), row(U(4), { title: "New elsewhere", turns: [] })] };
    FakeES.all[0].emit({ type: "changed", entity: "session", id: U(2), version: 2 });
    await vi.waitFor(() => expect(useChatStore.getState().sessions.map((s) => s.title).sort()).toEqual(["Changed elsewhere", "New elsewhere"]), { timeout: 4000 });
  });

  it("never overwrites a turn that is running in this tab", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", turns: [row(U(3), { idx: 0, question: "q", status: "running", progress: null, updated_at: new Date().toISOString() })] })] };
    await online();
    run.turn = U(3);
    useChatStore.getState().patchTurn(U(2), U(3), { progress: { ...emptyProgress, reasoning: "local live text" } });
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", version: 2, turns: [row(U(3), { idx: 0, question: "q", status: "stopped", version: 5, progress: null, updated_at: new Date().toISOString() })] })] };
    FakeES.all[0].emit({ type: "changed", entity: "turn", id: U(3), version: 5 });
    await vi.waitFor(() => expect(calls.filter((c) => c.url.startsWith("/v1/store/snapshot")).length).toBeGreaterThan(1), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 100));
    const t = useChatStore.getState().sessions[0].turns[0];
    expect(t.status).toBe("running");
    expect(t.progress.reasoning).toBe("local live text");
  });

  it("shows the remote-update notice when the open chat changed elsewhere", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", turns: [] })] };
    await online();
    useChatStore.getState().setActive(U(2));
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S renamed", version: 2, turns: [] })] };
    FakeES.all[0].emit({ type: "changed", entity: "session", id: U(2), version: 2 });
    await vi.waitFor(() => expect(useSync.getState().notice).toBe("remote"), { timeout: 4000 });
  });

  it("shows a running turn whose tab died as interrupted", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", turns: [row(U(3), { idx: 0, question: "q", status: "running", progress: null })] })] };
    await online();
    expect(useChatStore.getState().sessions[0].turns[0].status).toBe("interrupted");
  });

  it("hides turns that were truncated here even if the server still has them", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", turns: [row(U(3), { idx: 0, question: "a", status: "done", progress: null }), row(U(4), { idx: 1, question: "b", status: "done", progress: null })] })] };
    await online();
    useChatStore.getState().truncateFrom(U(2), U(4));
    await done();
    FakeES.all[0].emit({ type: "changed", entity: "session", id: U(2), version: 9 });
    await vi.waitFor(() => expect(calls.filter((c) => c.url.startsWith("/v1/store/snapshot")).length).toBeGreaterThan(1), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 100));
    expect(useChatStore.getState().sessions[0].turns.map((t) => t.id)).toEqual([U(3)]);
  });
});

describe("final review fixes", () => {
  it("debounces snapshot refetch for 2 s", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "Old", turns: [] })] };
    await online();
    const n = () => calls.filter((c) => c.url.startsWith("/v1/store/snapshot")).length;
    const before = n();
    FakeES.all[0].emit({ type: "changed", entity: "session", id: U(2), version: 7 });
    await new Promise((r) => setTimeout(r, 1000));
    expect(n()).toBe(before);
    await vi.waitFor(() => expect(n()).toBe(before + 1), { timeout: 3000 });
  });

  it("an SSE refusal (closed stream) is not an outage", async () => {
    await online();
    const es = FakeES.all[0];
    es.readyState = 2; es.onerror?.();
    expect(useSync.getState().status).toBe("online");
  });

  it("a 410 on a turn write drops it from the cache and the queue", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", turns: [row(U(3), { idx: 0, question: "a", status: "done", progress: null })] })] };
    await online();
    routes.push((c) => (c.method === "PUT" && c.url.endsWith(U(3)) ? { status: 410, body: { detail: "gone" } } : undefined));
    useChatStore.getState().patchTurn(U(2), U(3), { question: "edited elsewhere" });
    await done();
    expect(useChatStore.getState().sessions[0].turns).toEqual([]);
    expect(useSync.getState().status).toBe("online");
  });

  it("keeps older local turns when the server returns only the newest (has_more_turns)", async () => {
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", turns: [row(U(3), { idx: 0, question: "a", status: "done", progress: null }), row(U(4), { idx: 1, question: "b", status: "done", progress: null })] })] };
    await online();
    snapshot = { ...emptySnap(), sessions: [row(U(2), { title: "S", version: 2, has_more_turns: true, turn_count: 2, turns: [row(U(4), { idx: 1, question: "b", status: "done", progress: null, version: 2 })] })] };
    FakeES.all[0].emit({ type: "changed", entity: "session", id: U(2), version: 2 });
    await vi.waitFor(() => expect(calls.filter((c) => c.url.startsWith("/v1/store/snapshot")).length).toBeGreaterThan(1), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 100));
    expect(useChatStore.getState().sessions[0].turns.map((t) => t.id)).toEqual([U(3), U(4)]);
  });
});
