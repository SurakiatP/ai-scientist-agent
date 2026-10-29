// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import gsap from "gsap";
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
import { ResearchScan } from "./ResearchScan";
import { ProgressPanel } from "./ProgressPanel";
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
  it("lists the sources seen so far by name, and nothing before one is known", () => {
    const { rerender } = render(<ProgressCard turn={turn(busy)} />);
    expect(screen.queryByText(/Sources used/)).toBeNull();
    rerender(<ProgressCard turn={turn({ ...busy, seen: ["pubmed", "arxiv", "uniprot"] })} />);
    expect(screen.getByText("Sources used: PubMed · arXiv · UniProt")).toBeInTheDocument();
  });
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
  it("an unanswered search shows Not summarised once writing starts, never Searching", () => {
    const writing = prog({ ...busy, phase: "writing", answered: ["alpha"], writing: true });
    const { container } = render(<ProgressCard turn={turn(writing, { plan: writing.searches })} />);
    expect(container.querySelector('[data-state="skipped"]')).not.toBeNull();
    expect(screen.queryByText(t.rowSearching)).toBeNull();
    expect(screen.getByText(t.rowSkipped)).toBeInTheDocument();
  });
  it("states the plan change and marks the added searches in text, and a finished turn keeps it", () => {
    const rp = prog({ ...busy, searches: [...busy.searches, { term: "gamma", instructions: "" }], replans: [{ reasoning: "broaden", thin: ["beta"], searches: [{ term: "gamma", instructions: "" }] }] });
    const { rerender } = render(<ProgressCard turn={turn(rp)} />);
    expect(screen.getByText("Plan adjusted: few results for “beta”, searching 1 more term")).toBeInTheDocument();
    expect(screen.getAllByText(t.replanAdded)).toHaveLength(1);
    expect(screen.getByText("gamma")).toBeInTheDocument();
    rerender(<ProgressCard turn={turn({ ...rp, phase: "done" }, { status: "done" })} />);
    expect(screen.getByText(/Plan adjusted/)).toBeInTheDocument();
    expect(screen.queryByText(t.replanAdded)).toBeInTheDocument();
  });
  it("uses the plural line for several added searches, and the added rows start after round one even when the plan is shorter", () => {
    const rp = prog({ ...busy, searches: [...busy.searches, { term: "g1", instructions: "" }, { term: "g2", instructions: "" }],
      replans: [{ reasoning: "x", thin: ["alpha", "beta"], searches: [{ term: "g1", instructions: "" }, { term: "g2", instructions: "" }] }] });
    render(<ProgressCard turn={turn(rp, { plan: [busy.searches[0]] })} />);
    expect(screen.getByText("Plan adjusted: few results for “alpha”, “beta”, searching 2 more terms")).toBeInTheDocument();
    expect(screen.getAllByText(t.replanAdded)).toHaveLength(2);
    expect(screen.queryByText("beta", { selector: "p" })).toBeNull();
  });
  it("shows the queue position while waiting", () => {
    render(<ProgressCard turn={turn({ phase: "waiting", waiting: 3 })} />);
    expect(screen.getAllByText(t.queueRow.replace("{n}", "3")).length).toBeGreaterThan(0);
  });
});

