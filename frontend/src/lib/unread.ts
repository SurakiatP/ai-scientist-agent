"use client";
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useChatStore, type Turn } from "./chat";
import { safeStorage } from "./history";

// Which sessions finished a run that this browser has not looked at yet. Per browser (there is no login), kept in localStorage.
export type Unread = { at: number; took: number }; // when the run finished, and how long it took (ms)
type State = { unread: Record<string, Unread>; markUnread: (id: string, u: Unread) => void; markRead: (id: string) => void };
const MAX = 50;
const ok = (v: unknown): v is Unread => !!v && typeof v === "object" && Number.isFinite((v as Unread).at) && Number.isFinite((v as Unread).took);

export const useUnread = create<State>()(
  persist(
    (set) => ({
      unread: {},
      markUnread: (id, u) => set((s) => ({ unread: Object.fromEntries(Object.entries({ ...s.unread, [id]: u }).sort((a, b) => b[1].at - a[1].at).slice(0, MAX)) })),
      markRead: (id) => set((s) => { if (!(id in s.unread)) return s; const { [id]: _gone, ...rest } = s.unread; void _gone; return { unread: rest }; }),
    }),
    {
      name: "scientist-unread-v1", version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ unread: s.unread }),
      merge: (p, cur) => { const u = (p as { unread?: unknown } | undefined)?.unread; return { ...cur, unread: u && typeof u === "object" ? Object.fromEntries(Object.entries(u).filter(([, v]) => ok(v))) : {} }; },
    },
  ),
);

// A run that ends with something to read. A run the user stopped, or that a restart interrupted, is not "finished".
const FINISHED = new Set<Turn["status"]>(["done", "refused", "error"]);
const watching = () => typeof document !== "undefined" && document.visibilityState === "visible";

/** Watches the chat store: a turn that goes running -> finished in a session nobody is looking at becomes "unread". */
export function watchFinished() {
  const seen = new Map<string, Turn["status"]>();
  let primed = false;
  const scan = () => {
    const { sessions, activeId } = useChatStore.getState();
    for (const s of sessions) for (const t of s.turns) {
      const before = seen.get(t.id);
      seen.set(t.id, t.status);
      if (primed && before === "running" && FINISHED.has(t.status) && !(s.id === activeId && watching())) {
        const at = Date.now();
        useUnread.getState().markUnread(s.id, { at, took: Math.max(0, at - t.createdAt) });
      }
    }
    if (activeId && watching()) useUnread.getState().markRead(activeId); // opening a session (or coming back to its tab) reads it
    primed = true;
  };
  scan();
  const un = useChatStore.subscribe(scan);
  document.addEventListener("visibilitychange", scan);
  return () => { un(); document.removeEventListener("visibilitychange", scan); };
}
if (typeof window !== "undefined") {
  watchFinished();
  window.addEventListener("storage", (e) => { if (e.key === "scientist-unread-v1") void useUnread.persist.rehydrate(); }); // another tab marked or cleared something
}

// One shared 1 s tick for every visible timer (running time, time since finished). It runs only while something listens.
const ticks = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = 0;
const subscribeTick = (f: () => void) => {
  ticks.add(f);
  if (!timer) { now = Date.now(); timer = setInterval(() => { now = Date.now(); ticks.forEach((g) => g()); }, 1000); }
  return () => { ticks.delete(f); if (!ticks.size && timer) { clearInterval(timer); timer = null; } };
};
/** Date.now(), refreshed every second while `on`. */
export function useNow(on: boolean): number {
  return useSyncExternalStore(on ? subscribeTick : () => () => {}, () => (on ? now || (now = Date.now()) : 0), () => 0);
}

/** "2 min 5 s" style span, compact. */
export function span(ms: number, u: { s: string; m: string; h: string }): string {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h} ${u.h} ${m} ${u.m}` : m ? `${m} ${u.m} ${s} ${u.s}` : `${s} ${u.s}`;
}
