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

const openMenu = (n: number, name = `file${n}.csv`) => fireEvent.click(screen.getByRole("button", { name: `${t.fileActions}: ${name}` }));

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
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/presign") ? reply(501) : u.includes("/preview") ? reply(200, { columns: ["a", "b"], rows: [["1", "2"]], truncated: true, total_rows: 30 }) : reply(200, meta(1)))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.filePreview }));
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.getByText(t.previewShownOf.replace("{n}", "1").replace("{total}", "30"))).toBeTruthy();
  });
  it("preview 415 says there is no preview", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/presign") ? reply(501) : u.includes("/preview") ? reply(415) : reply(200, meta(1)))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.filePreview }));
    expect(await screen.findByText(t.previewUnavailable)).toBeTruthy();
  });

  const stubMedia = (match: (q: string) => boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: match(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  it("empty state names the next action and the supported formats", () => {
    render(<FilesPage />);
    expect(screen.getByRole("heading", { level: 2, name: t.filesEmptyTitle })).toBeTruthy();
    expect(screen.getByText(t.filesFormats)).toBeTruthy();
    expect(screen.queryByText(t.filesCount.replace("{n}", "0"))).toBeNull();
  });
  it("long names stay on one line in the table and expose the full name", () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, meta(1))));
    const long = `${"ผลสำรวจ".repeat(12)}.csv`;
    useFilesStore.setState({ files: [{ ...entry(1), name: long }] });
    render(<FilesPage />);
    expect(screen.getByTitle(long)).toBeTruthy();
    expect(screen.getByText(t.filesCount.replace("{n}", "1"))).toBeTruthy();
  });
  it("narrow screens get stacked cards (a list) instead of a table, with a 44px menu button", () => {
    stubMedia((q) => q.includes("max-width"));
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, meta(1))));
    useFilesStore.setState({ files: [entry(1), entry(2)] });
    render(<FilesPage />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(within(screen.getByRole("list", { name: t.files })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: `${t.fileActions}: file1.csv` })).toBeTruthy();
  });
  it("closing a dialog returns focus to that row's menu button", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(200, meta(1))));
    useFilesStore.setState({ files: [entry(1)] });
    render(<FilesPage />);
    openMenu(1);
    fireEvent.click(screen.getByRole("menuitem", { name: t.rename }));
    await screen.findByLabelText(t.fileNameLabel);
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    await waitFor(() => expect(document.activeElement?.id).toBe(`kebab-${id(1)}`));
  });
  it("removing a row collapses it first under no-preference, and is instant otherwise", async () => {
    stubMedia((q) => q.includes("no-preference"));
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes(id(1)) ? reply(404) : reply(200, meta(2)))));
    useFilesStore.setState({ files: [entry(1), entry(2)] });
    render(<FilesPage />);
    fireEvent.click(await screen.findByRole("button", { name: t.fileRemoveEntry }));
    expect(useFilesStore.getState().files).toHaveLength(2); // still there while it animates out
    await waitFor(() => expect(useFilesStore.getState().files.map((f) => f.id)).toEqual([id(2)]));
    expect(document.activeElement?.tagName).toBe("H1");
  });
});


