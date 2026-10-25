// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Turn } from "./chat";
import { safeStorage, storageFull, useHistoryStore, useStorageFull } from "./history";
import { emptyProgress } from "./progress";
import "./run"; // registers the storage listener

const Flag = () => <p>{useStorageFull() ? "FULL" : "ok"}</p>;
const ref = (n: number) => ({ id: "1", status: "verified" as const, paper: { title: "T".repeat(900), authors: Array.from({ length: 60 }, (_, i) => `Author ${i} ${"x".repeat(300)}`), year: 2024, doi: "1".repeat(3000), pmid: null, url: "u".repeat(3000) + n } });

beforeEach(() => { localStorage.clear(); useChatStore.getState().clearAll(); useChatStore.setState({ legacyImported: false }); useHistoryStore.setState({ items: [] }); vi.restoreAllMocks(); });

describe("reference clamp", () => {
  it("a 60-author consortium paper survives rehydrate", async () => {
    const sid = useChatStore.getState().newSession();
    const t: Turn = { id: "t1", question: "Q", createdAt: 1, status: "done", progress: emptyProgress, answer: { content: "a", references: [ref(1)] } };
    useChatStore.getState().addTurn(sid, t);
    const p = useChatStore.getState().sessions[0].turns[0].answer!.references[0].paper;
    expect(p.authors).toHaveLength(50);
    expect(p.authors[0].length).toBe(200);
    expect(p.title.length).toBe(500);
    await useChatStore.persist.rehydrate();
    expect(useChatStore.getState().sessions[0].turns).toHaveLength(1);
  });
});

describe("storage full", () => {
  it("flags a throwing setItem and clears on the next success", () => {
    render(<Flag />);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    act(() => safeStorage.setItem("k", "v"));
    expect(screen.getByText("FULL")).toBeInTheDocument();
    expect(storageFull()).toBe(true);
    spy.mockRestore();
    act(() => safeStorage.setItem("k", "v"));
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});

describe("legacy import", () => {
  it("removes the legacy key after import", () => {
    localStorage.setItem("scientist-history-v1", "{}");
    useChatStore.getState().importLegacyHistory();
    expect(localStorage.getItem("scientist-history-v1")).toBeNull();
    expect(useChatStore.getState().legacyImported).toBe(true);
  });
});
