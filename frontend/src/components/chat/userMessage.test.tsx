// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Turn } from "@/lib/chat";
import { emptyProgress } from "@/lib/progress";
import { MAX_QUESTION, strings } from "@/lib/strings";
import { UserMessage } from "./UserMessage";

const run = vi.hoisted(() => ({ turnId: null as string | null, startRun: vi.fn(async () => {}), startAnalysis: vi.fn(async () => {}) }));
vi.mock("@/lib/run", () => ({
  useRunState: () => ({ sessionId: null, turnId: run.turnId }),
  startRun: run.startRun, startAnalysis: run.startAnalysis,
  canStart: () => (run.turnId ? { ok: false, reason: "busy" } : { ok: true }),
}));

const t = strings.th;
const mkTurn = (id: string, p: Partial<Turn> = {}): Turn => ({ id, question: "คำถามแรก", createdAt: 1, status: "done", progress: emptyProgress, mode: "quick", ...p });
const setup = (turns: Turn[]) => {
  const sid = useChatStore.getState().newSession();
  turns.forEach((x) => useChatStore.getState().addTurn(sid, x));
  render(<UserMessage sessionId={sid} turn={turns[0]} />);
  return sid;
};
const btn = (n: string) => screen.getByRole("button", { name: new RegExp(`^${n}`) });
const box = () => screen.getByRole("textbox", { name: t.editBox }) as HTMLTextAreaElement;
const edit = (v: string) => fireEvent.change(box(), { target: { value: v } });

beforeEach(() => { localStorage.clear(); useChatStore.getState().clearAll(); run.turnId = null; run.startRun.mockClear(); run.startAnalysis.mockClear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "clipboard"); });

describe("UserMessage actions", () => {
  it("is a labelled group of three named buttons", () => {
    setup([mkTurn("a")]);
    expect(screen.getByRole("group", { name: t.msgActions })).toBeTruthy();
    for (const n of [t.copyMsg, t.retryMsg, t.editMsg]) expect(btn(n).getAttribute("aria-label")).toContain("คำถามแรก");
  });
  it("copy: clipboard success and failure are announced", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("x"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    document.execCommand = vi.fn(() => false);
    setup([mkTurn("a")]);
    await act(async () => { fireEvent.click(btn(t.copyMsg)); });
    expect(writeText).toHaveBeenCalledWith("คำถามแรก");
    expect(screen.getAllByRole("status").some((e) => e.textContent === t.copied)).toBe(true);
    await act(async () => { fireEvent.click(btn(t.copyMsg)); });
    expect(screen.getAllByRole("status").some((e) => e.textContent === t.copyFailed)).toBe(true); // fallback also failed
  });
  it("copy falls back to execCommand without a clipboard API", async () => {
    document.execCommand = vi.fn(() => true);
    setup([mkTurn("a")]);
    await act(async () => { fireEvent.click(btn(t.copyMsg)); });
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getAllByRole("status").some((e) => e.textContent === t.copied)).toBe(true);
  });
  it("retry re-asks with the same mode; analysis turns keep their file", () => {
    setup([mkTurn("a")]);
    fireEvent.click(btn(t.retryMsg));
    expect(run.startRun).toHaveBeenCalledWith(expect.any(String), "คำถามแรก", { mode: "quick" });
    cleanup();
    setup([mkTurn("b", { kind: "analysis", analysis: { fileId: "f1", fileName: "d.csv", steps: [] } })]);
    fireEvent.click(btn(t.retryMsg));
    expect(run.startAnalysis).toHaveBeenCalledWith(expect.any(String), "คำถามแรก", "f1", "d.csv");
  });
  it("retry and edit are disabled while a run is active", () => {
    run.turnId = "x";
    setup([mkTurn("a")]);
    expect((btn(t.retryMsg) as HTMLButtonElement).disabled).toBe(true);
    expect((btn(t.editMsg) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("UserMessage edit", () => {
  it("send is disabled until the text really changes; over-limit blocks", () => {
    setup([mkTurn("a")]);
    fireEvent.click(btn(t.editMsg));
    const send = () => screen.getByRole("button", { name: t.sendAgain }) as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    edit("  คำถามแรก  "); expect(send().disabled).toBe(true);
    edit("   "); expect(send().disabled).toBe(true);
    edit("x".repeat(MAX_QUESTION + 1)); expect(send().disabled).toBe(true);
    edit("ใหม่"); expect(send().disabled).toBe(false);
  });
  it("Enter sends (no later turns: no confirm), IME Enter and Shift+Enter do not", () => {
    const sid = setup([mkTurn("a")]);
    fireEvent.click(btn(t.editMsg));
    edit("ใหม่");
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 });
    fireEvent.compositionStart(box());
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startRun).not.toHaveBeenCalled();
    fireEvent.compositionEnd(box());
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startRun).toHaveBeenCalledWith(sid, "ใหม่", { mode: "quick" });
    expect(useChatStore.getState().sessions[0].turns).toEqual([]); // old turn replaced by the new run's turn
  });
  it("with later turns it asks first, then truncates and sends; cancel keeps everything", () => {
    const sid = setup([mkTurn("a"), mkTurn("b"), mkTurn("c")]);
    fireEvent.click(btn(t.editMsg));
    edit("ใหม่");
    fireEvent.click(screen.getByRole("button", { name: t.sendAgain }));
    expect(screen.getByText(t.editTruncate.replace("{n}", "2"))).toBeTruthy();
    expect(run.startRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: t.cancel })[0]);
    expect(useChatStore.getState().sessions[0].turns).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: t.sendAgain }));
    fireEvent.click(screen.getByRole("button", { name: t.confirm }));
    expect(useChatStore.getState().sessions[0].turns).toEqual([]);
    expect(run.startRun).toHaveBeenCalledWith(sid, "ใหม่", { mode: "quick" });
  });
  it("Escape cancels and returns focus to the edit button", async () => {
    setup([mkTurn("a")]);
    fireEvent.click(btn(t.editMsg));
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(btn(t.editMsg));
  });
  it("analysis turn edit reuses the file", () => {
    setup([mkTurn("a", { kind: "analysis", analysis: { fileId: "f1", steps: [] } })]);
    fireEvent.click(btn(t.editMsg));
    edit("ใหม่");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startAnalysis).toHaveBeenCalledWith(expect.any(String), "ใหม่", "f1", undefined);
  });
});
