// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "@/app/chat/page";
import { AppShell } from "@/components/shell/AppShell";
import { useSettingsOpen } from "@/components/shell/Sidebar";
import { PERSONAL, useChatStore } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { emptyProgress } from "@/lib/progress";
import { strings } from "@/lib/strings";

const run = vi.hoisted(() => ({ sessionId: null as string | null, stopRun: vi.fn(async () => true) }));
vi.mock("@/lib/run", () => ({ useSending: () => false, useStoppable: () => false, stopTurn: vi.fn(async () => true),  useRunState: () => ({ sessionId: run.sessionId, turnId: run.sessionId && "t" }), stopRun: run.stopRun, startRun: vi.fn(), approvePlan: vi.fn(), cancelPlan: vi.fn(), canStart: () => ({ ok: true }) }));
const cs = vi.hoisted(() => ({ mode: "system" as string, setMode: vi.fn() }));
vi.mock("@mui/material", async (orig) => ({ ...(await orig<typeof import("@mui/material")>()), useColorScheme: () => cs }));

let t = strings.th;
const seed = (q: string, projectId = PERSONAL) => {
  const id = useChatStore.getState().newSession(projectId);
  useChatStore.getState().addTurn(id, { id: "t" + id, question: q, createdAt: 1, status: "done", progress: emptyProgress });
  return id;
};
const sb = () => screen.getAllByRole("navigation", { hidden: true })[0];
const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  useChatStore.getState().clearAll();
  usePrefs.setState({ lang: "th", sidebarCollapsed: false });
  useSettingsOpen.getState().set(false);
  t = strings.th;
  run.sessionId = null; run.stopRun.mockClear(); cs.setMode.mockClear();
  fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const openSettings = () => { render(<AppShell>x</AppShell>); fireEvent.click(within(sb()).getByRole("button", { name: t.settings })); return screen.findByRole("dialog"); };

