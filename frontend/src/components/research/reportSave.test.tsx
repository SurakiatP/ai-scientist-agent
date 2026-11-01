// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Turn } from "@/lib/chat";
import { docFromSections, libraryName, useExport } from "@/lib/exportReport";
import { useFilesStore } from "@/lib/files";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { ReportForm } from "./ReportForm";

const t = strings.en;
const ID = "a".repeat(32);
const turn = { id: "t1", question: "Q", createdAt: 1, status: "done", answer: { content: "# Study / plan?\n\nBody text.", references: [] } } as unknown as Turn;
const upJson = (name = "x.pdf") => new Response(JSON.stringify({ id: ID, name, size: 5, kind: name.split(".").pop() }), { status: 200 });
let fetchMock: ReturnType<typeof vi.fn>;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 300)); });
const flow = (up: () => Response | Promise<Response>, ex: () => Response | Promise<Response> = () => new Response(new Blob(["%PDF"], { type: "application/pdf" }), { status: 200 })) => {
  fetchMock.mockImplementation((u: string) => String(u).includes("/reports/export") ? Promise.resolve(ex()) : String(u).includes("/preview") ? new Promise(() => {}) : Promise.resolve(up()));
};

beforeEach(() => {
  usePrefs.setState({ lang: "en" });
  useFilesStore.setState({ files: [] });
  useExport.setState({ busy: null }); useExport.getState().reset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:x");
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("libraryName", () => {
  it("cleans, keeps Thai, caps length, dedupes", () => {
    expect(libraryName('a/b\\c:d*?"<>|e', "pdf", [])).toBe("a b c d e.pdf");
    expect(libraryName("รายงานวิจัย", "docx", [])).toBe("รายงานวิจัย.docx");
    expect(libraryName("x".repeat(300), "pdf", []).length).toBeLessThanOrEqual(120);
    expect(libraryName("  ...  ", "pdf", [])).toBe("report.pdf");
    expect(libraryName("T", "pdf", ["T.pdf", "t (2).pdf"])).toBe("T (3).pdf");
  });
});

describe("ReportForm save", () => {
  it("saves to the library without downloading, shows link, no double submit", async () => {
    flow(() => upJson("Study plan.pdf"));
    const onClose = vi.fn();
    render(<ReportForm turn={turn} onClose={onClose} />);
    const pdf = screen.getByRole("button", { name: t.fSavePdf });
    fireEvent.click(pdf); fireEvent.click(pdf);
    await waitFor(() => expect(screen.getAllByText(t.fSaved, { exact: false }).length).toBeGreaterThan(0));
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/reports/export"))).toHaveLength(1);
    expect(useFilesStore.getState().files).toMatchObject([{ id: ID, name: "Study plan.pdf", kind: "pdf" }]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.fOpenFiles }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(t.fSaveNote)).toBeInTheDocument();
  });
  it("disables both buttons while busy", async () => {
    flow(() => upJson(), () => new Response("x"));
    fetchMock.mockImplementationOnce(() => new Promise(() => {})); // preview or export, whichever comes first stays pending
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await act(async () => { void useExport.getState().save({ style: "standard", tex: null, font: "sarabun", title: "T", subtitle: "", refs: false, lang: "en", lead: "L", authors: "", keywords: "", abstract: "", statements: { ai: { on: false, text: null }, data: { on: false, text: null }, ethics: { on: false, text: null }, coi: { on: false, text: null } }, doc: docFromSections([{ heading: "h", text: "b" }]) }, "pdf", turn); });
    expect(screen.getByRole("button", { name: t.fSaveDocx })).toBeDisabled();
  });
  it.each([[422, "fErr422"], [503, "fErr503"]] as const)("export %i leaves the library untouched", async (status, key) => {
    flow(() => upJson(), () => new Response("{}", { status }));
    render(<ReportForm turn={turn} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: t.fSaveDocx }));
    await settle(); expect(screen.getByText(t[key])).toBeInTheDocument();
    expect(useFilesStore.getState().files).toEqual([]);
    expect(screen.getAllByDisplayValue("Study / plan?").length).toBeGreaterThan(0);
  });
  it.each([[413, "too large"], [415, "bad type"], [503, ""]])("upload %i keeps form and library", async (status, detail) => {
    flow(() => new Response(JSON.stringify({ detail }), { status }));
    render(<ReportForm turn={turn} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: t.fSavePdf }));
    await settle(); expect(screen.getByText(t.fSaveFail, { exact: false })).toBeInTheDocument();
    if (detail) expect(screen.getByText(new RegExp(detail))).toBeInTheDocument();
    expect(useFilesStore.getState().files).toEqual([]);
  });
  it("network failure on upload", async () => {
    flow(() => { throw new TypeError("net"); });
    render(<ReportForm turn={turn} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: t.fSavePdf }));
    await settle(); expect(screen.getByText(t.fSaveFail, { exact: false })).toBeInTheDocument();
    expect(useFilesStore.getState().files).toEqual([]);
  });
  it("disables saving while the title is empty and says why", async () => {
    flow(() => upJson());
    render(<ReportForm turn={turn} onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: t.fDocTitle }), { target: { value: " " } });
    expect(screen.getByRole("button", { name: t.fSavePdf })).toBeDisabled();
    expect(screen.getByRole("button", { name: t.fSaveDocx })).toBeDisabled();
    expect(screen.getByText(t.fNeedTitle)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: t.fDocTitle }), { target: { value: "T" } });
    expect(screen.getByRole("button", { name: t.fSavePdf })).toBeEnabled();
  });
  it("shows the answer on the page with a toolbar; preview requests start only after the toggle", async () => {
    flow(() => upJson());
    render(<ReportForm turn={turn} onClose={() => {}} />);
    expect(screen.getByRole("toolbar", { name: t.tbBar })).toBeInTheDocument();
    for (const k of ["tbBold", "tbItalic", "tbBullets", "tbNumbered", "tbTable", "tbUndo", "tbRedo"] as const) expect(screen.getByRole("button", { name: t[k] })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: t.fBody })).toHaveTextContent("Body text."));
    await settle();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/preview"))).toHaveLength(0);
    const toggle = screen.getByRole("button", { name: t.pvShow });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await settle();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/preview")).length).toBeGreaterThan(0);
  });
  it("asks before discarding edits, not when nothing changed", async () => {
    const onClose = vi.fn();
    render(<ReportForm turn={turn} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: t.fCancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    onClose.mockClear();
    render(<ReportForm turn={turn} onClose={onClose} />);
    fireEvent.change(screen.getByRole("textbox", { name: t.fSubtitle }), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: t.fCancel }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t.fKeepEditing }));
    fireEvent.click(await screen.findByRole("button", { name: t.fCancel }));
    fireEvent.click(await screen.findByRole("button", { name: t.fDiscard }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("has th/en parity for new keys", () => {
    for (const k of ["fSavePdf", "fSaveDocx", "fSaveNote", "fSaved", "fOpenFiles", "fSaveFail", "pvShow", "tbBar", "tbBold", "tbTable", "fBody", "fHeadingLong", "fSettings", "fDiscard"] as const) expect(strings.th[k]).toBeTruthy();
  });
});

