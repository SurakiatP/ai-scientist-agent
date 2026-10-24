import { useSyncExternalStore } from "react";
import { useChatStore } from "./chat";
import { newId } from "./history";
import { usePrefs } from "./prefs";
import { emptyProgress, reduce, type Progress } from "./progress";
import { streamAsk, type AskEvent, type Reference } from "./sse";
import { strings } from "./strings";

type RunState = { sessionId: string | null; turnId: string | null };
const idle: RunState = { sessionId: null, turnId: null };
let state = idle; // module-level: survives navigation, never persisted
let ac: AbortController | null = null;
let leaving = false; // page unloading: the aborted fetch must not overwrite the stored run, so a reload reads "interrupted"
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true; });
  window.addEventListener("storage", (e) => { // another tab wrote the chats: adopt them, unless this tab is mid-run (its own state is newer)
    if (e.key === "scientist-chat-v1" && !state.turnId) void useChatStore.persist.rehydrate();
  });
  window.addEventListener("pageshow", (e) => {
    leaving = false;
    if (!e.persisted || state.turnId) return; // bfcache restore with no live run: any turn still stored as running is dead
    for (const s of useChatStore.getState().sessions) for (const t of s.turns) if (t.status === "running") useChatStore.getState().patchTurn(s.id, t.id, { status: "interrupted" });
  });
}
const subs = new Set<() => void>();
const setState = (s: RunState) => { state = s; subs.forEach((f) => f()); };

export const useRunState = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => idle);
export const canStart = (): { ok: true } | { ok: false; reason: "busy" } => (state.turnId ? { ok: false, reason: "busy" } : { ok: true });
export const stopRun = () => ac?.abort();

// The one place error events become user-facing text (stored in the current language).
export function errorText(e: Extract<AskEvent, { type: "error" }>): string {
  const t = strings[usePrefs.getState().lang];
  const m = e.code === "network" ? t.network : e.code === "malformed" ? t.malformed
    : e.code === "http" ? `${t.requestFailed}${e.message ? `: ${e.message}` : ""}` : e.message;
  return m.slice(0, 2048); // chat.ts read limit for turn.error
}
const cutOffText = () => strings[usePrefs.getState().lang].cutOff;

export async function startRun(sessionId: string, question: string): Promise<void> {
  if (!canStart().ok) throw new Error("busy");
  if (!useChatStore.getState().sessions.some((x) => x.id === sessionId)) throw new Error("no such session"); // before any state or stream
  const turnId = newId();
  const c = (ac = new AbortController());
  const store = () => useChatStore.getState();
  store().addTurn(sessionId, { id: turnId, question, createdAt: Date.now(), status: "running", progress: emptyProgress });
  setState({ sessionId, turnId });
  const patch = (p: Parameters<ReturnType<typeof store>["patchTurn"]>[2]) => { if (leaving) return; try { store().patchTurn(sessionId, turnId, p); } catch {} }; // storage must never abort a run
  let progress: Progress = emptyProgress;
  let final: { content: string; references: Reference[] } | null = null;
  let outcome: Parameters<typeof patch>[0] | null = null;
  try {
    for await (const e of streamAsk(question, c.signal)) {
      progress = reduce(progress, e);
      if (e.type === "final_answer") { final = { content: e.content, references: e.references }; outcome = { status: "done", answer: final }; }
      else if (e.type === "refused") outcome = { status: "refused", refused: e.reason };
      else if (e.type === "error") outcome = { status: "error", error: errorText(e) };
      patch(final && e.type === "final_answer" ? { progress, answer: final } : { progress });
    }
    patch({ progress, ...(outcome ?? (c.signal.aborted ? { status: "stopped" as const } : { status: "error" as const, error: cutOffText() })) });
  } catch {
    patch({ progress, status: c.signal.aborted ? "stopped" : "error", ...(c.signal.aborted ? {} : { error: cutOffText() }) });
  } finally {
    ac = null;
    setState(idle);
  }
}
