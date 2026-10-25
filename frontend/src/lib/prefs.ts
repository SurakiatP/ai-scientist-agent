"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage, useHydrated } from "./history";
import { strings, type Lang, type Strings } from "./strings";

type State = {
  lang: Lang; setLang: (l: Lang) => void;
  sidebarCollapsed: boolean; setSidebarCollapsed: (c: boolean) => void;
  reviewPlan: boolean; setReviewPlan: (v: boolean) => void;
};

export const usePrefs = create<State>()(
  persist(
    (set) => ({
      lang: "th", setLang: (lang) => set({ lang }),
      sidebarCollapsed: false, setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      reviewPlan: true, setReviewPlan: (reviewPlan) => set({ reviewPlan }),
    }),
    {
      name: "scientist-prefs-v1",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      partialize: (s) => ({ lang: s.lang, sidebarCollapsed: s.sidebarCollapsed, reviewPlan: s.reviewPlan }),
      // unknown/garbage values fall back to defaults (th, expanded, review on)
      merge: (p, cur) => {
        const x = (p ?? {}) as { lang?: unknown; sidebarCollapsed?: unknown; reviewPlan?: unknown };
        return {
          ...cur, lang: x.lang === "en" ? "en" : "th", sidebarCollapsed: x.sidebarCollapsed === true,
          reviewPlan: x.reviewPlan !== false, // only an explicit opt-out disables the plan pause
        };
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