describe("ReportForm font", () => {
  const exportBody = () => JSON.parse(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/reports/export"))![1].body));
  const open = (name: string) => { if (!screen.queryByRole("combobox", { name })) fireEvent.click(screen.getByRole("button", { name: t.fSettings })); fireEvent.mouseDown(screen.getByRole("combobox", { name })); return screen.getAllByRole("option"); };
  it("offers 14 fonts in groups, sends the pick, and the style only resets an untouched font", async () => {
    flow(() => upJson());
    render(<ReportForm turn={turn} onClose={() => {}} />);
    expect(open(t.fFont).filter((o) => o.getAttribute("data-value"))).toHaveLength(14);
    expect(screen.getByText(t.fFontGroup_sipa)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "TH Krub" }));
    expect(document.querySelector("article")).toHaveStyle({ fontFamily: "th-krub" });
    open(t.fStyle); fireEvent.click(screen.getByRole("option", { name: t.fStyleOfficial }));
    fireEvent.click(screen.getByRole("button", { name: t.fSavePdf, hidden: true }));
    await waitFor(() => expect(exportBody()).toMatchObject({ style: "official", font: "th-krub" }));
  });
  it("style change sets the style default font when untouched", async () => {
    flow(() => upJson());
    render(<ReportForm turn={turn} onClose={() => {}} />);
    open(t.fStyle); fireEvent.click(screen.getByRole("option", { name: t.fStyleOfficial }));
    fireEvent.click(screen.getByRole("button", { name: t.fSavePdf, hidden: true }));
    await waitFor(() => expect(exportBody()).toMatchObject({ style: "official", font: "th-sarabun-new" }));
  });
});

