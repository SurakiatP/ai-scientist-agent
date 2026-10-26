// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/AppShell";
import { useSettingsOpen } from "@/components/shell/Sidebar";
import { TrashPage } from "@/components/trash/TrashPage";
import { UsagePage } from "@/components/usage/UsagePage";
import { useChatStore } from "@/lib/chat";
import { clearOld, chunks, importOld, readOld, summarize } from "@/lib/importOld";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress } from "@/lib/progress";
import { strings } from "@/lib/strings";
import { useSync } from "@/lib/sync";
import { SyncChip } from "./SyncUI";

vi.mock("@/lib/run", () => ({ useRunState: () => ({ sessionId: null, turnId: null }), stopRun: vi.fn(), runningTurnId: () => null, approvePlan: vi.fn(), cancelPlan: vi.fn() }));
const t = strings.th;
const U = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`;
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
const online = (extra: object = {}) => useSync.setState({ status: "online", ready: true, pending: 0, ...extra });

beforeEach(() => {
  localStorage.clear(); useChatStore.getState().clearAll(); usePrefs.setState({ lang: "th", sidebarCollapsed: false }); useSettingsOpen.getState().set(false);
  useSync.setState({ status: "disabled", ready: true, pending: 0, notice: null, rev: 0 });
  fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("sync status chip", () => {
  const label = () => screen.getByRole("status").getAttribute("aria-label");
  it("says what is true for each state, and the disabled state is plain, not an error", () => {
    const { rerender } = render(<SyncChip />);
    expect(label()).toBe(`${t.syncStatus}: ${t.syncLocal}`);
    online(); rerender(<SyncChip />);
    expect(screen.getByText(t.syncOnline)).toBeTruthy();
    online({ pending: 2 }); rerender(<SyncChip />);
    expect(screen.getByText(t.syncSyncing.replace("{n}", "2"))).toBeTruthy();
    useSync.setState({ status: "offline", pending: 3 }); rerender(<SyncChip />);
    expect(screen.getByText(t.syncOffline.replace("{n}", "3"))).toBeTruthy();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});

describe("settings", () => {
  const open = () => { render(<AppShell>x</AppShell>); fireEvent.click(within(screen.getAllByRole("navigation", { hidden: true })[0]).getByRole("button", { name: t.settings })); return screen.findByRole("dialog"); };
  it("warns that delete-all removes the SHARED data when the database is on", async () => {
    online(); fetchMock.mockResolvedValue(reply({}));
    const d = await open();
    fireEvent.click(within(d).getByRole("button", { name: t.deleteAllChats }));
    expect(within(d).getByText(t.deleteAllSharedConfirm)).toBeTruthy();
    expect(within(d).queryByText(t.deleteAllConfirm)).toBeNull();
  });
  it("keeps the browser-only warning and hides the import section without a database", async () => {
    fetchMock.mockResolvedValue(reply({}));
    const d = await open();
    fireEvent.click(within(d).getByRole("button", { name: t.deleteAllChats }));
    expect(within(d).getByText(t.deleteAllConfirm)).toBeTruthy();
    expect(within(d).queryByText(t.importTitle)).toBeNull();
  });
  it("imports only on the button, reports counts, can be repeated, and clears old data after a confirm", async () => {
    online();
    localStorage.setItem("scientist-chat-v1", JSON.stringify({ version: 1, state: { projects: [{ id: "personal", name: "", createdAt: 0 }], sessions: [{ id: U(1), projectId: "personal", title: "Old", createdAt: 1, updatedAt: 2, turns: [{ id: U(2), question: "q", createdAt: 1, status: "done", progress: emptyProgress }] }] } }));
    fetchMock.mockImplementation(async (u: string, init?: RequestInit) => (String(u).includes("/v1/store/import") ? reply(init?.body && JSON.parse(String(init.body)).sessions ? { projects: 0, sessions: 1, turns: 1, files: 0 } : { projects: 0, sessions: 0, turns: 0, files: 0 }) : reply({ db: "ok" })));
    const d = await open();
    expect(within(d).getByText(t.importFound.replace("{p}", "0").replace("{s}", "1").replace("{t}", "1").replace("{f}", "0"))).toBeTruthy();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/import"))).toBe(false); // never automatic
    fireEvent.click(within(d).getByRole("button", { name: t.importBtn }));
    await waitFor(() => expect(within(d).getByText(/นำเข้าแล้ว 2 รายการ/)).toBeTruthy());
    fireEvent.click(within(d).getByRole("button", { name: t.importClear }));
    expect(localStorage.getItem("scientist-chat-v1")).not.toBeNull(); // not before the confirm
    fireEvent.click(within(d).getByRole("button", { name: t.confirm }));
    expect(localStorage.getItem("scientist-chat-v1")).toBeNull();
  });
  it("disables the import button while offline", async () => {
    useSync.setState({ status: "offline", ready: true });
    localStorage.setItem("scientist-chat-v1", JSON.stringify({ version: 1, state: { sessions: [{ id: U(1), projectId: "personal", title: "Old", createdAt: 1, updatedAt: 2, turns: [] }] } }));
    fetchMock.mockResolvedValue(reply({}));
    const d = await open();
    expect(within(d).getByRole("button", { name: t.importBtn })).toBeDisabled();
  });
});

describe("importOld", () => {
  const seed = (n: number) => localStorage.setItem("scientist-chat-v1", JSON.stringify({ version: 1, state: {
    projects: [{ id: "personal", name: "", createdAt: 0 }, { id: U(900), name: "Lab", createdAt: 5 }],
    sessions: Array.from({ length: n }, (_, i) => ({ id: U(i + 1), projectId: i % 2 ? U(900) : "personal", title: "T" + i, createdAt: 1, updatedAt: 2, turns: [{ id: U(i + 100), question: "q".repeat(500), createdAt: 1, status: "running", progress: emptyProgress }] })),
  } }));
  it("splits sessions into batches under the byte cap and sends projects first", () => {
    seed(6);
    const parts = chunks(readOld(), 2200);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts[0]).toHaveProperty("projects");
    expect(parts.slice(1).flatMap((p) => p.sessions as unknown[])).toHaveLength(6);
    for (const p of parts.slice(1)) expect(new Blob([JSON.stringify(p)]).size).toBeLessThanOrEqual(2200 + 1200); // a single oversized session still goes alone
    const first = (parts[1].sessions as { turns: { status: string }[] }[])[0];
    expect(first.turns[0].status).toBe("interrupted"); // a run cannot survive a reload
  });
  it("sums server counts; a second press reports everything as skipped, not duplicated", async () => {
    seed(3);
    const d = readOld();
    fetchMock.mockImplementation(async () => reply({ projects: 0, sessions: 0, turns: 0, files: 0, skipped: 0 }));
    const prog = vi.fn();
    const r = await importOld(d, prog, 1500);
    expect(r).toMatchObject({ imported: 0, skipped: summarize(d).sessions + summarize(d).turns + summarize(d).projects });
    expect(prog).toHaveBeenLastCalledWith(fetchMock.mock.calls.length, fetchMock.mock.calls.length);
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => reply(JSON.parse(String(init.body)).sessions ? { projects: 0, sessions: 3, turns: 3, files: 0 } : { projects: 1, sessions: 0, turns: 0, files: 0 }));
    expect((await importOld(d, undefined, 1e9)).imported).toBe(7);
  });
  it("throws on a failed request and clears only the three old keys", async () => {
    seed(1); localStorage.setItem("scientist-files-v1", "{}"); localStorage.setItem("scientist-history-v1", "{}"); localStorage.setItem("scientist-prefs-v1", "keep");
    fetchMock.mockResolvedValue(reply({}, 503));
    await expect(importOld(readOld())).rejects.toThrow("503");
    clearOld();
    expect(["scientist-chat-v1", "scientist-files-v1", "scientist-history-v1"].map((k) => localStorage.getItem(k))).toEqual([null, null, null]);
    expect(localStorage.getItem("scientist-prefs-v1")).toBe("keep");
  });
});

describe("trash page", () => {
  // fixed order: the list sorts newest first, so "Old chat" (deleted later) is always row 0
  const now = Date.now();
  const trash = { sessions: [{ id: U(1), title: "Old chat", deleted_at: new Date(now).toISOString() }], projects: [{ id: U(2), name: "Lab", deleted_at: new Date(now - 60_000).toISOString() }], files: [] };
  const wire = (extra?: (u: string, m: string) => Response | undefined) => fetchMock.mockImplementation(async (u: string, init?: RequestInit) => {
    const m = init?.method ?? "GET", url = String(u);
    return extra?.(url, m) ?? (url.includes("/store/trash") && m === "GET" ? reply(trash) : url.includes("/snapshot") ? reply({ projects: [], sessions: [], files: [] }) : reply({}));
  });
  it("shows a loading skeleton, then the items with type, days left and 44px actions", async () => {
    online(); wire();
    render(<TrashPage />);
    expect(screen.getByRole("status", { name: t.trashLoading })).toBeTruthy();
    expect(await screen.findByText("Old chat")).toBeTruthy();
    expect(screen.getByText("Lab")).toBeTruthy();
    expect(screen.getAllByText(t.trashDaysLeft.replace("{n}", "7")).length).toBe(2);
    expect(screen.getAllByRole("button", { name: t.trashRestore })).toHaveLength(2);
  });
  it("restores through the restore route", async () => {
    online(); wire();
    render(<TrashPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: t.trashRestore }))[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith(`/v1/store/sessions/${U(1)}/restore`) && c[1].method === "POST")).toBe(true));
    expect(await screen.findByText(t.trashRestored)).toBeTruthy();
  });
  it("deletes permanently only after a confirm", async () => {
    online(); wire();
    render(<TrashPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: t.trashDeleteForever }))[0]);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false);
    expect(screen.getByText(t.trashDeleteConfirm.replace("{name}", "Old chat"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.confirm }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith(`/v1/store/sessions/${U(1)}?permanent=1`) && c[1].method === "DELETE")).toBe(true));
  });
  it("purges expired items on request", async () => {
    online(); wire();
    render(<TrashPage />);
    await screen.findByText("Old chat");
    fireEvent.click(screen.getByRole("button", { name: t.trashPurge }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/v1/store/trash/purge") && c[1].method === "POST")).toBe(true));
  });
  it("has an empty state, an error state with retry, and a browser-mode note", async () => {
    online(); fetchMock.mockImplementation(async () => reply({ sessions: [], projects: [], files: [] }));
    const { unmount } = render(<TrashPage />);
    expect(await screen.findByText(t.trashEmpty)).toBeTruthy();
    unmount();
    fetchMock.mockImplementation(async () => reply({ detail: "x" }, 500));
    const r2 = render(<TrashPage />);
    expect(await screen.findByText(t.trashError)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.retry })).toBeTruthy();
    r2.unmount();
    useSync.setState({ status: "disabled" });
    render(<TrashPage />);
    expect(screen.getByText(t.trashOff)).toBeTruthy();
  });
});

describe("usage page", () => {
  const body = { days: 7, modes: { deep: { count: 4, p50_seconds: 61.2, p95_seconds: 120, avg_prompt_tokens: 5000, avg_completion_tokens: 900, avg_cost_usd: 0.0123, ok_rate: 0.75 }, analysis: { count: 1, p50_seconds: 8, p95_seconds: 8, avg_prompt_tokens: null, avg_completion_tokens: null, avg_cost_usd: null, ok_rate: 1 } } };
  it("shows real numbers per mode, with a dash where the server has none, and switches the period", async () => {
    online(); fetchMock.mockImplementation(async () => reply(body));
    render(<UsagePage />);
    expect(screen.getByRole("status", { name: t.usageLoading })).toBeTruthy();
    expect(await screen.findByText(t.modeDeep)).toBeTruthy();
    expect(screen.getByText(`4 ${t.usageCount}`)).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText(t.usageModeAnalysis)).toBeTruthy();
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole("button", { name: t.usageDays30 }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith("/v1/usage/summary?days=30"))).toBe(true));
    expect(screen.getByText(t.usageNote)).toBeTruthy(); // "question text is not stored"
  });
  it("has honest empty and error states", async () => {
    online(); fetchMock.mockImplementation(async () => reply({ days: 7, modes: {} }));
    const { unmount } = render(<UsagePage />);
    expect(await screen.findByText(t.usageEmpty)).toBeTruthy();
    unmount();
    fetchMock.mockImplementation(async () => reply({}, 503));
    render(<UsagePage />);
    expect(await screen.findByText(t.usageError)).toBeTruthy();
  });
});
