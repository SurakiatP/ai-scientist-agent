// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Turn } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { ReportForm } from "./ReportForm";

const t = strings.en;
const turn = { id: "t1", question: "Q", createdAt: 1, status: "done", answer: { content: "# Study plan\n\nBody **text**.", references: [] } } as unknown as Turn;
let fetchMock: ReturnType<typeof vi.fn>;
const calls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("/reports/translate"));
const ok = (j: unknown) => Promise.resolve(new Response(JSON.stringify(j), { status: 200 }));
// fake model: prefixes every segment with the target language
const echo = (init: RequestInit) => { const b = JSON.parse(String(init.body)); return ok({ segments: b.segments.map((s: string) => `${b.target}:${s}`) }); };
const lang = () => screen.getByRole("combobox", { name: t.fLang });
// a real click focuses the settings button; the popover gives focus back to it
const pick = async (name: string) => { if (!screen.queryByRole("combobox", { name: t.fLang })) { const b = screen.getByRole("button", { name: t.fSettings }); b.focus(); fireEvent.click(b); } fireEvent.mouseDown(lang()); fireEvent.click(await screen.findByRole("option", { name })); };
const body = () => document.querySelector(".ProseMirror") as HTMLElement;

beforeEach(() => {
  usePrefs.setState({ lang: "en" });
  sessionStorage.clear();
  fetchMock = vi.fn((u: string, init: RequestInit) => (String(u).includes("/reports/translate") ? echo(init) : new Promise(() => {})));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("translate on language change", () => {
  it("translates, then switching back and forth without edits makes no more requests", async () => {
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    expect(calls()).toHaveLength(1);
    expect(JSON.parse(String(calls()[0][1].body))).toMatchObject({ target: "th", segments: ["Study plan", "Q", "Study plan", "Body **text**."] });
    expect(screen.getByDisplayValue("th:Study plan")).toBeInTheDocument();
    expect(body().querySelector("strong")).not.toBeNull();
    await pick("English");
    await waitFor(() => expect(body().textContent).toContain("Body text."));
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    expect(calls()).toHaveLength(1);
  });
  it("an edit makes the next switch ask again", async () => {
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    await pick("English");
    await waitFor(() => expect(body().textContent).toContain("Body text."));
    expect(calls()).toHaveLength(1);
    await act(async () => { fireEvent.change(screen.getAllByDisplayValue("Study plan")[0], { target: { value: "Changed" } }); });
    await pick("ไทย");
    await waitFor(() => expect(calls()).toHaveLength(2));
    await waitFor(() => expect(screen.getByDisplayValue("th:Changed")).toBeInTheDocument());
  });
  it("shows the skeleton while pending and the editor is read-only; cancel reverts", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((u: string, init: RequestInit) => { signal = init.signal as AbortSignal; return new Promise((_, rej) => signal!.addEventListener("abort", () => rej(new DOMException("a", "AbortError")))); });
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    expect(await screen.findByTestId("sheet-skeleton")).toBeInTheDocument();
    expect(body().getAttribute("contenteditable")).toBe("false");
    expect(screen.getAllByText(t.trToTh).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: t.trCancel })).toHaveFocus();
    expect(screen.getByRole("button", { name: t.fSavePdf })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: t.trCancel }));
    await waitFor(() => expect(screen.queryByTestId("sheet-skeleton")).toBeNull());
    expect(signal!.aborted).toBe(true);
    expect(body().getAttribute("contenteditable")).toBe("true");
    expect(body().textContent).toContain("Body text.");
    await waitFor(() => expect(document.getElementById("rf-settings")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: t.fSettings })); expect(lang()).toHaveTextContent("English");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each([[429, "tr429"], [502, "tr502"], [504, "tr504"]] as const)("error %i reverts language and content", async (status, key) => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status })));
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    expect(await screen.findByText(t[key])).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.fSettings })); expect(lang()).toHaveTextContent("English");
    expect(body().textContent).toContain("Body text.");
    expect(screen.getAllByDisplayValue("Study plan").length).toBeGreaterThan(0);
  });
  it("network failure shows the connection message", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("x")));
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    expect(await screen.findByText(t.trNet)).toBeInTheDocument();
  });
  it("a translation counts as an edit for the discard prompt", async () => {
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    fireEvent.click(screen.getByRole("button", { name: t.fCancel }));
    expect(within(await screen.findByRole("dialog", { name: t.fDiscardTitle })).getByText(t.fDiscardBody)).toBeInTheDocument();
  });
  it("saving after a translation clears the discard prompt", async () => {
    fetchMock.mockImplementation((u: string, init: RequestInit) => (String(u).includes("/reports/translate") ? echo(init) : String(u).includes("/reports/export") ? Promise.resolve(new Response(new Blob(["%PDF"]), { status: 200 })) : Promise.resolve(new Response(JSON.stringify({ id: "a".repeat(32), name: "x.pdf", size: 5, kind: "pdf" }), { status: 200 }))));
    const onClose = vi.fn();
    render(<ReportForm turn={turn} onClose={onClose} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    fireEvent.click(screen.getByRole("button", { name: t.fSavePdf }));
    await waitFor(() => expect(screen.getAllByText(t.fSaved, { exact: false }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: t.fCancel }));
    expect(onClose).toHaveBeenCalled();
  });
  it("undo after a translation does not bring the old language back", async () => {
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    fireEvent.click(screen.getByRole("button", { name: t.tbUndo }));
    expect(body().textContent).toContain("th:Body");
  });
  it("reopening in the same tab reuses the stored translation", async () => {
    const a = render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    a.unmount();
    render(<ReportForm turn={turn} onClose={() => {}} />);
    await pick("ไทย");
    await waitFor(() => expect(body().textContent).toContain("th:Body"));
    expect(calls()).toHaveLength(1);
  });
});
