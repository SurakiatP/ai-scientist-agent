// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore, type Turn } from "@/lib/chat";
import { emptyProgress } from "@/lib/progress";
import { EmptyChat } from "./EmptyChat";
import { Thread } from "./Thread";

vi.mock("@/lib/run", () => ({ useRunState: () => ({ sessionId: null, turnId: null }), startRun: vi.fn(), stopRun: vi.fn(), approvePlan: vi.fn(), cancelPlan: vi.fn(), canStart: () => ({ ok: true }) }));

let n = 0;
const turn = (): Turn => ({ id: `t${n++}`, question: "Q", createdAt: 1, status: "done", progress: emptyProgress });
const add = (sid: string) => act(() => { useChatStore.getState().addTurn(sid, turn()); });
const arts = (c: HTMLElement) => [...c.querySelectorAll("article")];

beforeEach(() => { localStorage.clear(); useChatStore.getState().clearAll(); });
afterEach(cleanup);

describe("Thread entrance", () => {
  it("turns present on mount never animate; a turn added later does", () => {
    const sid = useChatStore.getState().newSession();
    add(sid); add(sid);
    const { container } = render(<Thread sessionId={sid} />);
    const [a, b] = arts(container);
    expect(a.className).toBe(b.className);
    const plain = a.className;
    add(sid);
    const all = arts(container);
    expect(all[0].className).toBe(plain);
    expect(all[2].className).not.toBe(plain);
  });

  it("the first turn after the empty state rises", () => {
    const sid = useChatStore.getState().newSession();
    const e = render(<EmptyChat sessionId={sid} />);
    e.unmount();
    add(sid);
    const { container } = render(<Thread sessionId={sid} />);
    const sid2 = useChatStore.getState().newSession();
    add(sid2);
    const other = render(<Thread sessionId={sid2} />);
    expect(arts(container)[0].className).not.toBe(arts(other.container)[0].className);
  });
});

describe("Thread follow", () => {
  const geometry = (el: HTMLElement, h: { sh: number; top: number }) => {
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => h.sh });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 500 });
    Object.defineProperty(el, "scrollTop", { configurable: true, get: () => h.top, set: (v) => { h.top = v; } });
  };
  it("keeps following while content grows; releases when the user scrolls up", () => {
    const sid = useChatStore.getState().newSession();
    add(sid);
    const { container } = render(<Thread sessionId={sid} />);
    const el = container.firstElementChild as HTMLElement, h = { sh: 1000, top: 500 };
    geometry(el, h);
    const patch = () => act(() => { const t = useChatStore.getState().sessions[0].turns[0]; useChatStore.getState().patchTurn(sid, t.id, { question: String(Math.random()) }); });
    fireEvent.scroll(el); // at the bottom
    h.sh = 2000; patch();
    expect(h.top).toBe(2000); // content grew: followed
    h.top = 100; fireEvent.scroll(el); // user scrolled up
    h.sh = 3000; patch();
    expect(h.top).toBe(100); // released
    add(sid);
    expect(h.top).toBe(3000); // a new message always follows
  });
});
