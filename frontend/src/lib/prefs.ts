"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage, useHydrated } from "./history";
import { strings, type Lang, type Strings } from "./strings";

type State = { lang: Lang; setLang: (l: Lang) => void; sidebarCollapsed: boolean; setSidebarCollapsed: (c: boolean) => void };

export const usePrefs = create<State>()(
  persist(
    (set) => ({ lang: "th", setLang: (lang) => set({ lang }), sidebarCollapsed: false, setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }) }),
    {
      name: "scientist-prefs-v1",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      partialize: (s) => ({ lang: s.lang, sidebarCollapsed: s.sidebarCollapsed }),
      // unknown/garbage values fall back to defaults (th, expanded)
      merge: (p, cur) => {
        const x = (p ?? {}) as { lang?: unknown; sidebarCollapsed?: unknown };
        return { ...cur, lang: x.lang === "en" ? "en" : "th", sidebarCollapsed: x.sidebarCollapsed === true };
      },
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
