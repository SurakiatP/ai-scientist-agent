"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage, useHydrated } from "./history";
import { strings, type Lang, type Strings } from "./strings";

type State = { lang: Lang; setLang: (l: Lang) => void };

export const usePrefs = create<State>()(
  persist(
    (set) => ({ lang: "th", setLang: (lang) => set({ lang }) }),
    {
      name: "scientist-prefs-v1",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      partialize: (s) => ({ lang: s.lang }),
      // unknown/garbage values fall back to th
      merge: (p, cur) => ({ ...cur, ...(p as object | null), lang: (p as { lang?: unknown } | null)?.lang === "en" ? "en" : "th" }),
    },
  ),
);

// Thai during SSR/first render, so persisted language never causes a hydration mismatch.
export function useT(): Strings {
  const lang = usePrefs((s) => s.lang);
  const hydrated = useHydrated();
  const l = hydrated ? lang : "th";
  useEffect(() => { document.documentElement.lang = l; }, [l]);
  return strings[l];
}
