// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Turn } from "@/lib/chat";
import { useAttach, useFilesStore } from "@/lib/files";
import { useInspector } from "@/lib/inspector";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress } from "@/lib/progress";
import { strings } from "@/lib/strings";
import { SourceInspector } from "@/components/research/SourceInspector";
import { AgentMessage } from "./AgentMessage";
import { Composer, useDraft, useMode, usePack } from "./Composer";

const run = vi.hoisted(() => ({ startRun: vi.fn(async () => {}), startAnalysis: vi.fn(async () => {}), startDocs: vi.fn(async () => {}) }));
vi.mock("@/lib/run", () => ({
  useTurnLocked: () => false, stopAllRuns: vi.fn(), useSending: () => false, useStoppable: () => false, stopTurn: vi.fn(async () => true), useForeign: () => false,
  useRunState: (sid: string) => ({ sessionId: sid, turnId: null }), startRun: run.startRun, startAnalysis: run.startAnalysis, startDocs: run.startDocs,
  approvePlan: vi.fn(), cancelPlan: vi.fn(), stopRun: vi.fn(async () => true), startError: () => null, canStart: () => ({ ok: true }),
}));
const upload = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/sse", async (orig) => ({ ...(await orig<typeof import("@/lib/sse")>()), uploadFile: upload.fn }));

const t = strings.th;
const ref = { id: "1", file_id: "a".repeat(32), file_name: "bio.pdf", page: 3, text: "Mitochondria produce ATP.", quote: "produce ATP" };
const turn = (status: Turn["status"], p: Partial<Turn> = {}): Turn => ({ id: "t1", question: "Q", createdAt: Date.now(), status, progress: emptyProgress, mode: "docs", ...p });
const mk = (turns: Turn[] = []) => { const id = useChatStore.getState().newSession(); turns.forEach((x) => useChatStore.getState().addTurn(id, x)); return id; };
const pdf = (name: string) => new File(["%PDF"], name, { type: "application/pdf" });
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (...files: File[]) => fireEvent.change(input(), { target: { files } });

beforeEach(() => {
  localStorage.clear(); useChatStore.getState().clearAll(); usePrefs.setState({ lang: "th" });
  Object.values(run).forEach((f) => { f.mockReset(); f.mockImplementation(async () => {}); });
  upload.fn.mockReset();
  upload.fn.mockImplementation(async (f: File) => ({ id: f.name.charCodeAt(0).toString(16).padStart(32, "0"), name: f.name, size: 10, kind: "pdf" }));
  useDraft.setState({ drafts: {} }); useMode.setState({ mode: "deep" }); usePack.setState({ by: {} }); useInspector.setState({ ref: null });
});
afterEach(cleanup);

