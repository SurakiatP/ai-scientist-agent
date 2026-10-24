// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerView } from "@/components/AnswerView";
import { ReferenceList } from "@/components/ReferenceList";
import { useChatStore, type Turn } from "@/lib/chat";
import { useInspector } from "@/lib/inspector";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress, type Progress } from "@/lib/progress";
import type { Reference } from "@/lib/sse";
import { strings } from "@/lib/strings";
import { ProgressCard } from "./ProgressCard";
import { ProgressPanel } from "./ProgressPanel";
import { ReportActions } from "./ReportActions";
import { SourceInspector } from "./SourceInspector";

const t = strings.en;
const prog = (p: Partial<Progress>): Progress => ({ ...emptyProgress, ...p });
const turn = (p: Partial<Progress>, extra: Partial<Turn> = {}): Turn => ({ id: "t1", question: "Q", createdAt: Date.now(), status: "running", progress: prog(p), ...extra });
const ref = (id: string, p: Partial<Reference["paper"]> = {}, status: Reference["status"] = "verified"): Reference => ({
  id, status, paper: { title: `Paper ${id}`, authors: ["Ada", "Bo"], year: 2023, doi: null, pmid: null, url: "https://example.org/p", ...p },
});
const busy = prog({ phase: "searching", searches: [{ term: "alpha", instructions: "" }, { term: "beta", instructions: "" }], sources: { alpha: 3, beta: 4 }, answered: ["alpha"], reasoning: "plan text" });

beforeEach(() => {
  usePrefs.setState({ lang: "en" });
  useInspector.setState({ ref: null });
});
afterEach(cleanup);

describe("ProgressCard", () => {
  it("highlights the stage from the phase and shows real counts only", () => {
    const { container } = render(<ProgressCard turn={turn(busy)} />);
    const items = [...container.querySelectorAll("[data-stage]")];
    expect(items.map((x) => x.getAttribute("data-state"))).toEqual(["done", "active", "todo", "todo"]);
    expect(screen.getByText(`${t.researchPlan}`)).toBeInTheDocument();
    expect(screen.getByText(t.planNote)).toBeInTheDocument();
    expect(screen.getByText("plan text")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText(`${t.found} 3 ${t.papers}`)).toBeInTheDocument();
    expect(screen.getByText(`${t.found} 4 ${t.papers}`)).toBeInTheDocument();
    expect(screen.getAllByText(t.branchDone)).toHaveLength(1);
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
  });
  it("shows the queue position while waiting", () => {
    render(<ProgressCard turn={turn({ phase: "waiting", waiting: 3 })} />);
    expect(screen.getAllByText(`${t.waiting} 3`).length).toBeGreaterThan(0);
  });
});

describe("ProgressPanel", () => {
  it("compact counts equal the progress data", () => {
    render(<ProgressPanel turn={turn(busy)} />);
    expect(screen.getByText(t.stagesDone).nextSibling).toHaveTextContent("1/4");
    expect(screen.getByText(t.sourcesFound).nextSibling).toHaveTextContent("7");
    expect(screen.getByText(t.branchesDone).nextSibling).toHaveTextContent("1/2");
  });
  it("marks all four stages done when finished", () => {
    render(<ProgressPanel turn={turn({ ...busy, phase: "done" }, { status: "done" })} />);
    expect(screen.getByText(t.stagesDone).nextSibling).toHaveTextContent("4/4");
  });
});

describe("citations and inspector", () => {
  const refs = [ref("1", { doi: "10.1000/abc", pmid: "42" }), ref("2", { url: "javascript:alert(1)" }, "unverified"), ref("3", {}, "unknown")];
  const setup = () => {
    const sid = useChatStore.getState().newSession();
    const tn = turn({ phase: "done" }, { status: "done", answer: { content: "Claim [1] and [2].", references: refs } });
    useChatStore.getState().addTurn(sid, tn);
    return { sid, tn };
  };
  beforeEach(() => { localStorage.clear(); useChatStore.getState().clearAll(); });

  it("scopes reference anchors per turn", () => {
    const { container } = render(<>
      <AnswerView content="x [1]" references={[{ id: "1" }]} scope={{ sessionId: "s", turnId: "A" }} />
      <ReferenceList t={t} references={[ref("1")]} scope={{ sessionId: "s", turnId: "A" }} />
      <ReferenceList t={t} references={[ref("1")]} scope={{ sessionId: "s", turnId: "B" }} />
    </>);
    expect(container.querySelector("a[href='#ref-A-1']")).not.toBeNull();
    expect(container.querySelector("#ref-A-1")).not.toBeNull();
    expect(container.querySelector("#ref-B-1")).not.toBeNull();
  });

  it("clicking a citation pill opens the inspector for that reference", () => {
    const { sid, tn } = setup();
    render(<><AnswerView content={tn.answer!.content} references={refs} scope={{ sessionId: sid, turnId: tn.id }} /><SourceInspector variant="sheet" /></>);
    fireEvent.click(screen.getByRole("link", { name: "[1]" }));
    expect(useInspector.getState().ref).toEqual({ sessionId: sid, turnId: tn.id, refId: "1" });
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("Paper 1")).toBeInTheDocument();
    expect(within(dlg).getByText(t.verified)).toBeInTheDocument();
    expect(within(dlg).getByText(t.idCheckNote)).toBeInTheDocument();
    expect(within(dlg).getByText(/10\.1000\/abc/)).toBeInTheDocument();
    expect(within(dlg).getByText(/42/)).toBeInTheDocument();
    expect(within(dlg).getByText("example.org")).toBeInTheDocument();
    expect(within(dlg).queryByText(/quote|passage/i)).toBeNull();
    const open = within(dlg).getByRole("link", { name: t.openSource });
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("non-http url gives no open link and the right check wording", () => {
    const { sid, tn } = setup();
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "2" }));
    render(<SourceInspector variant="panel" />);
    expect(screen.queryByRole("link", { name: t.openSource })).toBeNull();
    expect(screen.getByText(t.chkNoId)).toBeInTheDocument();
  });

  it("unknown status wording and Esc closes, returning focus to the opener", () => {
    const { sid, tn } = setup();
    render(<><button data-testid="o">o</button><SourceInspector variant="panel" /></>);
    const o = screen.getByTestId("o");
    o.focus();
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "3" }, o));
    expect(screen.getByText(t.chkUnknown)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useInspector.getState().ref).toBeNull();
    expect(document.activeElement).toBe(o);
  });

  it("reference rows have an Open details action", () => {
    const { sid, tn } = setup();
    render(<ReferenceList t={t} references={refs} scope={{ sessionId: sid, turnId: tn.id }} />);
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(t.openDetails) })[1]);
    expect(useInspector.getState().ref?.refId).toBe("2");
  });
});

describe("ReportActions", () => {
  it("PDF and DOCX are disabled with a reason; copy and download are real", () => {
    localStorage.clear(); useChatStore.getState().clearAll();
    const sid = useChatStore.getState().newSession();
    const tn = turn({ phase: "done" }, { status: "done", answer: { content: "A", references: [] } });
    useChatStore.getState().addTurn(sid, tn);
    render(<ReportActions sessionId={sid} turn={tn} />);
    expect(screen.getByRole("button", { name: t.exportPdf })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.exportDocx })).toBeDisabled();
    expect(screen.getAllByText(new RegExp(t.exportUnsupported)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: t.copyAnswer })).toBeEnabled();
    expect(screen.getByRole("button", { name: t.downloadMd })).toBeEnabled();
  });
});

void vi;
