// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Turn } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress } from "@/lib/progress";
import { MAX_QUESTION, sampleQuestions, strings } from "@/lib/strings";
import { Composer } from "./Composer";
import { EmptyChat } from "./EmptyChat";
import { Thread } from "./Thread";

const run = vi.hoisted(() => ({ sessionId: null as string | null, turnId: null as string | null, startRun: vi.fn(async () => {}), stopRun: vi.fn() }));
vi.mock("@/lib/run", () => ({
  useRunState: () => ({ sessionId: run.sessionId, turnId: run.turnId }),
  startRun: run.startRun,
  stopRun: run.stopRun,
  canStart: () => (run.turnId ? { ok: false, reason: "busy" } : { ok: true }),
}));

const t = strings.th;
const turn = (status: Turn["status"], p: Partial<Turn> = {}): Turn => ({ id: `t${Math.random()}`, question: "Q1", createdAt: Date.now(), status, progress: emptyProgress, ...p });
const mk = (turns: Turn[] = []) => {
  const id = useChatStore.getState().newSession();
  turns.forEach((x) => useChatStore.getState().addTurn(id, x));
  return id;
};
const box = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const type = (v: string) => fireEvent.change(box(), { target: { value: v } });
const sendBtn = () => screen.getByRole("button", { name: t.ask });

beforeEach(() => {
  localStorage.clear();
  useChatStore.getState().clearAll();
  usePrefs.setState({ lang: "th" });
  run.sessionId = run.turnId = null;
  run.startRun.mockClear(); run.stopRun.mockClear();
});
afterEach(cleanup);

describe("Composer", () => {
  it("Enter sends trimmed text and clears; Shift+Enter does not", () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    type("  hello  ");
    fireEvent.keyDown(box(), { key: "Enter", shiftKey: true });
    expect(run.startRun).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startRun).toHaveBeenCalledWith(id, "hello");
    expect(box().value).toBe("");
  });

  it("Enter while IME composing does not send", () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    type("สวัสดี");
    fireEvent.keyDown(box(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(box(), { key: "Enter", keyCode: 229 });
    expect(run.startRun).not.toHaveBeenCalled();
  });

  it("over the limit disables send and Enter", () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    type("x".repeat(MAX_QUESTION + 1));
    expect(sendBtn()).toBeDisabled();
    expect(screen.getByText(t.tooLong)).toBeInTheDocument();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startRun).not.toHaveBeenCalled();
  });

  it("disabled attach exposes its reason", () => {
    render(<Composer sessionId={mk()} />);
    expect(screen.getByRole("button", { name: new RegExp(t.attachReason) })).toBeDisabled();
  });

  it("busy elsewhere disables send with a reason; busy here shows Stop", () => {
    const id = mk();
    run.sessionId = "other"; run.turnId = "x";
    const { unmount } = render(<Composer sessionId={id} />);
    type("q");
    expect(sendBtn()).toBeDisabled();
    expect(screen.getByText(t.busyElsewhere)).toBeInTheDocument();
    unmount();
    run.sessionId = id;
    render(<Composer sessionId={id} />);
    fireEvent.click(screen.getByRole("button", { name: t.stop }));
    expect(run.stopRun).toHaveBeenCalled();
  });

  it("follow-up note only once the session has turns", () => {
    const { unmount } = render(<Composer sessionId={mk()} />);
    expect(screen.queryByText(t.followUpNote)).toBeNull();
    unmount();
    render(<Composer sessionId={mk([turn("done")])} />);
    expect(screen.getByText(t.followUpNote)).toBeInTheDocument();
  });
});

describe("EmptyChat", () => {
  it("shows starters that fill the composer without sending, and no sample rows", () => {
    render(<EmptyChat sessionId={mk()} />);
    expect(screen.getByRole("heading", { name: t.emptyHeading })).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: sampleQuestions[1] }));
    expect(box().value).toBe(sampleQuestions[1]);
    expect(run.startRun).not.toHaveBeenCalled();
  });
});

describe("Thread", () => {
  it("renders nothing for an empty session", () => {
    const { container } = render(<Thread sessionId={mk()} />);
    expect(container.querySelectorAll("article")).toHaveLength(0);
  });

  it("refused reason is plain text without role=alert", () => {
    render(<Thread sessionId={mk([turn("refused", { refused: "นอกขอบเขต" })])} />);
    expect(screen.getByText("นอกขอบเขต")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error turn Retry calls startRun with the same question", () => {
    const id = mk([turn("error", { question: "why?", error: "boom" })]);
    render(<Thread sessionId={id} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    expect(run.startRun).toHaveBeenCalledWith(id, "why?");
  });

  it("running turn has a polite live status; done turn renders markdown safely", () => {
    const id = mk([turn("running"), turn("done", { answer: { content: "**bold** <script>x</script>", references: [] } })]);
    const { container } = render(<Thread sessionId={id} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("script")).toBeNull();
  });
});