describe("SettingsDialog", () => {
  it("switching language re-renders labels and keeps sessions", async () => {
    seed("keep me");
    const dlg = await openSettings();
    fireEvent.click(within(dlg).getByRole("radio", { name: "English" }));
    expect(usePrefs.getState().lang).toBe("en");
    expect(within(await screen.findByRole("dialog")).getByText(strings.en.settingsTitle)).toBeInTheDocument();
    expect(within(sb()).getByText("keep me")).toBeInTheDocument();
    expect(useChatStore.getState().sessions).toHaveLength(1);
  });

  it("theme change calls setMode", async () => {
    const dlg = await openSettings();
    fireEvent.click(within(dlg).getByRole("radio", { name: t.themeDark }));
    expect(cs.setMode).toHaveBeenCalledWith("dark");
  });

  it("delete-all needs the in-dialog confirm step, never window.confirm", async () => {
    const wc = vi.spyOn(window, "confirm");
    seed("a"); seed("b"); useChatStore.getState().addProject("Lab");
    const dlg = await openSettings();
    fireEvent.click(within(dlg).getByRole("button", { name: t.deleteAllChats }));
    expect(useChatStore.getState().sessions).toHaveLength(2);
    fireEvent.click(within(dlg).getByRole("button", { name: t.cancel }));
    expect(useChatStore.getState().sessions).toHaveLength(2);
    fireEvent.click(within(dlg).getByRole("button", { name: t.deleteAllChats }));
    fireEvent.click(within(dlg).getByRole("button", { name: t.confirm }));
    expect(useChatStore.getState().sessions).toHaveLength(0);
    expect(useChatStore.getState().projects).toHaveLength(1);
    expect(run.stopRun).toHaveBeenCalled();
    expect(wc).not.toHaveBeenCalled();
  });

  it("review plan switch toggles the preference both ways and persists it", async () => {
    const dlg = await openSettings();
    const sw = within(dlg).getByRole("switch", { name: t.reviewPlan });
    expect(sw).toBeChecked(); // on by default: Deep Research pauses for review
    fireEvent.click(sw);
    expect(usePrefs.getState().reviewPlan).toBe(false);
    expect(JSON.parse(localStorage.getItem("scientist-prefs-v1")!).state.reviewPlan).toBe(false);
    fireEvent.click(sw);
    expect(usePrefs.getState().reviewPlan).toBe(true);
  });

  it("backend reachable and unreachable; failure does not throw", async () => {
    let dlg = await openSettings();
    expect(await within(dlg).findByText(`${t.backend}: ${t.backendOk}`)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/v1\/health$/);
    cleanup(); useSettingsOpen.getState().set(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    dlg = await openSettings();
    expect(await within(dlg).findByText(`${t.backend}: ${t.backendDown}`)).toBeInTheDocument();
    cleanup(); useSettingsOpen.getState().set(false);
    fetchMock.mockResolvedValue({ ok: false });
    dlg = await openSettings();
    expect(await within(dlg).findByText(`${t.backend}: ${t.backendDown}`)).toBeInTheDocument();
  });
});

describe("session and project management", () => {
  const kebab = (name: string) => within(sb()).getByRole("button", { name: `${t.moreActions}: ${name}` });
  const pick = async (label: string) => fireEvent.click(await screen.findByRole("menuitem", { name: label }));

  it("deleting the active session needs confirm, activates none, and stops its run", async () => {
    const id = seed("doomed"); seed("other");
    useChatStore.getState().setActive(id);
    run.sessionId = id;
    render(<AppShell>x</AppShell>);
    fireEvent.click(kebab("doomed"));
    await pick(t.deleteItem);
    expect(useChatStore.getState().sessions).toHaveLength(2);
    fireEvent.click(within(sb()).getByRole("button", { name: t.cancel }));
    expect(within(sb()).getByText("doomed")).toBeInTheDocument();
    fireEvent.click(kebab("doomed"));
    await pick(t.deleteItem);
    fireEvent.click(within(sb()).getByRole("button", { name: t.confirm }));
    expect(useChatStore.getState().activeId).toBeNull();
    expect(useChatStore.getState().sessions.map((s) => s.title)).toEqual(["other"]);
    expect(run.stopRun).toHaveBeenCalled();
  });

  it("renames a session inline", async () => {
    seed("old name");
    render(<AppShell>x</AppShell>);
    fireEvent.click(kebab("old name"));
    await pick(t.rename);
    const box = within(sb()).getByRole("textbox", { name: t.newName });
    fireEvent.change(box, { target: { value: "new name" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(useChatStore.getState().sessions[0].title).toBe("new name");
  });

  it("moves a session to another project", async () => {
    const p = useChatStore.getState().addProject("Lab");
    seed("mover");
    render(<AppShell>x</AppShell>);
    fireEvent.click(kebab("mover"));
    await pick("Lab");
    expect(useChatStore.getState().sessions[0].projectId).toBe(p);
  });

  it("renames and deletes a project; its chats fall back to Personal", async () => {
    const p = useChatStore.getState().addProject("Lab");
    seed("inside", p);
    useChatStore.getState().setActive(useChatStore.getState().sessions[0].id);
    render(<AppShell>x</AppShell>);
    fireEvent.click(kebab("Lab"));
    await pick(t.rename);
    const box = within(sb()).getByRole("textbox", { name: t.projectName });
    fireEvent.change(box, { target: { value: "Lab2" } });
    fireEvent.click(within(sb()).getByRole("button", { name: t.saveName }));
    expect(useChatStore.getState().projects[1].name).toBe("Lab2");
    fireEvent.click(kebab("Lab2"));
    await pick(t.deleteItem);
    fireEvent.click(within(sb()).getByRole("button", { name: t.confirm }));
    const s = useChatStore.getState();
    expect(s.projects).toHaveLength(1);
    expect(s.sessions[0].projectId).toBe(PERSONAL);
    expect(s.activeProjectId).toBe(PERSONAL);
  });

  it("personal project has no actions menu", () => {
    render(<AppShell>x</AppShell>);
    expect(within(sb()).queryByRole("button", { name: `${t.moreActions}: ${t.personal}` })).toBeNull();
  });

  it("focus returns to the row's kebab after rename save and Esc cancel, and to New chat after delete", async () => {
    seed("focus me");
    render(<AppShell>x</AppShell>);
    fireEvent.click(kebab("focus me"));
    await pick(t.rename);
    const box = within(sb()).getByRole("textbox", { name: t.newName });
    fireEvent.change(box, { target: { value: "saved" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(kebab("saved")).toHaveFocus());
    fireEvent.click(kebab("saved"));
    await pick(t.rename);
    fireEvent.keyDown(within(sb()).getByRole("textbox", { name: t.newName }), { key: "Escape" });
    await waitFor(() => expect(kebab("saved")).toHaveFocus());
    fireEvent.click(kebab("saved"));
    await pick(t.deleteItem);
    fireEvent.click(within(sb()).getByRole("button", { name: t.confirm }));
    await waitFor(() => expect(within(sb()).getByRole("button", { name: t.newChat })).toHaveFocus());
  });

  it("deleting the active session on /chat shows an empty chat", async () => {
    const id = seed("gone");
    useChatStore.getState().setActive(id);
    render(<ChatPage />);
    expect(screen.queryByRole("heading", { name: t.emptyHeading })).toBeNull(); // thread, not empty chat
    fireEvent.click(kebab("gone"));
    await pick(t.deleteItem);
    fireEvent.click(within(sb()).getByRole("button", { name: t.confirm }));
    expect(await screen.findByRole("heading", { name: t.emptyHeading })).toBeInTheDocument();
    expect(useChatStore.getState().sessions).toHaveLength(1);
    expect(useChatStore.getState().sessions[0].turns).toHaveLength(0);
  });
});
