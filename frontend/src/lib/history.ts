import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Reference } from "./sse";

export type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  references: Reference[];
  savedAt?: number;
  createdAt: number;
};

export const MAX_ITEMS = 200;

const isStr = (v: unknown, max = Infinity): v is string => typeof v === "string" && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optStr = (v: unknown) => v === null || isStr(v, 2048);
const isRef = (r: unknown): r is Reference => {
  const x = r as Reference | null;
  const p = x?.paper;
  return (
    !!x && isStr(x.id, 20) && ["verified", "unverified", "unknown"].includes(x.status) && !!p && isStr(p.title, 500) &&
    Array.isArray(p.authors) && p.authors.length <= 50 && p.authors.every((a) => isStr(a, 200)) &&
    (p.year === null || isNum(p.year)) && optStr(p.doi) && optStr(p.pmid) && isStr(p.url, 2048)
  );
};
// Storage is user-editable (devtools) or corrupt: keep only well-formed, size-bounded items (dropped, never truncated).
export const isItem = (v: unknown): v is HistoryItem => {
  const x = v as HistoryItem | null;
  return !!x && isStr(x.id, 100) && isStr(x.question, 4000) && isStr(x.answer, 200_000) && isNum(x.createdAt) &&
    (x.savedAt === undefined || isNum(x.savedAt)) && Array.isArray(x.references) && x.references.length <= 200 && x.references.every(isRef);
};

// Storage that never throws (quota, disabled, blocked). In-memory state stays authoritative; a corrupt
// value reads as null and is overwritten by the next successful write.
export const safeStorage = {
  getItem: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  removeItem: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

export const newId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Array.from(crypto.getRandomValues(new Uint32Array(3)), (n) => n.toString(36)).join("")}`;

// Cap: saved items are never dropped, so only unsaved ones count against the cap (oldest first).
// With 200+ saved items the list can exceed the cap; unsaved items are then all dropped.
export function cap(items: HistoryItem[]): HistoryItem[] {
  const extra = items.length - MAX_ITEMS;
  if (extra <= 0) return items;
  // items are newest-first, so on equal createdAt the higher index is older
  const drop = new Set(
    items.map((it, idx) => ({ it, idx })).filter((x) => !x.it.savedAt)
      .sort((a, b) => a.it.createdAt - b.it.createdAt || b.idx - a.idx).slice(0, extra).map((x) => x.it),
  );
  return items.filter((i) => !drop.has(i));
}

type State = {
  items: HistoryItem[]; // newest first
  add: (item: HistoryItem) => void;
  toggleSaved: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useHistoryStore = create<State>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const prev = s.items.find((i) => i.id === item.id); // duplicate id: keep the one entry and its savedAt
          return { items: cap([prev?.savedAt ? { ...item, savedAt: prev.savedAt } : item, ...s.items.filter((i) => i.id !== item.id)]) };
        }),
      toggleSaved: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, savedAt: i.savedAt ? undefined : Date.now() } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "scientist-history-v1",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      // Add `if (version < 2) {...}` steps here when the shape changes. v1 is current; older/unknown
      // versions pass through and are still filtered by isItem in merge, so they can never crash.
      migrate: (state) => state as State,
      partialize: (s) => ({ items: s.items }),
      merge: (persisted, current) => {
        const raw = (persisted as { items?: unknown } | null)?.items;
        return { ...current, items: Array.isArray(raw) ? cap(raw.filter(isItem)) : [] };
      },
    },
  ),
);

// false on the server and on the first client render, so persisted data never causes a hydration mismatch.
export const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);
