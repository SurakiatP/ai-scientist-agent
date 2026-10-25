// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/lib/chat";
import { useFilesStore } from "@/lib/files";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { FilesPage } from "./FilesPage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/files" }));
const t = strings.th;
const id = (n: number) => n.toString(16).padStart(32, "0");
const entry = (n: number) => ({ id: id(n), name: `file${n}.csv`, size: 2048, kind: "csv", createdAt: n * 1000, projectId: "personal" });
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const meta = (n: number) => ({ id: id(n), name: `file${n}.csv`, size: 2048, kind: "csv" });

beforeEach(() => {
  localStorage.clear(); useChatStore.getState().clearAll(); useFilesStore.setState({ files: [] }); usePrefs.setState({ lang: "th" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openMenu = (n: number) => fireEvent.click(screen.getByRole("button", { name: `${t.fileActions}: file${n}.csv` }));

describe("My files", () => {
  it("shows the empty state with an upload button", () => {
    render(<FilesPage />);
    expect(screen.getByText(t.filesEmptyTitle)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.filesUpload })).toBeTruthy();
  });
  it("lists newest first, filters by search, and flags a file the server no longer has", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes(id(1)) ? reply(404) : reply(200, meta(2)))));
    useFilesStore.setState({ files: [entry(1), entry(2)] });
    render(<FilesPage />);
    const names = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(names()[0]).toContain("file2.csv");
    await waitFor(() => expect(screen.getByText(t.fileMissing)).toBeTruthy());
    expect(screen.getByRole("button", { name: t.fileRemoveEntry })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: t.filesSearch }), { target: { value: "file1" } });
    expect(names()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: t.fileRemoveEntry }));
    expect(useFilesStore.getState().files.map((f) => f.id)).toEqual([id(2)]);
  });
  it("rename validates locally and shows the extension rule", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, meta(1))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.rename }));
    const box = await screen.findByLabelText(t.fileNameLabel);
    fireEvent.change(box, { target: { value: "x.json" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveName }));
    expect((await screen.findByRole("alert")).textContent).toContain(".csv");
  });
  it("rename success updates the local entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "PATCH" ? reply(200, { ...meta(1), name: "better.csv" }) : reply(200, meta(1)))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.rename }));
    fireEvent.change(await screen.findByLabelText(t.fileNameLabel), { target: { value: "better.csv" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveName }));
    await waitFor(() => expect(useFilesStore.getState().files[0].name).toBe("better.csv"));
  });
  it("delete keeps the entry on 503 and removes it on 404", async () => {
    let del = 503;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => (init?.method === "DELETE" ? reply(del) : reply(200, meta(1)))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.deleteItem }));
    fireEvent.click(await screen.findByRole("button", { name: t.deleteItem }));
    expect((await screen.findByRole("alert")).textContent).toContain(t.fileStorageDown);
    expect(useFilesStore.getState().files).toHaveLength(1);
    del = 404;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: t.deleteItem })); });
    await waitFor(() => expect(useFilesStore.getState().files).toHaveLength(0));
  });
  it("preview renders the table and the row count", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/preview") ? reply(200, { columns: ["a", "b"], rows: [["1", "2"]], truncated: true, total_rows: 30 }) : reply(200, meta(1)))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.filePreview }));
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.getByText(t.previewShownOf.replace("{n}", "1").replace("{total}", "30"))).toBeTruthy();
  });
  it("preview 415 says there is no preview", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/preview") ? reply(415) : reply(200, meta(1)))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.filePreview }));
    expect(await screen.findByText(t.previewUnavailable)).toBeTruthy();
  });
});