describe("presigned preview", () => {
  const SIGNED = "https://files.example/b/x?X-Amz-Signature=abc";
  const ps = (kind: string, inline = true) => reply(200, { url: SIGNED, expires_in: 300, kind, inline, name: `f.${kind}` });
  const open = async (n: number, e: object) => {
    useFilesStore.setState({ files: [{ ...entry(n), ...e }] });
    render(<FilesPage />);
    openMenu(n, (e as { name?: string }).name);
    fireEvent.click(screen.getByRole("menuitem", { name: t.filePreview }));
  };
  const pdf = { name: "file1.pdf", kind: "pdf" };
  it("pdf opens in an iframe with no referrer, no sandbox and an open-in-tab link", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/presign") ? ps("pdf") : reply(200, { ...meta(1), name: "file1.pdf", kind: "pdf" }))));
    await open(1, pdf);
    const f = (await screen.findByTitle(`${t.filePreview}: file1.pdf`)) as HTMLIFrameElement;
    expect(f.getAttribute("src")).toBe(SIGNED);
    expect(f.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(f.hasAttribute("sandbox")).toBe(false);
    const a = screen.getByRole("link", { name: t.previewOpenTab });
    expect(a.getAttribute("href")).toBe(SIGNED);
    expect(a.getAttribute("rel")).toContain("noopener");
  });
  it("csv is fetched from the presigned url with a Range header and rendered; url is never stored", async () => {
    const fetchMock = vi.fn(async (u: string) => (u.includes("/presign") ? ps("csv") : u === SIGNED ? new Response("a,b\n1,\"x,y\"\n", { status: 206, headers: { "content-range": "bytes 0-13/14" } }) : reply(200, meta(1))));
    vi.stubGlobal("fetch", fetchMock);
    await open(1, {});
    expect(await screen.findByText("x,y")).toBeTruthy();
    const call = fetchMock.mock.calls.find((c) => c[0] === SIGNED)!;
    expect((call as unknown as [string, RequestInit])[1].headers).toMatchObject({ Range: "bytes=0-1048575" });
    const stored = JSON.stringify(Object.entries({ ...localStorage })) + JSON.stringify(sessionStorage.length);
    expect(stored).not.toContain("X-Amz");
    expect(JSON.stringify(useFilesStore.getState())).not.toContain("X-Amz");
  });
  it("csv falls back to the backend preview when the direct fetch fails (CORS)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (u.includes("/presign")) return ps("csv");
      if (u === SIGNED) throw new TypeError("cors");
      return u.includes("/preview") ? reply(200, { columns: ["z"], rows: [["fallback"]], truncated: false, total_rows: 1 }) : reply(200, meta(1));
    }));
    await open(1, {});
    expect(await screen.findByText("fallback")).toBeTruthy();
  });
  it("csv falls back to the backend preview when presign is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/presign") ? reply(501) : u.includes("/preview") ? reply(200, { columns: ["z"], rows: [["proxied"]], truncated: false, total_rows: 1 }) : reply(200, meta(1)))));
    await open(1, {});
    expect(await screen.findByText("proxied")).toBeTruthy();
  });
  it("xlsx shows the honest panel with a download link to the attachment url", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/presign") ? ps("xlsx", false) : reply(200, { ...meta(1), name: "file1.xlsx", kind: "xlsx" }))));
    await open(1, { name: "file1.xlsx", kind: "xlsx" });
    expect(await screen.findByText(t.previewNoBrowser)).toBeTruthy();
    expect(screen.getByRole("link", { name: t.download }).getAttribute("href")).toBe(SIGNED);
    expect(document.body.textContent).toMatch(/file1\.xlsx · XLSX · [\d.]+ KB/);
  });
  it("an expired link (403) offers a retry that requests a fresh one", async () => {
    let n = 0;
    const m = vi.fn(async (u: string) => {
      if (u.includes("/presign")) return ps("csv");
      if (u === SIGNED) return ++n === 1 ? new Response("", { status: 403 }) : new Response("q\n7\n", { status: 200 });
      return reply(200, meta(1));
    });
    vi.stubGlobal("fetch", m);
    await open(1, {});
    expect(await screen.findByText(t.previewExpired)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.previewRetry }));
    expect(await screen.findByText("7")).toBeTruthy();
    expect(m.mock.calls.filter((c) => String(c[0]).includes("/presign"))).toHaveLength(2);
  });
});

describe("upload picker", () => {
  it("accepts pdf and docx on the files page", () => {
    const { container } = render(<FilesPage />);
    const accept = container.querySelector("input[type=file]")!.getAttribute("accept")!;
    expect(accept).toContain(".pdf");
    expect(accept).toContain(".docx");
  });
});
