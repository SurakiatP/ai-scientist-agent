// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, reduce } from "./progress";
import { cleanDocs, docsOf, usableDocRefs, usableEmptyFiles } from "./sources";
import type { AskEvent, AskOptions } from "./sse";

let script: (signal: AbortSignal) => AsyncGenerator<AskEvent>;
let asks: { question: string; opts: AskOptions | undefined }[] = [];
vi.mock("./sse", () => ({ streamAsk: (question: string, signal: AbortSignal, opts?: AskOptions) => { asks.push({ question, opts }); return script(signal); }, streamAnalyze: vi.fn() }));
const gen = (evs: AskEvent[]) => async function* () { for (const e of evs) yield e; };

const good = { id: "1", file_id: "a".repeat(32), file_name: "bio.pdf", page: 2, text: "t", quote: "q" };
const prog = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };

beforeEach(() => { localStorage.clear(); vi.resetModules(); asks = []; });

describe("doc citations are validated", () => {
  it("drops bad entries, keeps good ones, bounds the text", () => {
    const refs = usableDocRefs([good, { ...good, page: 0 }, { ...good, page: 1.5 }, { ...good, id: "" }, { ...good, file_name: 3 }, null, "x", { ...good, id: "2", text: "x".repeat(5000), quote: "y".repeat(5000) }]);
    expect(refs.map((r) => r.id)).toEqual(["1", "2"]);
    expect(refs[1].text).toHaveLength(1200);
    expect(refs[1].quote).toHaveLength(600);
    expect(usableDocRefs("nope")).toEqual([]);
    expect(usableEmptyFiles([{ file_id: "b", file_name: "s.pdf" }, { file_id: "b" }, 7])).toEqual([{ file_id: "b", file_name: "s.pdf" }]);
  });
  it("cleanDocs removes keys with nothing usable and keeps the rest of the answer", () => {
    expect(cleanDocs({ content: "c", doc_refs: [{ bad: 1 }], empty_files: "x" })).toEqual({ content: "c" });
    expect(cleanDocs({ content: "c", doc_refs: [good] })).toEqual({ content: "c", doc_refs: [good] });
  });
  it("docsOf prefers the stored list, else rebuilds from the answer", () => {
    expect(docsOf({ docs: [{ id: "x", name: "n.pdf" }] })).toEqual([{ id: "x", name: "n.pdf" }]);
    expect(docsOf({ answer: { doc_refs: [good, good], empty_files: [{ file_id: "b", file_name: "s.pdf" }] } })).toEqual([{ id: good.file_id, name: "bio.pdf" }, { id: "b", name: "s.pdf" }]);
  });
});

describe("progress", () => {
  it("docs_indexing shows the file, the answer clears it", () => {
    const p = reduce(emptyProgress, { type: "docs_indexing", file_id: "a", file_name: "bio.pdf" });
    expect(p.indexing).toBe("bio.pdf");
    expect(reduce(p, { type: "final_answer", content: "x", references: [] }).indexing).toBeUndefined();
  });
});

describe("chat store keeps doc citations", () => {
  it("clamps on write and drops bad entries on load, never the turn", async () => {
    const { useChatStore } = await import("./chat");
    const sid = useChatStore.getState().newSession();
    useChatStore.getState().addTurn(sid, { id: "t1", question: "q", createdAt: 1, status: "running", progress: emptyProgress, mode: "docs" });
    useChatStore.getState().patchTurn(sid, "t1", { status: "done", answer: { content: "a [1]", references: [], doc_refs: [good, { ...good, page: -1 }] as never, empty_files: [{ file_id: "b", file_name: "s.pdf" }] } });
    const a = useChatStore.getState().sessions[0].turns[0].answer!;
    expect(a.doc_refs).toEqual([good]);
    expect(a.empty_files).toEqual([{ file_id: "b", file_name: "s.pdf" }]);
    // stored copy with a bad entry: the turn survives
    localStorage.setItem("scientist-chat-v1", JSON.stringify({ state: { projects: [], activeId: null, legacyImported: true, sessions: [{ id: "s", projectId: "personal", title: "t", createdAt: 1, updatedAt: 1, turns: [
      { id: "t", question: "q", createdAt: 1, status: "done", progress: prog, mode: "docs", answer: { content: "c", references: [], doc_refs: [good, { id: 5 }], empty_files: [{}] } }] }] }, version: 1 }));
    vi.resetModules();
    const again = (await import("./chat")).useChatStore;
    await again.persist.rehydrate();
    const t = again.getState().sessions[0]?.turns[0];
    expect(t?.mode).toBe("docs");
    expect(t?.answer?.doc_refs).toEqual([good]);
    expect(t?.answer).not.toHaveProperty("empty_files");
  });
});

describe("startDocs", () => {
  it("direct run: sends mode docs with doc ids and keeps doc_refs from the final answer", async () => {
    const chat = (await import("./chat")).useChatStore, run = await import("./run");
    const sid = chat.getState().newSession();
    script = gen([
      { type: "docs_indexing", file_id: "a", file_name: "bio.pdf" },
      { type: "final_answer", content: "A [1]", references: [], doc_refs: [good, { bad: true } as never], empty_files: [{ file_id: "b", file_name: "s.pdf" }] },
      { type: "complete" },
    ]);
    await run.startDocs(sid, "q?", [{ id: good.file_id, name: "bio.pdf" }]);
    expect(asks.at(-1)).toEqual({ question: "q?", opts: { mode: "docs", history: [], docIds: [good.file_id] } });
    const t = chat.getState().sessions[0].turns[0];
    expect(t).toMatchObject({ mode: "docs", status: "done", docs: [{ id: good.file_id, name: "bio.pdf" }] });
    expect(t.answer?.doc_refs).toEqual([good]);
    expect(t.answer?.empty_files).toEqual([{ file_id: "b", file_name: "s.pdf" }]);
    expect(t.progress.indexing).toBeUndefined();
  });
  it("refuses to start without documents", async () => {
    const chat = (await import("./chat")).useChatStore, run = await import("./run");
    await expect(run.startDocs(chat.getState().newSession(), "q", [])).rejects.toThrow();
  });
});

describe("sync toTurn", () => {
  it("accepts mode docs and cleans doc_refs, keeping the turn", async () => {
    const { toTurn } = await import("./sync");
    const t = toTurn({ id: "t1", question: "q", mode: "docs", status: "done", created_at: "2026-01-01T00:00:00Z", progress: prog, answer: { content: "c", references: [], doc_refs: [good, { id: 1 }], empty_files: [{ x: 1 }] } } as never);
    expect(t).toMatchObject({ mode: "docs", answer: { doc_refs: [good] } });
    expect(t?.answer).not.toHaveProperty("empty_files");
  });
});