describe("ProgressPanel", () => {
  const states = (c: HTMLElement) => [...c.querySelectorAll("[data-step]")].map((x) => x.getAttribute("data-state"));
  it("shows only counts the backend provides", () => {
    render(<ProgressPanel turn={turn(busy)} />);
    expect(screen.getByText(t.papersFound).nextSibling).toHaveTextContent("7");
    expect(screen.getByText(t.searchesPlanned).nextSibling).toHaveTextContent("2");
    expect(screen.getByText(t.searchesSummarised).nextSibling).toHaveTextContent("1");
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
    expect(screen.getByText(t.idCheckNote)).toBeInTheDocument();
  });
  it("shows zeros, not invented numbers, for an empty run", () => {
    render(<ProgressPanel turn={turn({})} />);
    for (const k of [t.papersFound, t.searchesPlanned, t.searchesSummarised]) expect(screen.getByText(k).nextSibling).toHaveTextContent("0");
  });
  it("maps each phase to step states", () => {
    const run = (ph: Progress["phase"], extra: Partial<Progress> = {}) => { const r = render(<ProgressPanel turn={turn({ phase: ph, ...extra })} />); const s = states(r.container); r.unmount(); return s; };
    expect(run("planning")).toEqual(["active", "pending", "pending", "pending"]);
    expect(run("searching")).toEqual(["done", "active", "pending", "pending"]);
    expect(run("writing")).toEqual(["done", "done", "active", "pending"]);
    expect(run("done")).toEqual(["done", "done", "done", "done"]);
    expect(run("waiting", { waiting: 3 })).toEqual(["pending", "pending", "pending", "pending"]);
  });
  it("shows queue position while waiting and 4 / 4 when done", () => {
    const r = render(<ProgressPanel turn={turn({ phase: "waiting", waiting: 3 })} />);
    expect(screen.getByText(t.queueRow.replace("{n}", "3"))).toBeInTheDocument();
    r.unmount();
    render(<ProgressPanel turn={turn({ ...busy, phase: "done" }, { status: "done" })} />);
    expect(screen.getByText("4 / 4")).toBeInTheDocument();
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

  it("shows quoted evidence with its verdict, and the no-abstract line otherwise", () => {
    const sid = useChatStore.getState().newSession();
    const r1 = { ...ref("1", { abstract: "abs" }), checks: [{ claim: "Drug X works", support: "unsupported" as const, quote: "it did not work" }, { claim: "Dose", support: "partial" as const, quote: null }] };
    const tn = turn({ phase: "done" }, { status: "done", answer: { content: "Claim [1] and [2].", references: [r1, ref("2")] } });
    useChatStore.getState().addTurn(sid, tn);
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "1" }));
    const { unmount } = render(<SourceInspector variant="panel" />);
    expect(screen.getByRole("heading", { name: t.evidenceTitle })).toBeInTheDocument();
    expect(screen.getByText("Drug X works")).toBeInTheDocument();
    expect(screen.getByText("it did not work").tagName).toBe("BLOCKQUOTE");
    expect(screen.getByText(t.supUnsupported)).toBeInTheDocument();
    expect(screen.getByText(t.supPartial)).toBeInTheDocument();
    unmount();
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "2" }));
    render(<SourceInspector variant="panel" />);
    expect(screen.getByText(t.evidenceNoAbstract)).toBeInTheDocument();
  });
  it("shows nothing extra for an uncited reference, or a cited one with an abstract but no checks", () => {
    const sid = useChatStore.getState().newSession();
    const chk = [{ claim: "", support: "no_quote" as const, quote: "odd quote" }];
    const tn = turn({ phase: "done" }, { status: "done", answer: { content: "Only [1] and [3].", references: [{ ...ref("1", { abstract: "abs" }), checks: chk }, { ...ref("2", { abstract: "abs" }), checks: chk }, ref("3", { abstract: "abs" })] } });
    useChatStore.getState().addTurn(sid, tn);
    const view = (refId: string) => { act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId })); return render(<SourceInspector variant="panel" />); };
    let v = view("1");
    expect(screen.getByText("odd quote")).toBeInTheDocument();
    v.unmount(); v = view("2");
    expect(screen.queryByRole("heading", { name: t.evidenceTitle })).toBeNull();
    v.unmount(); v = view("3");
    expect(screen.queryByRole("heading", { name: t.evidenceTitle })).toBeNull();
    expect(screen.queryByText(t.evidenceNoAbstract)).toBeNull();
  });
  it("marks only unsupported references in the list", () => {
    const a = { ...ref("1"), checks: [{ claim: "c", support: "unsupported" as const, quote: null }] };
    const b = { ...ref("2"), checks: [{ claim: "c", support: "supported" as const, quote: "q" }] };
    render(<ReferenceList t={t} references={[a, b, ref("3")]} />);
    expect(screen.getAllByText(t.notSupportedMark)).toHaveLength(1);
  });

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
    fireEvent.click(screen.getByRole("link", { name: "Reference 1: Paper 1" }));
    expect(useInspector.getState().ref).toEqual({ sessionId: sid, turnId: tn.id, refId: "1" });
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("Paper 1")).toBeInTheDocument();
    expect(within(dlg).getByText(t.verified)).toBeInTheDocument();
    expect(within(dlg).getByText(t.idCheckNote)).toBeInTheDocument();
    expect(within(dlg).getByText(/10\.1000\/abc/)).toBeInTheDocument();
    expect(within(dlg).getByText(/42/)).toBeInTheDocument();
    expect(within(dlg).getByText("example.org")).toBeInTheDocument();
    expect(dlg.querySelector("blockquote")).toBeNull(); // no checks, no quote
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

  it("unknown status wording and Esc closes, returning focus to the opener", async () => {
    const { sid, tn } = setup();
    render(<><button data-testid="o">o</button><SourceInspector variant="panel" /></>);
    const o = screen.getByTestId("o");
    o.focus();
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "3" }, o));
    expect(screen.getByText(t.chkUnknown)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useInspector.getState().ref).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(o));
  });

  it("Esc returns focus to the opener's twin when the opener node was replaced", async () => {
    const { sid, tn } = setup();
    const { rerender } = render(<><a href="#ref-1">1</a><SourceInspector variant="panel" /></>);
    const old = screen.getByText("1");
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "3" }, old));
    rerender(<><span /><a href="#ref-1" data-testid="new">1</a><SourceInspector variant="panel" /></>);
    old.remove();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("new")));
  });

  it("reference rows have an Open details action", () => {
    const { sid, tn } = setup();
    render(<ReferenceList t={t} references={refs} scope={{ sessionId: sid, turnId: tn.id }} />);
    fireEvent.click(screen.getAllByRole("button", { name: new RegExp(t.openDetails) })[1]);
    expect(useInspector.getState().ref?.refId).toBe("2");
  });
});

