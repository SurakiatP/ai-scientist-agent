// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { useChatStore, PERSONAL } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { useSettingsOpen } from "./Sidebar";

const run = vi.hoisted(() => ({ sessionId: null as string | null }));
vi.mock("@/lib/run", () => ({ useRunState: () => ({ sessionId: run.sessionId, turnId: run.sessionId && "t" }) }));

const t = strings.th;
const prog = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "done" as const };
const turn = (id: string, q: string) => ({ id, question: q, createdAt: 1, status: "done" as const, progress: prog });
const seed = (title: string, projectId = PERSONAL) => {
  const id = useChatStore.getState().newSession(projectId);
  useChatStore.getState().addTurn(id, turn("t" + id, title));
  return id;
};
const sb = () => screen.getAllByRole("navigation")[0];

beforeEach(() => {
  localStorage.clear();
  useChatStore.getState().clearAll();
  usePrefs.setState({ lang: "th", sidebarCollapsed: false });
  useSettingsOpen.getState().set(false);
  run.sessionId = null;
});

describe("shell", () => {
  it("New chat reuses an existing empty session instead of piling up blanks", () => {
    render(<AppShell>x</AppShell>);
    fireEvent.click(within(sb()).getByRole("button", { name: t.newChat }));
    fireEvent.click(within(sb()).getByRole("button", { name: t.newChat }));
    expect(useChatStore.getState().sessions).toHaveLength(1);
    act(() => useChatStore.getState().addTurn(useChatStore.getState().sessions[0].id, turn("x", "filled")));
    fireEvent.click(within(sb()).getByRole("button", { name: t.newChat }));
    expect(useChatStore.getState().sessions).toHaveLength(2);
  });

  it("search filters session titles case-insensitively", () => {
    seed("Alpha CRISPR"); seed("Beta graphene");
    render(<AppShell>x</AppShell>);
    fireEvent.change(within(sb()).getByRole("searchbox"), { target: { value: "crispr" } });
    expect(within(sb()).getByText("Alpha CRISPR")).toBeInTheDocument();
    expect(within(sb()).queryByText("Beta graphene")).toBeNull();
  });

  it("switching project highlights it and keeps sessions", () => {
    const p = useChatStore.getState().addProject("Lab");
    seed("one");
    render(<AppShell>x</AppShell>);
    fireEvent.click(within(sb()).getByRole("button", { name: "Lab" }));
    expect(within(sb()).getByRole("button", { name: "Lab" })).toHaveAttribute("aria-current", "true");
    expect(useChatStore.getState().activeProjectId).toBe(p);
    expect(useChatStore.getState().sessions).toHaveLength(1);
  });

  it("running session row has an accessible running label", () => {
    const id = seed("busy");
    seed("idle");
    run.sessionId = id;
    render(<AppShell>x</AppShell>);
    expect(within(sb()).getAllByLabelText(t.running)).toHaveLength(1);
  });

  it("empty store shows a real empty state, no sample rows", () => {
    render(<AppShell>x</AppShell>);
    expect(within(sb()).getByText(t.noSessions)).toBeInTheDocument();
  });

  it("drawer opens from the menu button and Escape returns focus to it", async () => {
    render(<AppShell>x</AppShell>);
    const btn = screen.getByRole("button", { name: t.menu });
    btn.focus();
    fireEvent.click(btn);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("button", { name: t.newChat })).toBeInTheDocument();
    fireEvent.keyDown(dlg, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(btn).toHaveFocus();
  });

  it("collapse toggle is stored in prefs", () => {
    render(<AppShell>x</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: t.collapseSidebar }));
    expect(usePrefs.getState().sidebarCollapsed).toBe(true);
  });

  it("settings link opens the settings store", () => {
    render(<AppShell>x</AppShell>);
    fireEvent.click(within(sb()).getByRole("button", { name: t.settings }));
    expect(useSettingsOpen.getState().open).toBe(true);
  });

  it("+ opens an inline name input and creates a project", () => {
    render(<AppShell>x</AppShell>);
    fireEvent.click(within(sb()).getByRole("button", { name: t.newProject }));
    const input = within(sb()).getByRole("textbox", { name: t.projectName });
    fireEvent.change(input, { target: { value: "Lab" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useChatStore.getState().projects.map((p) => p.name)).toContain("Lab");
  });
});
