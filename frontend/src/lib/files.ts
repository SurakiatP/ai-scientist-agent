import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { API_BASE } from "./config";
import { PERSONAL } from "./chat";
import { safeStorage } from "./history";

// The file LIST lives in this browser (there is no login, so no server-side owner); the server only serves a file to
// whoever knows its unguessable id. An entry is a pointer, never the bytes.
export type FileEntry = { id: string; name: string; size: number; kind: string; createdAt: number; projectId: string };

export const MAX_FILES = 500;
export const ANALYZABLE = ["csv", "xlsx", "parquet", "json"];
const ID = /^[0-9a-f]{32}$/, NAME_MAX = 120;

const isStr = (v: unknown, max = Infinity): v is string => typeof v === "string" && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isFileEntry = (v: unknown): v is FileEntry => {
  const x = v as FileEntry | null;
  return !!x && typeof x === "object" && isStr(x.id, 32) && ID.test(x.id) && isStr(x.name, NAME_MAX) && x.name !== "" &&
    isNum(x.size) && x.size >= 0 && isStr(x.kind, 10) && isNum(x.createdAt) && isStr(x.projectId, 100);
};

export const kindOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");
// Write side: clamp to the read limits so a persisted entry always reloads.
const clamp = (e: FileEntry): FileEntry => ({ ...e, name: e.name.slice(0, NAME_MAX), kind: e.kind.slice(0, 10), projectId: e.projectId.slice(0, 100) });
const cap = (l: FileEntry[]) => [...l].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_FILES);

type State = {
  files: FileEntry[];
  add: (e: FileEntry) => void;
  rename: (id: string, name: string) => void;
  move: (id: string, projectId: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
};

export const useFilesStore = create<State>()(
  persist(
    (set) => ({
      files: [],
      add: (e) => set((s) => ({ files: cap([clamp(e), ...s.files.filter((x) => x.id !== e.id)]) })),
      rename: (id, name) => set((s) => ({ files: s.files.map((x) => (x.id === id ? clamp({ ...x, name, kind: kindOf(name) || x.kind }) : x)) })),
      move: (id, projectId) => set((s) => ({ files: s.files.map((x) => (x.id === id ? clamp({ ...x, projectId }) : x)) })),
      remove: (id) => set((s) => ({ files: s.files.filter((x) => x.id !== id) })),
      clearAll: () => set({ files: [] }),
    }),
    {
      name: "scientist-files-v1",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      migrate: (state) => state as State,
      partialize: (s) => ({ files: s.files }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const seen = new Set<string>();
        const files = cap((Array.isArray(p.files) ? p.files.filter(isFileEntry) : []).filter((x) => !seen.has(x.id) && !!seen.add(x.id)));
        return { ...current, files };
      },
    },
  ),
);

// Register a fresh upload. Removing the composer's attachment chip never calls remove().
export const registerUpload = (up: { id: string; name: string; size: number }, projectId = PERSONAL) =>
  useFilesStore.getState().add({ id: up.id, name: up.name, size: up.size, kind: kindOf(up.name), createdAt: Date.now(), projectId });

// "Analyze" hands a library file to the composer without uploading again. In memory only.
export const useAttach = create<{ file: { id: string; name: string; size: number } | null }>(() => ({ file: null }));

// Same rules as the server (PATCH /v1/files/{id}) so most mistakes are caught before the request.
export type NameProblem = "empty" | "long" | "chars" | "ext";
export function checkName(raw: string, kind: string): { name: string } | { problem: NameProblem } {
  const name = raw.replace(/\\/g, "/").split("/").pop()!.trim();
  if (!name) return { problem: "empty" };
  if (name.length > NAME_MAX) return { problem: "long" };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { problem: "chars" };
  if (!name.includes(".") || kindOf(name) !== kind) return { problem: "ext" };
  return { name };
}

// status 0 = the server was unreachable
export class FileApiError extends Error {
  constructor(readonly status: number) { super(`file api ${status}`); this.name = "FileApiError"; }
}
async function call(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetch(`${API_BASE}/v1/files/${path}`, init); } catch (e) {
    if (init?.signal?.aborted) throw e;
    throw new FileApiError(0);
  }
  if (!res.ok) throw new FileApiError(res.status);
  return res;
}
const json = async (res: Response): Promise<Record<string, unknown>> => {
  try { const b = await res.json(); if (b && typeof b === "object") return b; } catch {}
  throw new FileApiError(-1); // 2xx with an unreadable body
};

export type FileMeta = { id: string; name: string; size: number; kind: string };
const toMeta = (b: Record<string, unknown>): FileMeta => {
  if (typeof b.id !== "string" || typeof b.name !== "string" || typeof b.size !== "number" || typeof b.kind !== "string") throw new FileApiError(-1);
  return { id: b.id, name: b.name, size: b.size, kind: b.kind };
};
export const fetchMeta = async (id: string, signal?: AbortSignal) => toMeta(await json(await call(`${id}/meta`, { signal })));
export const renameFile = async (id: string, name: string) =>
  toMeta(await json(await call(id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })));
export const deleteFile = async (id: string) => { await call(id, { method: "DELETE" }); };
export const downloadUrl = (id: string) => `${API_BASE}/v1/files/${id}`;

export type Preview = { columns: string[]; rows: string[][]; truncated: boolean; total: number | null };
export async function fetchPreview(id: string, signal: AbortSignal): Promise<Preview> {
  const b = await json(await call(`${id}/preview?rows=20`, { signal }));
  const ok = Array.isArray(b.columns) && b.columns.every((c) => typeof c === "string") && Array.isArray(b.rows) &&
    b.rows.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string")) && typeof b.truncated === "boolean";
  if (!ok) throw new FileApiError(-1);
  return { columns: b.columns as string[], rows: b.rows as string[][], truncated: b.truncated as boolean, total: typeof b.total_rows === "number" ? b.total_rows : null };
}
