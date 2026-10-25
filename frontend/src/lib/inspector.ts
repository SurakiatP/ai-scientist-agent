import { create } from "zustand";

export type InspectorRef = { sessionId: string; turnId: string; refId: string };
type State = { ref: InspectorRef | null; open: (r: InspectorRef, opener?: HTMLElement | null) => void; close: () => void };

// The element that opened the inspector, so Esc/close can hand focus back to it.
let opener: HTMLElement | null = null;
// Markdown re-renders replace the opener node while the inspector is open; find its twin by href or aria-label.
const twin = (el: HTMLElement) => {
  const href = el.getAttribute("href"), label = el.getAttribute("aria-label");
  return document.querySelector<HTMLElement>(href ? `a[href="${CSS.escape(href)}"]` : label ? `[aria-label="${CSS.escape(label)}"]` : "#\0");
};

export const useInspector = create<State>()((set, get) => ({
  ref: null,
  open: (ref, el) => { opener = el ?? null; set({ ref }); },
  close: () => {
    if (!get().ref) return;
    set({ ref: null });
    const el = opener; opener = null;
    setTimeout(() => (el?.isConnected ? el : el && twin(el))?.focus(), 0); // after React re-renders: it may recreate the opener node
  },
}));
