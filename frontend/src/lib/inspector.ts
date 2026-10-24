import { create } from "zustand";

export type InspectorRef = { sessionId: string; turnId: string; refId: string };
type State = { ref: InspectorRef | null; open: (r: InspectorRef, opener?: HTMLElement | null) => void; close: () => void };

// The element that opened the inspector, so Esc/close can hand focus back to it.
let opener: HTMLElement | null = null;

export const useInspector = create<State>()((set, get) => ({
  ref: null,
  open: (ref, el) => { opener = el ?? null; set({ ref }); },
  close: () => {
    if (!get().ref) return;
    set({ ref: null });
    const el = opener; opener = null;
    if (el?.isConnected) el.focus();
  },
}));
