// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { AppShell } from "./AppShell";
import { useChatStore, PERSONAL } from "@/lib/chat";
import { usePrefs } from "@/lib/prefs";
import { strings } from "@/lib/strings";
import { useTreeOpen } from "./ProjectTree";

const run = vi.hoisted(() => ({ sessionId: null as string | null }));
vi.mock("@/lib/run", () => ({ useSending: () => false, useStoppable: () => false, stopTurn: vi.fn(async () => true),  useRunState: () => ({ sessionId: run.sessionId, turnId: run.sessionId && "t" }), stopRun: vi.fn(async () => true), approvePlan: vi.fn(), cancelPlan: vi.fn() }));

const t = strings.th;
const prog = { waiting: null, reasoning: "", searches: [], sources: {}, answered: [], writing: false, phase: "done" as const };
const seed = (title: string, projectId = PERSONAL) => {
  const id = useChatStore.getState().newSession(projectId);
  useChatStore.getState().addTurn(id, { id: "t" + id, question: title, createdAt: 1, status: "done" as const, progress: prog });
  return id;
};
const sb = () => screen.getAllByRole("navigation")[0];
const toggle = (name: string) => within(sb()).getByRole("button", { name: `${t.toggleProject} ${name}` });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  useChatStore.getState().clearAll(); useTreeOpen.setState({ open: [] });
  usePrefs.setState({ lang: "th", sidebarCollapsed: false });
  run.sessionId = null;
});

describe("project tree", () => {
  it("folder button toggles aria-expanded; current project starts open", () => {
    const p = useChatStore.getState().addProject("Lab"); seed("a", p); useChatStore.setState({ activeProjectId: p });
    render(<AppShell>x</AppShell>);
    expect(toggle("Lab")).toHaveAttribute("aria-expanded", "true");
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle("Lab"));
    expect(toggle("Lab")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle(t.personal));
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "true");
  });

  it("switching the active project collapses the others", () => {
    const p = useChatStore.getState().addProject("Lab");
    render(<AppShell>x</AppShell>);
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(sb()).getByRole("button", { name: "Lab" }));
    expect(useChatStore.getState().activeProjectId).toBe(p);
    expect(toggle("Lab")).toHaveAttribute("aria-expanded", "true");
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the open, current project's name folds it, and again unfolds it (dropdown)", () => {
    render(<AppShell>x</AppShell>);
    const name = () => within(sb()).getByRole("button", { name: t.personal });
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(name());
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "false");
    expect(useChatStore.getState().activeProjectId).toBe(PERSONAL);
    fireEvent.click(name());
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "true");
  });

  it("nested session click selects it", () => {
    const id = seed("Nested question");
    render(<AppShell>x</AppShell>);
    fireEvent.click(within(within(sb()).getByRole("list", { name: t.personal })).getAllByRole("button", { name: /Nested question/ })[0]);
    expect(useChatStore.getState().activeId).toBe(id);
  });

  it("new session row creates the session in THAT project and activates it", () => {
    const p = useChatStore.getState().addProject("Lab");
    render(<AppShell>x</AppShell>);
    fireEvent.click(toggle("Lab"));
    fireEvent.click(within(within(sb()).getByRole("list", { name: "Lab" })).getByRole("button", { name: t.newSessionIn }));
    const s = useChatStore.getState();
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].projectId).toBe(p);
    expect(s.activeId).toBe(s.sessions[0].id);
  });

  it("empty project shows the muted line", () => {
    useChatStore.getState().addProject("Lab");
    render(<AppShell>x</AppShell>);
    fireEvent.click(toggle("Lab"));
    expect(within(within(sb()).getByRole("list", { name: "Lab" })).getByText(t.noProjectSessions)).toBeInTheDocument();
  });

  it("delete confirm says chats move to Personal; sessions move there", () => {
    const p = useChatStore.getState().addProject("Lab"); const id = seed("x", p);
    render(<AppShell>x</AppShell>);
    fireEvent.click(within(sb()).getByRole("button", { name: `${t.moreActions}: Lab` }));
    fireEvent.click(screen.getByRole("menuitem", { name: t.deleteItem }));
    expect(within(sb()).getByText(t.deleteProjectConfirm)).toBeInTheDocument();
    expect(t.deleteProjectConfirm).toContain("ส่วนตัว");
    fireEvent.click(within(sb()).getByRole("button", { name: t.confirm }));
    expect(useChatStore.getState().sessions.find((s) => s.id === id)?.projectId).toBe(PERSONAL);
  });

  it("session kebab menu is reachable inside a group", () => {
    seed("Menu me");
    render(<AppShell>x</AppShell>);
    const list = within(sb()).getByRole("list", { name: t.personal });
    const kebab = within(list).getAllByRole("button").find((b) => b.getAttribute("aria-haspopup") === "menu")!;
    fireEvent.click(kebab);
    expect(screen.getByRole("menuitem", { name: t.rename })).toBeInTheDocument();
  });

  it("persists open ids in sessionStorage and drops invalid data on read", () => {
    sessionStorage.setItem("scientist-tree-open", JSON.stringify(["a", 3, null]));
    act(() => useTreeOpen.getState().load());
    expect(useTreeOpen.getState().open).toEqual(["a"]);
    act(() => useTreeOpen.getState().toggle("b"));
    expect(JSON.parse(sessionStorage.getItem("scientist-tree-open")!)).toEqual(["a", "b"]);
    sessionStorage.setItem("scientist-tree-open", "{oops");
    act(() => useTreeOpen.getState().load());
    expect(useTreeOpen.getState().open).toEqual([]);
  });

  it("Recent excludes sessions shown in open groups, keeps others with project suffix", () => {
    const p = useChatStore.getState().addProject("Lab"); seed("In-lab", p); seed("In-personal");
    useChatStore.setState({ activeProjectId: PERSONAL });
    render(<AppShell>x</AppShell>);
    const recent = within(sb()).getByRole("list", { name: t.recents });
    expect(within(recent).queryByText(/In-personal/)).toBeNull();
    expect(within(recent).getByText(/In-lab/)).toBeInTheDocument();
    expect(within(recent).getByText("Lab")).toBeInTheDocument();
  });

  it("search opens matching groups", () => {
    seed("CRISPR notes");
    render(<AppShell>x</AppShell>);
    fireEvent.click(toggle(t.personal));
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(within(sb()).getByRole("searchbox"), { target: { value: "crispr" } });
    expect(toggle(t.personal)).toHaveAttribute("aria-expanded", "true");
  });

  it("header chevron collapses the whole list", () => {
    render(<AppShell>x</AppShell>);
    const h = within(sb()).getByRole("button", { name: `${t.toggleProject} ${t.projects}` });
    expect(h).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(h);
    expect(h).toHaveAttribute("aria-expanded", "false");
  });

  it("reduced motion / jsdom: closing unmounts at once", () => {
    render(<AppShell>x</AppShell>);
    fireEvent.click(toggle(t.personal));
    expect(within(sb()).queryByRole("list", { name: t.personal })).toBeNull();
  });

  it("server render equals the first client render (no persisted data leaks)", () => {
    const p = useChatStore.getState().addProject("Persisted Lab"); seed("Secret title", p);
    const html = renderToString(<AppShell>x</AppShell>);
    expect(html).not.toContain("Persisted Lab");
    expect(html).not.toContain("Secret title");
  });
});