describe("ReportForm LaTeX templates", () => {
  it("a LaTeX template swaps the save buttons for one .tex download that sends the template, and turns the font off", async () => {
    flow(() => upJson(), () => new Response("% !TeX program = xelatex", { status: 200, headers: { "Content-Disposition": "attachment; filename*=UTF-8''T.tex" } }));
    URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
    render(<ReportForm turn={turn} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: t.fSettings }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.fStyle }));
    expect(screen.getByText(t.fGroupTex)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: t.fTex_ieee }));
    expect(screen.queryByRole("button", { name: t.fSavePdf, hidden: true })).toBeNull();
    expect(screen.getByRole("combobox", { name: t.fFont })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: t.fDownloadTex, hidden: true }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reports/export"))).toBe(true));
    const sent = JSON.parse(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/reports/export"))![1].body));
    expect(sent).toMatchObject({ format: "tex", template: "ieee" });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/files"))).toBe(false); // downloaded, not put in the library
  });
});

describe("ReportForm sheet extras", () => {
  const withRefs = { ...turn, answer: { content: "# A\n\nB", references: [{ id: "1", status: "verified", paper: { title: "Paper A", authors: ["Kim"], year: 2020, doi: "10.1/x", url: "https://doi.org/10.1/x" } }] } } as unknown as Turn;
  it("shows the generated references block only while the switch is on and refs exist", () => {
    render(<ReportForm turn={withRefs} onClose={() => {}} />);
    const r = screen.getByRole("region", { name: t.fRefsAria });
    expect(r).toHaveTextContent("References");
    expect(r).toHaveTextContent("[1] Kim (2020). Paper A. DOI: 10.1/x https://doi.org/10.1/x (identifier exists)");
    expect(r).toHaveTextContent("Note: the reference check only confirms");
    fireEvent.click(screen.getByRole("button", { name: t.fSettings }));
    fireEvent.click(screen.getByRole("switch", { name: t.fRefs }));
    expect(screen.queryByRole("region", { name: t.fRefsAria })).toBeNull();
  });
  it("shows nothing without references", () => {
    render(<ReportForm turn={turn} onClose={() => {}} />);
    expect(screen.queryByRole("region", { name: t.fRefsAria })).toBeNull();
  });
  it("numbers headings only in official style", () => {
    render(<ReportForm turn={turn} onClose={() => {}} />);
    expect(document.querySelector("article")).not.toHaveAttribute("data-numbered");
    fireEvent.click(screen.getByRole("button", { name: t.fSettings }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.fStyle }));
    fireEvent.click(screen.getByRole("option", { name: t.fStyleOfficial }));
    expect(document.querySelector("article")).toHaveAttribute("data-numbered", "true");
  });
});

