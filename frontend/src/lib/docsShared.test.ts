// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AskEvent } from "./sse";

const UR = "dddddddd-0000-4000-8000-000000000002";
const F = "a".repeat(32);
const api = vi.hoisted(() => ({ script: null as null | (() => AsyncGenerator<unknown>), submit: vi.fn() }));
vi.mock("./runs", async (orig) => ({
  ...(await orig<typeof import("./runs")>()), submitRun: api.submit, cancelRun: vi.fn(async () => {}),
  getRun: async (id: string) => ({ id, status: "running", mine: true }),
  attachRun: () => (api.script ?? (async function* () {}))(),
}));
vi.mock("./sync", async (orig) => ({ ...(await orig<typeof import("./sync")>()), refreshNow: vi.fn(async () => true) }));

beforeEach(() => { api.submit.mockReset(); });

describe("docs run through the queue", () => {
  it("submits mode docs with doc_ids and keeps doc_refs, empty_files and the PDF names; indexing is live only", async () => {
    localStorage.clear(); sessionStorage.clear(); vi.resetModules();
    const sync = await import("./sync");
    sync.useSync.setState({ status: "online" });
    const chat = (await import("./chat")).useChatStore, run = await import("./run");
    const sid = chat.getState().newSession();
    sync.__versions().set(`session:${sid}`, 1);
    api.submit.mockImplementation(async (b: { turn_id: string }) => ({ run: { id: UR, mine: true }, turn: { id: b.turn_id, session_id: sid, idx: 0, question: "q", mode: "docs", status: "running", progress: null, created_at: "2026-01-01T00:00:00Z", updated_at: new Date().toISOString(), version: 1, run_id: UR } }));
    const ref = { id: "1", file_id: F, file_name: "bio.pdf", page: 2, text: "t", quote: null };
    const evs: (AskEvent & { _seq: number })[] = [
      { type: "docs_indexing", file_id: F, file_name: "bio.pdf", _seq: 0 },
      { type: "final_answer", content: "A [1]", references: [], doc_refs: [ref, { bad: 1 } as never], empty_files: [{ file_id: "b".repeat(32), file_name: "s.pdf" }], _seq: 1 },
      { type: "complete", _seq: 2 }];
    api.script = async function* () { for (const e of evs) yield e; };
    await run.startDocs(sid, "q?", [{ id: F, name: "bio.pdf" }, { id: "b".repeat(32), name: "s.pdf" }]);
    expect(api.submit.mock.calls[0][0]).toMatchObject({ kind: "ask", mode: "docs", doc_ids: [F, "b".repeat(32)] });
    const t = chat.getState().sessions[0].turns[0];
    expect(t).toMatchObject({ mode: "docs", status: "done", docs: [{ id: F, name: "bio.pdf" }, { id: "b".repeat(32), name: "s.pdf" }] });
    expect(t.answer?.doc_refs).toEqual([ref]);
    expect(t.answer?.empty_files).toEqual([{ file_id: "b".repeat(32), file_name: "s.pdf" }]);
    expect(t.progress.indexing).toBeUndefined();
  });
});