describe("Composer with PDFs", () => {
  it("accepts PDFs and several files", () => {
    render(<Composer sessionId={mk()} />);
    expect(input().accept).toContain(".pdf");
    expect(input().multiple).toBe(true);
  });

  it("PDF chips replace the mode chip with a fixed label, turn the field chip off with a reason, and send startDocs", async () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    pick(pdf("a.pdf"), pdf("b.pdf"));
    expect(await screen.findByText("a.pdf")).toBeInTheDocument();
    expect(await screen.findByText("b.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(t.modeLabel) })).toBeNull();
    expect(screen.getByText(t.modeDocs)).toBeInTheDocument();
    const field = screen.getByRole("button", { name: new RegExp(t.packLabel) });
    expect(field).toHaveAttribute("aria-disabled", "true");
    expect(field).toHaveAccessibleDescription(t.packOffDocs);
    expect(screen.getByText(t.docsModeNote)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "what?" } });
    await waitFor(() => expect(screen.getByRole("button", { name: t.ask })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: t.ask }));
    expect(run.startDocs).toHaveBeenCalledWith(id, "what?", [{ id: expect.any(String), name: "a.pdf" }, { id: expect.any(String), name: "b.pdf" }]);
    expect(run.startRun).not.toHaveBeenCalled();
    expect(run.startAnalysis).not.toHaveBeenCalled();
  });

  it("at most 5 PDFs, and a PDF can be removed", async () => {
    render(<Composer sessionId={mk()} />);
    pick(...["a", "b", "c", "d", "e", "f"].map((n) => pdf(`${n}.pdf`)));
    await screen.findByText("e.pdf");
    expect(screen.queryByText("f.pdf")).toBeNull();
    expect(screen.getByText(t.docsMax)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${t.removeFile}: a.pdf` }));
    expect(screen.queryByText("a.pdf")).toBeNull();
  });

  it("a PDF mixed with a data file in one pick is refused", async () => {
    render(<Composer sessionId={mk()} />);
    pick(pdf("a.pdf"), new File(["x"], "d.csv"));
    expect(await screen.findByText(t.attachOneKind)).toBeInTheDocument();
    expect(upload.fn).not.toHaveBeenCalled();
  });

  it("Ask about this document from My files attaches the PDF as a docs question", async () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    act(() => useAttach.setState({ file: { id: "f".repeat(32), name: "paper.pdf", size: 10 } }));
    expect(await screen.findByText("paper.pdf")).toBeInTheDocument();
    expect(screen.getByText(t.modeDocs)).toBeInTheDocument();
    expect(upload.fn).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: t.ask }));
    expect(run.startDocs).toHaveBeenCalledWith(id, "go", [{ id: "f".repeat(32), name: "paper.pdf" }]);
  });

  it("remove 4 of 5 picked PDFs before they upload: only the kept one is uploaded", async () => {
    render(<Composer sessionId={mk()} />);
    pick(...["a", "b", "c", "d", "e"].map((n) => pdf(`${n}.pdf`)));
    for (const n of ["b", "c", "d", "e"]) fireEvent.click(screen.getByRole("button", { name: `${t.removeFile}: ${n}.pdf` }));
    await screen.findByText("10 B");
    expect(upload.fn).toHaveBeenCalledTimes(1);
  });

  it("a sixth PDF from My files is refused with the limit note, the first five stay", async () => {
    render(<Composer sessionId={mk()} />);
    pick(...["a", "b", "c", "d", "e"].map((n) => pdf(`${n}.pdf`)));
    await screen.findByText("e.pdf");
    act(() => useAttach.setState({ file: { id: "f".repeat(32), name: "six.pdf", size: 1 } }));
    expect(await screen.findByText(t.docsMax)).toBeInTheDocument();
    expect(screen.queryByText("six.pdf")).toBeNull();
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
  });

  it("the field chip's last pack ignores docs turns", () => {
    const id = mk([turn("done", { mode: "deep", pack: "med", answer: { content: "a", references: [] } }), turn("done", { id: "t2", mode: "docs", answer: { content: "b", references: [] } })]);
    render(<Composer sessionId={id} />);
    expect(screen.getByRole("button", { name: new RegExp(`${t.packLabel}: `) }).getAttribute("aria-label")).not.toContain(t.packGeneral);
  });

  it("a data file still analyses", async () => {
    const id = mk();
    render(<Composer sessionId={id} />);
    act(() => useAttach.setState({ file: { id: "f".repeat(32), name: "d.csv", size: 10 } }));
    await screen.findByText("d.csv");
    expect(screen.queryByText(t.modeDocs)).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: t.ask }));
    expect(run.startAnalysis).toHaveBeenCalled();
  });
});

describe("docs answer", () => {
  it("reading the documents shows while indexing, live only", () => {
    const { rerender } = render(<AgentMessage sessionId="s" turn={turn("running", { progress: { ...emptyProgress, phase: "searching", indexing: "bio.pdf" } })} />);
    expect(screen.getByText(t.docsReading)).toBeInTheDocument();
    rerender(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "ATP is made [1].", references: [], doc_refs: [ref] } })} />);
    expect(screen.queryByText(t.docsReading)).toBeNull();
    expect(screen.getByText("ATP is made", { exact: false })).toBeInTheDocument();
  });

  it("shows the documents caption, [n] pills open the inspector with file, page, quote and passage; no report action", async () => {
    const sid = mk([turn("done", { answer: { content: "ATP is made [1].", references: [], doc_refs: [ref] } })]);
    const tu = useChatStore.getState().sessions.find((s) => s.id === sid)!.turns[0];
    render(<><AgentMessage sessionId={sid} turn={tu} /><SourceInspector variant="panel" /></>);
    expect(screen.getByText(t.docsCaption.replace("{names}", "bio.pdf"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.makeReport })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: new RegExp(t.citeRef) }));
    const panel = await screen.findByRole("heading", { name: new RegExp(t.docTitle) });
    expect(panel).toBeInTheDocument();
    expect(screen.getByText("bio.pdf", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(t.docPage.replace("{n}", "3"))).toBeInTheDocument();
    expect(screen.getByText("produce ATP").tagName).toBe("BLOCKQUOTE");
    expect(screen.getByText("Mitochondria produce ATP.")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: new RegExp(t.docTitle) }).parentElement!).getByRole("button", { name: t.closeInspector })).toBeInTheDocument();
  });

  it("an empty file gets a localized notice naming it", () => {
    render(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "x", references: [], empty_files: [{ file_id: "b".repeat(32), file_name: "scan.pdf" }] } })} />);
    expect(screen.getByText(t.docsEmptyFile.replace("{name}", "scan.pdf"))).toBeInTheDocument();
    cleanup();
    usePrefs.setState({ lang: "en" });
    render(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "x", references: [], empty_files: [{ file_id: "b".repeat(32), file_name: "scan.pdf" }] } })} />);
    expect(screen.getByText(strings.en.docsEmptyFile.replace("{name}", "scan.pdf"))).toBeInTheDocument();
  });

  it("an uncited PDF stays in the caption when the turn carries its docs", () => {
    render(<AgentMessage sessionId="s" turn={turn("done", { docs: [{ id: ref.file_id, name: "bio.pdf" }, { id: "c".repeat(32), name: "uncited.pdf" }], answer: { content: "x [1]", references: [], doc_refs: [ref] } })} />);
    expect(screen.getByText(t.docsCaption.replace("{names}", "bio.pdf, uncited.pdf"))).toBeInTheDocument();
  });

  it("retry with no recoverable PDFs is disabled and says why", () => {
    render(<AgentMessage sessionId="s" turn={turn("error", { error: "boom" })} />);
    expect(screen.getByRole("button", { name: t.retry })).toBeDisabled();
    expect(screen.getByText(t.docsAttachAgain)).toBeInTheDocument();
  });

  it.each([
    ["docs_unreadable", "docsUnreadable"], ["docs_unreadable_permanent", "docsUnreadablePermanent"], ["docs_host", "docsReadLater"], ["docs_load_failed", "docsLoadFailed"],
  ] as const)("error code %s is shown in the UI language, in th and en", (code, key) => {
    const msg = 'The file "scan.pdf" could not be read as a PDF (it may be encrypted or damaged).';
    render(<AgentMessage sessionId="s" turn={turn("error", { error: msg, errCode: code })} />);
    expect(screen.getByText(strings.th[key].replace("{name}", "scan.pdf"))).toBeInTheDocument();
    cleanup(); usePrefs.setState({ lang: "en" });
    render(<AgentMessage sessionId="s" turn={turn("error", { error: msg, errCode: code })} />);
    expect(screen.getByText(strings.en[key].replace("{name}", "scan.pdf"))).toBeInTheDocument();
  });
  it("docs_not_found has its own text; an unknown code falls back to the server message", () => {
    render(<AgentMessage sessionId="s" turn={turn("error", { error: "The document x was not found.", errCode: "docs_not_found" })} />);
    expect(screen.getByText(t.docsNotFound)).toBeInTheDocument();
    cleanup();
    render(<AgentMessage sessionId="s" turn={turn("error", { error: "Something odd happened", errCode: "docs_future" as never })} />);
    expect(screen.getByText("Something odd happened")).toBeInTheDocument();
  });

  it("the pill names the file and page; the empty-file notice is quiet text and says why", () => {
    render(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "ATP [1].", references: [], doc_refs: [ref], empty_files: [{ file_id: "b".repeat(32), file_name: "scan.pdf" }] } })} />);
    expect(screen.getByRole("link", { name: new RegExp(`bio.pdf.*${t.docPage.replace("{n}", "3")}`) })).toBeInTheDocument();
    expect(t.docsEmptyFile).toContain("สแกน");
  });

  it("in a docs answer only citations are links: markdown links and bare URLs render as text", () => {
    render(<AgentMessage sessionId="s" turn={turn("done", { answer: { content: "see [x](http://e.example) and http://evil.example ok [1]", references: [], doc_refs: [ref] } })} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toMatch(/^#ref-/);
    expect(screen.getByText("evil.example", { exact: false })).toBeInTheDocument();
  });

  it("Ask follow-up on a docs answer starts a docs question with the same PDFs", () => {
    const docs = [{ id: ref.file_id, name: "bio.pdf" }];
    render(<AgentMessage sessionId="s" turn={turn("done", { docs, answer: { content: "x", references: [], doc_refs: [ref] } })} />);
    useFilesStore.setState({ files: [{ id: ref.file_id, name: "bio.pdf", size: 4096, kind: "pdf", createdAt: 1, projectId: "personal" }] });
    fireEvent.click(screen.getByRole("button", { name: t.askFollowUp }));
    expect(useAttach.getState().file).toMatchObject({ id: ref.file_id, name: "bio.pdf", size: 4096 });
  });

  it("retry on a docs turn asks the same PDFs", () => {
    render(<AgentMessage sessionId="s" turn={turn("error", { error: "boom", docs: [{ id: "c".repeat(32), name: "x.pdf" }] })} />);
    fireEvent.click(screen.getByRole("button", { name: t.retry }));
    expect(run.startDocs).toHaveBeenCalledWith("s", "Q", [{ id: "c".repeat(32), name: "x.pdf" }]);
  });
});