describe("ReportForm paper details", () => {
  const open = () => { fireEvent.click(screen.getByRole("button", { name: t.fSettings })); fireEvent.click(screen.getByRole("button", { name: t.fDetails, hidden: true })); };
  it("inserts only the missing outline headings after the existing text and never changes it", async () => {
    render(<ReportForm turn={{ ...turn, answer: { content: "# Introduction\n\nBody text.", references: [] } } as unknown as Turn} onClose={() => {}} />);
    open();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.fPaperType }));
    fireEvent.click(screen.getByRole("option", { name: t.fPaper_research }));
    fireEvent.click(screen.getByRole("button", { name: t.fOutlineInsert }));
    await waitFor(() => expect(screen.getAllByText(t.fOutlineDone.replace("{n}", "4")).length).toBeGreaterThan(0));
    const body = screen.getAllByRole("textbox", { name: t.fBody, hidden: true })[0];
    const heads = [...body.querySelectorAll("h2")].map((h) => h.textContent);
    expect(heads).toEqual(["Introduction", "Methods", "Results", "Discussion", "Conclusion"]);
    expect(body).toHaveTextContent("Body text.");
    fireEvent.click(screen.getByRole("button", { name: t.fOutlineInsert }));
    await waitFor(() => expect(screen.getAllByText(t.fOutlineNone).length).toBeGreaterThan(0)); // second click adds nothing
    expect(body.querySelectorAll("h2")).toHaveLength(5);
  });
  it("sends authors, keywords, abstract and only the ticked statements, with the default text editable", async () => {
    flow(() => upJson(), () => new Response("% !TeX", { status: 200, headers: { "Content-Disposition": "attachment; filename*=UTF-8''T.tex" } }));
    URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
    render(<ReportForm turn={turn} onClose={() => {}} />);
    open();
    fireEvent.change(screen.getByRole("textbox", { name: t.fAuthors, hidden: true }), { target: { value: "Ann Lee, MIT" } });
    fireEvent.change(screen.getByRole("textbox", { name: t.fKeywords, hidden: true }), { target: { value: "rag, llm" } });
    fireEvent.change(screen.getByRole("textbox", { name: t.fAbstract, hidden: true }), { target: { value: "\\input{/etc/passwd} {" } });
    expect(screen.queryByRole("textbox", { name: t.fStmt_ai, hidden: true })).toBeNull(); // nothing included until ticked
    fireEvent.click(screen.getByRole("checkbox", { name: t.fStmt_ai, hidden: true }));
    expect(screen.getByRole("textbox", { name: t.fStmt_ai, hidden: true })).toHaveValue(t.stmtDefault_ai);
    expect(screen.getByText(t.fStmtDefault)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: t.fStmt_coi, hidden: true }));
    fireEvent.change(screen.getByRole("textbox", { name: t.fStmt_coi, hidden: true }), { target: { value: "None } {" } });
    fireEvent.click(screen.getByRole("button", { name: t.fDetailsClose }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: t.fStyle, hidden: true }));
    fireEvent.click(screen.getByRole("option", { name: t.fTex_ieee }));
    fireEvent.click(screen.getByRole("button", { name: t.fDownloadTex, hidden: true }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reports/export"))).toBe(true));
    const sent = JSON.parse(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/reports/export"))![1].body));
    expect(sent).toMatchObject({ authors: [{ name: "Ann Lee", affiliation: "MIT" }], keywords: ["rag", "llm"], abstract: "\\input{/etc/passwd} {",
      statements: [{ kind: "ai", text: t.stmtDefault_ai }, { kind: "coi", text: "None } {" }] });
  });
  it("shows the default statement text in the document language, not the interface language", async () => {
    flow(() => upJson(), () => new Response("% !TeX", { status: 200, headers: { "Content-Disposition": "attachment; filename*=UTF-8''T.tex" } }));
    URL.createObjectURL = vi.fn(() => "blob:x"); URL.revokeObjectURL = vi.fn();
    render(<ReportForm turn={turn} onClose={() => {}} />); // document language: en
    open();
    act(() => usePrefs.setState({ lang: "th" })); // interface switches to Thai; the document stays English
    const th = strings.th;
    fireEvent.click(screen.getByRole("checkbox", { name: th.fStmt_ai, hidden: true }));
    expect(screen.getByRole("textbox", { name: th.fStmt_ai, hidden: true })).toHaveValue(strings.en.stmtDefault_ai);
    fireEvent.click(screen.getByRole("button", { name: th.fDetailsClose }));
    fireEvent.mouseDown(screen.getByRole("combobox", { name: th.fStyle, hidden: true }));
    fireEvent.click(screen.getByRole("option", { name: th.fTex_ieee }));
    fireEvent.click(screen.getByRole("button", { name: th.fDownloadTex, hidden: true }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reports/export"))).toBe(true));
    const sent = JSON.parse(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/reports/export"))![1].body));
    expect(sent.statements).toEqual([{ kind: "ai", text: strings.en.stmtDefault_ai }]);
  });
  it("a request without the new fields carries none of them", async () => {
    flow(() => upJson(), () => new Response("% !TeX", { status: 200 }));
    render(<ReportForm turn={turn} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: t.fSavePdf }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/reports/export"))).toBe(true));
    const sent = JSON.parse(String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/reports/export"))![1].body));
    for (const k of ["authors", "keywords", "abstract", "statements"]) expect(sent).not.toHaveProperty(k);
  });
});

describe("ReportForm fade close", () => {
  it("Cancel then Discard closes once and returns focus to the trigger", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    const onClose = vi.fn();
    const Host = () => { const [o, setO] = useState(false); return <><button id="trig" onClick={() => setO(true)}>open</button>{o && <ReportForm turn={turn} onClose={() => { onClose(); setO(false); }} />}</>; };
    render(<Host />);
    act(() => document.getElementById("trig")!.focus());
    fireEvent.click(document.getElementById("trig")!);
    fireEvent.change(screen.getByRole("textbox", { name: t.fSubtitle }), { target: { value: "edited" } });
    fireEvent.click(screen.getByRole("button", { name: t.fCancel }));
    fireEvent.click(await screen.findByRole("button", { name: t.fDiscard }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(document.activeElement?.id).toBe("trig");
  });
});