describe("inspector guards", () => {
  beforeEach(() => { localStorage.clear(); useChatStore.getState().clearAll(); });
  it("pill for an unknown ref id does not open the inspector", () => {
    render(<AnswerView content="x [1]" references={[{ id: "1" }]} scope={{ sessionId: "s", turnId: "A" }} />);
    const a = screen.getByRole("link", { name: "Reference 1" });
    a.setAttribute("href", "#ref-OTHER-1");
    fireEvent.click(a);
    expect(useInspector.getState().ref).toBeNull();
  });
  it("renders nothing and clears itself when the reference is gone", () => {
    act(() => useInspector.getState().open({ sessionId: "gone", turnId: "t", refId: "1" }));
    render(<SourceInspector variant="sheet" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    render(<SourceInspector variant="panel" />);
    expect(useInspector.getState().ref).toBeNull();
  });
  it("close and Open details targets are at least 44px", () => {
    const sid = useChatStore.getState().newSession();
    const tn = turn({ phase: "done" }, { status: "done", answer: { content: "x", references: [ref("1")] } });
    useChatStore.getState().addTurn(sid, tn);
    const { container } = render(<ReferenceList t={t} references={[ref("1")]} scope={{ sessionId: sid, turnId: tn.id }} />);
    expect(getComputedStyle(container.querySelector("button")!).minHeight).toBe("44px");
    act(() => useInspector.getState().open({ sessionId: sid, turnId: tn.id, refId: "1" }));
    render(<SourceInspector variant="panel" />);
    const c = screen.getByRole("button", { name: t.closeInspector });
    expect(getComputedStyle(c).minWidth).toBe("44px");
    expect(getComputedStyle(c).minHeight).toBe("44px");
  });
  it("row chips use the same check wording as the inspector", () => {
    render(<ReferenceList t={t} references={[ref("1", { doi: "10.1/x" }, "unverified"), ref("2", {}, "unverified")]} />);
    expect(screen.getByText(t.chkNotFound)).toBeInTheDocument();
    expect(screen.getByText(t.chkNoId)).toBeInTheDocument();
  });
});

describe("ResearchScan (pixel-art loop in the progress card)", () => {
  const scan = (c: HTMLElement) => c.querySelector("svg[viewBox='0 0 528 528']");
  const media = (reduce: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
  afterEach(() => vi.unstubAllGlobals());

  it("shows only while sources are being searched, and never as text or a progress value", () => {
    media(false);
    const { container, rerender } = render(<ProgressCard turn={turn(busy)} />);
    expect(scan(container)).not.toBeNull();
    expect(scan(container)!.closest("[aria-hidden='true']")).not.toBeNull(); // decorative
    for (const p of [{ phase: "waiting" as const, waiting: 2 }, { phase: "planning" as const }, { phase: "writing" as const }, { phase: "done" as const }]) {
      rerender(<ProgressCard turn={turn(p)} />);
      expect(scan(container)).toBeNull();
    }
    rerender(<ProgressCard turn={turn(busy, { status: "done" })} />);
    expect(scan(container)).toBeNull(); // not running: never shown
  });

  it("runs on one GSAP timeline and kills it on unmount", () => {
    media(false);
    const spy = vi.spyOn(gsap, "timeline");
    const { unmount } = render(<ResearchScan />);
    expect(spy).toHaveBeenCalledTimes(1);
    const kill = vi.spyOn(spy.mock.results[0].value as gsap.core.Timeline, "kill");
    unmount();
    expect(kill).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("draws a still (no timeline) under reduced motion", () => {
    media(true);
    const spy = vi.spyOn(gsap, "timeline");
    const { container } = render(<ResearchScan />);
    expect(spy).not.toHaveBeenCalled();
    expect(scan(container)!.querySelector("[data-r='lens']")!.getAttribute("transform")).toBe("translate(161 256)"); // the opening pose
    spy.mockRestore();
  });
});
