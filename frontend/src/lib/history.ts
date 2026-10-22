import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
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

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRef = (r: unknown): r is Reference => {
  const x = r as Reference | null;
  const p = x?.paper;
  return (
    !!x && isStr(x.id) && ["verified", "unverified", "unknown"].includes(x.status) && !!p && isStr(p.title) &&
    Array.isArray(p.authors) && p.authors.every(isStr) && (p.year === null || isNum(p.year)) &&
    (p.doi === null || isStr(p.doi)) && (p.pmid === null || isStr(p.pmid)) && isStr(p.url)
  );
};
// Storage is user-editable (devtools) or corrupt: keep only well-formed items.
export const isItem = (v: unknown): v is HistoryItem => {
  const x = v as HistoryItem | null;
  return !!x && isStr(x.id) && isStr(x.question) && isStr(x.answer) && isNum(x.createdAt) &&
    (x.savedAt === undefined || isNum(x.savedAt)) && Array.isArray(x.references) && x.references.every(isRef);
};

// Cap: saved items are never dropped, so only unsaved ones count against the cap (oldest first).
// With 200+ saved items the list can exceed the cap; unsaved items are then all dropped.
export function cap(items: HistoryItem[]): HistoryItem[] {
  const extra = items.length - MAX_ITEMS;
  if (extra <= 0) return items;
  const drop = new Set(items.filter((i) => !i.savedAt).sort((a, b) => a.createdAt - b.createdAt).slice(0, extra).map((i) => i.id));
  return items.filter((i) => !drop.has(i.id));
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
      add: (item) => set((s) => ({ items: cap([item, ...s.items.filter((i) => i.id !== item.id)]) })),
      toggleSaved: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, savedAt: i.savedAt ? undefined : Date.now() } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "scientist-history-v1",
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
