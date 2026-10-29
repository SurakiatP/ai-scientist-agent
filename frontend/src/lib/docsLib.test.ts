// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgress, reduce } from "./progress";
import { cleanDocs, docsOf, usableDocRefs, usableEmptyFiles } from "./sources";

const asks: unknown[] = [];
vi.mock("./sse", () => ({ streamAsk: () => { asks.push(1); return (async function* () {})(); }, streamAnalyze: vi.fn() }));

const good = { id: "1", file_id: "a".repeat(32), file_name: "bio.pdf", page: 2, text: "t", quote: "q" };
const prog = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "planning" };

beforeEach(() => { localStorage.clear(); vi.resetModules(); asks.length = 0; });

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

describe("progress reading text", () => {
  it("clears at the first event after indexing", () => {
    const p = reduce(emptyProgress, { type: "docs_indexing", file_id: "a", file_name: "bio.pdf" });
    expect(reduce(p, { type: "docs_indexing", file_id: "b", file_name: "c.pdf" }).indexing).toBe("c.pdf");
    expect(reduce(p, { type: "waiting", position: 1 }).indexing).toBeUndefined();
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
  it("without the shared database it fails with a localized ApiError and leaves no turn", async () => {
    const chat = (await import("./chat")).useChatStore, run = await import("./run"), { strings } = await import("./strings");
    const sid = chat.getState().newSession();
    const err = await run.startDocs(sid, "q?", [{ id: good.file_id, name: "bio.pdf" }]).catch((e) => e);
    expect(run.startError(err)).toBe(strings.th.docsNeedsDb);
    expect(chat.getState().sessions[0].turns).toHaveLength(0);
    expect(run.canStart(sid)).toEqual({ ok: true });
    expect(asks).toEqual([]);
  });
  it("with no documents it fails with the attach-again message", async () => {
    const chat = (await import("./chat")).useChatStore, run = await import("./run"), { strings } = await import("./strings");
    const err = await run.startDocs(chat.getState().newSession(), "q", []).catch((e) => e);
    expect(run.startError(err)).toBe(strings.th.docsAttachAgain);
  });
});

describe("sync toTurn keeps the attached PDFs", () => {
  const row = (docs: unknown) => ({ id: "t1", question: "q", mode: "docs", status: "done", created_at: "2026-01-01T00:00:00Z", progress: { ...prog, _docs: docs }, answer: { content: "c", references: [] } }) as never;
  it("pops progress._docs into turn.docs (validated) and turnBody writes it back", async () => {
    const { toTurn, turnBody } = await import("./sync");
    const id = "a".repeat(32);
    const t = toTurn(row([{ id, name: "x.pdf" }, { id: "bad", name: "y.pdf" }, { id: "b".repeat(32), name: 3 }]))!;
    expect(t.docs).toEqual([{ id, name: "x.pdf" }]);
    expect(t.progress).not.toHaveProperty("_docs");
    expect(turnBody(t, 0).progress).toMatchObject({ _docs: [{ id, name: "x.pdf" }] });
    expect(toTurn(row("junk"))).not.toHaveProperty("docs");
    expect(toTurn(row(Array.from({ length: 6 }, () => ({ id, name: "n" }))))).not.toHaveProperty("docs");
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
