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

// --- Presigned previews (browser -> MinIO directly) ---
// A presigned URL is a bearer credential for ~5 minutes: keep it in component state only. Never store it, put it in
// the files store, or log it.
export type Presigned = { url: string; expiresIn: number; inline: boolean; kind: string; name: string };
export async function presignFile(id: string, signal?: AbortSignal): Promise<Presigned> {
  const b = await json(await call(`${id}/presign`, { method: "POST", signal }));
  if (typeof b.url !== "string" || !/^https?:\/\//.test(b.url) || typeof b.inline !== "boolean") throw new FileApiError(-1);
  return { url: b.url, expiresIn: typeof b.expires_in === "number" ? b.expires_in : 0, inline: b.inline, kind: typeof b.kind === "string" ? b.kind : "", name: typeof b.name === "string" ? b.name : "" };
}

// Same caps as the backend preview (routes_files.py).
const P_BYTES = 1 << 20, P_COLS = 30, P_CELL = 200, P_ROWS = 20;
const cell = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, P_CELL);

function csvRows(text: string, d: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === "") q = true;
    else if (c === d) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

export function parsePreview(text: string, kind: string, cut: boolean): Preview {
  text = text.replace(/^﻿/, "");
  if (kind === "json") {
    if (cut) throw new FileApiError(413);
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new FileApiError(422); }
    if (!Array.isArray(data) || !data.length || !data.every((r) => r && typeof r === "object" && !Array.isArray(r))) throw new FileApiError(422);
    const rows = (data as Record<string, unknown>[]).slice(0, P_ROWS);
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, P_COLS);
    return { columns: cols.map((c) => c.slice(0, P_CELL)), rows: rows.map((r) => cols.map((c) => cell(r[c]))), truncated: data.length > P_ROWS, total: data.length };
  }
  if (cut) text = text.slice(0, text.lastIndexOf("\n") + 1); // drop the half row at the cut
  const head = text.slice(0, 4096).split("\n")[0];
  const d = [",", ";", "\t", "|"].reduce((a, b) => (head.split(b).length > head.split(a).length ? b : a));
  const all = csvRows(text, d).filter((r) => r.length > 1 || r[0] !== "");
  const [header = [], ...data] = all;
  return { columns: header.slice(0, P_COLS).map(cell), rows: data.slice(0, P_ROWS).map((r) => r.slice(0, P_COLS).map(cell)), truncated: cut || data.length > P_ROWS, total: cut ? null : data.length };
}

// First 1 MB of a presigned csv/json. Needs the bucket's CORS. 403 = the link expired; status 0 = blocked or offline.
export async function fetchPresignedPreview(url: string, kind: string, signal: AbortSignal): Promise<Preview> {
  let res: Response;
  try { res = await fetch(url, { headers: { Range: `bytes=0-${P_BYTES - 1}` }, referrerPolicy: "no-referrer", credentials: "omit", signal }); } catch (e) {
    if (signal.aborted) throw e;
    throw new FileApiError(0);
  }
  if (!res.ok) throw new FileApiError(res.status);
  const text = await res.text();
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  const cut = res.status === 206 ? Number.isFinite(total) && total > P_BYTES : text.length >= P_BYTES;
  return parsePreview(text.slice(0, P_BYTES), kind, cut);
}
