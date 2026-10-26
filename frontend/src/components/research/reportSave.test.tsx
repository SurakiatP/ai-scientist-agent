// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    await act(async () => { void useExport.getState().save({ style: "standard", font: "sarabun", title: "T", subtitle: "", refs: false, lang: "en", lead: "L", doc: docFromSections([{ heading: "h", text: "b" }]) }, "pdf", turn); });
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
