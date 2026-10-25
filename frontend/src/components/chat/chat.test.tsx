// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadError } from "@/lib/sse";
import { useChatStore, type Turn } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress } from "@/lib/progress";
import { MAX_QUESTION, sampleQuestions, strings } from "@/lib/strings";
import { AgentMessage } from "./AgentMessage";
import { Composer, useDraft, useMode } from "./Composer";
import { EmptyChat } from "./EmptyChat";
import { Thread } from "./Thread";

const run = vi.hoisted(() => ({ sessionId: null as string | null, turnId: null as string | null, startRun: vi.fn(async () => {}), startAnalysis: vi.fn(async () => {}), approvePlan: vi.fn(async () => {}), cancelPlan: vi.fn(), stopRun: vi.fn() }));
vi.mock("@/lib/run", () => ({
  useRunState: () => ({ sessionId: run.sessionId, turnId: run.turnId }),
  startRun: run.startRun,
  startAnalysis: run.startAnalysis,
  approvePlan: run.approvePlan,
  cancelPlan: run.cancelPlan,
  stopRun: run.stopRun,
  canStart: () => (run.turnId ? { ok: false, reason: "busy" } : { ok: true }),
}));
const upload = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/sse", async (orig) => ({ ...(await orig<typeof import("@/lib/sse")>()), uploadFile: upload.fn }));

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
  run.startRun.mockReset(); run.startRun.mockImplementation(async () => {}); run.startAnalysis.mockReset(); run.startAnalysis.mockImplementation(async () => {});
  run.approvePlan.mockReset(); run.approvePlan.mockImplementation(async () => {}); run.cancelPlan.mockClear(); run.stopRun.mockClear();
  upload.fn.mockReset();
  useDraft.setState({ drafts: {} });
  useMode.setState({ mode: "deep" });
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
    expect(run.startRun).toHaveBeenCalledWith(id, "hello", { mode: "deep" });
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

  it("attach accepts the analysis formats", () => {
    render(<Composer sessionId={mk()} />);
    expect(screen.getByRole("button", { name: t.attach })).toBeEnabled();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute("accept", ".csv,.xlsx,.parquet,.json");
  });

  it("uploads one file, shows its name and size, then sends an analysis", async () => {
    upload.fn.mockResolvedValue({ id: "f1", name: "data.csv", size: 2048, kind: "csv" });
    const id = mk();
    render(<Composer sessionId={id} />);
    fireEvent.click(screen.getByRole("button", { name: t.attach }));
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["a,b"], "data.csv", { type: "text/csv" })] } });
    expect(await screen.findByText("data.csv")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${t.modeLabel}: ${t.modeDeep}` })).toBeDisabled();
    type("what changed?");
    expect(sendBtn()).toBeEnabled();
    fireEvent.click(sendBtn());
    expect(run.startAnalysis).toHaveBeenCalledWith(id, "what changed?", "f1", "data.csv");
    expect(run.startRun).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("data.csv")).toBeNull());
  });

  it("upload failure keeps an error chip and blocks Send until removed", async () => {
    upload.fn.mockRejectedValueOnce(new UploadError("http", "too large"));
    render(<Composer sessionId={mk()} />);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "big.csv")] } });
    expect(await screen.findByText(t.uploadFailed)).toBeInTheDocument();
    expect(screen.getByText("too large")).toBeInTheDocument();
    type("q");
    expect(sendBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: `${t.removeFile}: big.csv` }));
    expect(screen.queryByText("big.csv")).toBeNull();
    expect(sendBtn()).toBeEnabled();
  });

  it("removing an upload aborts it and disables Send while it is in flight", () => {
    let signal: AbortSignal | undefined;
    upload.fn.mockImplementation((_file: File, s: AbortSignal) => { signal = s; return new Promise(() => {}); });
    render(<Composer sessionId={mk()} />);
    type("q");
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "slow.csv")] } });
    expect(screen.getByText(t.uploadingFile)).toBeInTheDocument();
    expect(sendBtn()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: `${t.removeFile}: slow.csv` }));
    expect(signal!.aborted).toBe(true);
    expect(screen.queryByText(t.uploadingFile)).toBeNull();
    expect(sendBtn()).toBeEnabled();
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

  it("the second click of a double-click on Send never lands on Stop", () => {
    const id = mk();
    run.sessionId = id; run.turnId = "x";
    render(<Composer sessionId={id} />);
    fireEvent.click(screen.getByRole("button", { name: t.stop }), { detail: 2 });
    expect(run.stopRun).not.toHaveBeenCalled();
  });

  it("busy start keeps the text and shows the reason", () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    type("keep me");
    run.startRun.mockRejectedValueOnce(new Error("busy"));
    fireEvent.keyDown(box(), { key: "Enter" });
    return waitFor(() => {
      expect(box().value).toBe("keep me");
      expect(screen.getByText(t.busyElsewhere)).toBeInTheDocument();
    });
  });

  it("draft is per session", () => {
    const a = mk(), b = mk();
    const { unmount } = render(<Composer sessionId={a} />);
    type("only in a");
    unmount();
    render(<Composer sessionId={b} />);
    expect(box().value).toBe("");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startRun).not.toHaveBeenCalled();
  });

  it("mode selector defaults to deep, toggles, and sends the selected mode", () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    const trigger = () => screen.getByRole("button", { name: `${t.modeLabel}: ${t.modeDeep}` });
    expect(trigger()).toBeInTheDocument();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitemradio", { name: t.modeQuick }));
    expect(screen.getByRole("button", { name: `${t.modeLabel}: ${t.modeQuick}` })).toBeInTheDocument();
    type("q");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(run.startRun).toHaveBeenCalledWith(id, "q", { mode: "quick" });
  });
});

describe("EmptyChat", () => {
  it("shows starters that fill the composer without sending, and no sample rows", () => {
    mk([turn("done", { question: "OTHER-SESSION-Q", answer: { content: "OTHER-ANSWER", references: [] } })]);
    render(<EmptyChat sessionId={mk()} />);
    expect(screen.queryByText(/OTHER-/)).toBeNull();
    expect(screen.getByRole("heading", { name: t.emptyHeading })).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getAllByRole("button").filter((b) => sampleQuestions.includes(b.textContent as never))).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: sampleQuestions[1] }));
    expect(box().value).toBe(sampleQuestions[1]);
    expect(run.startRun).not.toHaveBeenCalled();
  });
});

describe("Thread", () => {
  it("running status is the live region; a finished answer is not", () => {
    const { container, rerender } = render(<AgentMessage sessionId="s" turn={turn("running")} />);
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    rerender(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "final answer", references: [] } })} />);
    expect(screen.getByText("final answer").closest("[aria-live]")).toBeNull();
  });

  it("retry is disabled with a reason while a run is active", () => {
    run.sessionId = "s"; run.turnId = "x";
    render(<AgentMessage sessionId="s" turn={turn("error", { error: "e" })} />);
    expect(screen.getByRole("button", { name: t.retry })).toBeDisabled();
    expect(screen.getByText(t.retryBusy)).toBeInTheDocument();
  });

  it("copy failure shows feedback", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("no")) }, configurable: true });
    render(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "x", references: [] } })} />);
    fireEvent.click(screen.getByRole("button", { name: t.copyAnswer }));
    expect(await screen.findByText(t.copyFailed)).toBeInTheDocument();
  });

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
    expect(run.startRun).toHaveBeenCalledWith(id, "why?", { mode: undefined });
  });

  it("Retry keeps the turn's mode (a Quick turn does not become Deep)", () => {
    const id = mk([turn("error", { question: "why?", error: "boom", mode: "quick" })]);
    render(<Thread sessionId={id} />);
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    expect(run.startRun).toHaveBeenCalledWith(id, "why?", { mode: "quick" });
  });

  it("the chosen mode is shared: a second composer starts in Quick", () => {
    const { unmount } = render(<Composer sessionId={mk()} />);
    fireEvent.click(screen.getByRole("button", { name: `${t.modeLabel}: ${t.modeDeep}` }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: t.modeQuick }));
    unmount();
    const id = mk();
    render(<Composer sessionId={id} />);
    type("q");
    fireEvent.click(sendBtn());
    expect(run.startRun).toHaveBeenCalledWith(id, "q", { mode: "quick" });
  });

  it("attach is disabled with a reason when the backend reports analysis disabled; fails open when unreachable", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue({ json: async () => ({ status: "ok", analysis: "disabled" }) } as Response);
    render(<Composer sessionId={mk()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: t.attach })).toBeDisabled());
    expect(screen.getByRole("button", { name: t.attach })).toHaveAttribute("title", t.attachUnavailable);
    cleanup();
    f.mockRejectedValue(new Error("down"));
    render(<Composer sessionId={mk()} />);
    await Promise.resolve();
    expect(screen.getByRole("button", { name: t.attach })).toBeEnabled();
    f.mockRestore();
  });

  it("running turn has a polite live status; done turn renders markdown safely", () => {
    const id = mk([turn("running"), turn("done", { answer: { content: "**bold** <script>x</script>", references: [] } })]);
    const { container } = render(<Thread sessionId={id} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("Plan review", () => {
  const planTurn = (p: Partial<Turn> = {}): Turn => ({
    id: "turn-1", question: "Q1", createdAt: Date.now(), status: "awaiting_plan",
    progress: emptyProgress, plan: [{ term: "first term", instructions: "" }, { term: "second term", instructions: "go" }],
    ...p,
  });
  const begin = () => {
    render(<AgentMessage sessionId="s" turn={planTurn()} />);
    fireEvent.click(screen.getByRole("button", { name: t.editPlan }));
  };

  it("an awaiting turn shows the editable plan card instead of the progress strip", () => {
    render(<AgentMessage sessionId="s" turn={planTurn()} />);
    expect(screen.getByText(t.planEditableTitle)).toBeInTheDocument();
    expect(screen.getByText(t.awaitPlanNote)).toBeInTheDocument();
    expect(screen.queryByText(t.searching)).toBeNull(); // the progress strip stands down: nothing has run yet
  });

  it("wires the plan card's start to approvePlan with the edited rows", () => {
    begin();
    fireEvent.change(screen.getAllByLabelText(new RegExp(`^${t.planTerm}`))[0], { target: { value: "edited term" } });
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(run.approvePlan).toHaveBeenCalledWith("s", "turn-1", [
      { term: "edited term", instructions: "" }, { term: "second term", instructions: "go" },
    ]);
    expect(run.cancelPlan).not.toHaveBeenCalled();
  });

  it("wires the plan card's cancel to cancelPlan", () => {
    begin();
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(run.cancelPlan).toHaveBeenCalledWith("s", "turn-1");
    expect(run.approvePlan).not.toHaveBeenCalled();
  });

  it("a failed approval is said out loud, not swallowed", async () => {
    run.approvePlan.mockRejectedValueOnce(new Error("busy"));
    begin();
    fireEvent.click(screen.getByRole("button", { name: t.planStart }));
    expect(await screen.findByText(t.startFailed)).toBeInTheDocument();
  });

  it("a running turn shows the approved plan read-only as the plan used", () => {
    render(<AgentMessage sessionId="s" turn={planTurn({ status: "running", progress: { ...emptyProgress, phase: "searching" } })} />);
    expect(screen.getByText(t.planUsedTitle)).toBeInTheDocument();
    expect(screen.getByText("first term")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.editPlan })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull(); // the review window is closed
    expect(screen.queryByText(t.researchPlan)).toBeNull(); // no duplicate proposed-plan listing
  });

  it("a running turn without a reviewed plan keeps the plain proposed listing", () => {
    render(<AgentMessage sessionId="s" turn={turn("running", { progress: { ...emptyProgress, searches: [{ term: "x", instructions: "" }], phase: "searching" } })} />);
    expect(screen.getByText(t.researchPlan)).toBeInTheDocument();
    expect(screen.queryByText(t.planUsedTitle)).toBeNull();
  });
});

describe("Analysis messages", () => {
  const analysis: NonNullable<Turn["analysis"]> = {
    fileId: "f".repeat(32), fileName: "data.csv", steps: ["profiling", "running"], script: "print(1)",
    quality: { rows: 4, columns: 1, truncated: false, columns_info: [{ name: "a", dtype: "int", null_pct: 0 }] },
    tables: [{ name: "result", columns: ["a"], rows: [[1]], truncated: false }],
    findings: ["a finding"], timings: { total_s: 2 }, artifacts: [{ id: "a1", name: "chart.png", kind: "figure", url: "/v1/artifacts/a1" }],
  };

  it("renders the analysis artifact instead of the research progress card", () => {
    render(<AgentMessage sessionId="s" turn={turn("running", { kind: "analysis", analysis })} />);
    expect(screen.getByText("data.csv")).toBeInTheDocument();
    expect(screen.getByText(t.analysisRunning)).toBeInTheDocument();
    expect(screen.getByText(t.analysisStepProfiling)).toBeInTheDocument();
    expect(screen.queryByText(t.elapsed)).toBeNull();
  });

  it("analysis Retry resumes the same file instead of a research run", () => {
    render(<AgentMessage sessionId="s" turn={turn("error", { question: "why?", error: "boom", kind: "analysis", analysis })} />);
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    expect(run.startAnalysis).toHaveBeenCalledWith("s", "why?", "f".repeat(32), "data.csv");
    expect(run.startRun).not.toHaveBeenCalled();
  });

  it("a finished analysis has no research follow-up or report actions", () => {
    render(<AgentMessage sessionId="s" turn={turn("done", { kind: "analysis", analysis })} />);
    expect(screen.getByText("data.csv")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.askFollowUp })).toBeNull();
    expect(screen.queryByText(t.references)).toBeNull();
  });
});

describe("English starters", () => {
  it("use the English set when lang=en", async () => {
    const { sampleQuestionsEn } = await import("@/lib/strings");
    usePrefs.setState({ lang: "en" });
    render(<EmptyChat sessionId={mk()} />);
    expect(screen.getByRole("button", { name: sampleQuestionsEn[0] })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: sampleQuestions[0] })).toBeNull();
  });
});
