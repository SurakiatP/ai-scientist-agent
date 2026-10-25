import { API_BASE } from "./config";
import { isFileEntry, type FileEntry } from "./files";
import { isProject, isSession, isTurn, PERSONAL, type Project, type Session, type Turn } from "./chat";
import { safeStorage } from "./history";
import { turnBody } from "./sync";

// The data an earlier, browser-only version left in localStorage. Read-only until the user presses import.
export const OLD_KEYS = ["scientist-chat-v1", "scientist-files-v1", "scientist-history-v1"] as const;
export const CHUNK_BYTES = 4_000_000; // server cap is 10 MB per request

export type OldData = { projects: Project[]; sessions: Session[]; files: FileEntry[] };
export type OldSummary = { projects: number; sessions: number; turns: number; files: number };

const read = (key: string): Record<string, unknown> | null => {
  try { const v = JSON.parse(safeStorage.getItem(key) ?? "null"); return v && typeof v === "object" ? (v.state ?? null) : null; } catch { return null; }
};
export function readOld(): OldData {
  const chat = read("scientist-chat-v1"), files = read("scientist-files-v1");
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    projects: list(chat?.projects).filter(isProject).filter((p) => p.id !== PERSONAL),
    sessions: list(chat?.sessions).filter(isSession).map((s) => ({ ...s, turns: s.turns.filter(isTurn) })),
    files: list(files?.files).filter(isFileEntry),
  };
}
export const summarize = (d: OldData): OldSummary => ({ projects: d.projects.length, sessions: d.sessions.length, turns: d.sessions.reduce((n, s) => n + s.turns.length, 0), files: d.files.length });

const iso = (ms: number) => new Date(ms).toISOString();
const turnRow = (t: Turn, idx: number) => ({ id: t.id, ...turnBody(t.status === "running" ? { ...t, status: "interrupted" } : t, idx), created_at: iso(t.createdAt) });
const sessionRow = (s: Session) => ({ id: s.id, title: s.title, project_id: s.projectId === PERSONAL ? null : s.projectId, created_at: iso(s.createdAt), updated_at: iso(s.updatedAt), turns: s.turns.map(turnRow) });
const bytes = (v: unknown) => new Blob([JSON.stringify(v)]).size;

/** Batches in send order: projects and files first (sessions need their projects), then sessions packed up to maxBytes. */
export function chunks(d: OldData, maxBytes = CHUNK_BYTES): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{
    projects: d.projects.map((p) => ({ id: p.id, name: p.name, created_at: iso(p.createdAt) })),
    files: d.files.map((f) => ({ id: f.id, name: f.name, size: f.size, kind: f.kind, project_id: f.projectId === PERSONAL ? null : f.projectId, added_at: iso(f.createdAt) })),
  }];
  let cur: unknown[] = [], size = 0;
  for (const s of d.sessions.map(sessionRow)) {
    const n = bytes(s);
    if (cur.length && size + n > maxBytes) { out.push({ sessions: cur }); cur = []; size = 0; }
    cur.push(s); size += n;
  }
  if (cur.length) out.push({ sessions: cur });
  return out;
}

export type ImportResult = { imported: number; skipped: number; projects: number; sessions: number; turns: number; files: number };
/** POST every chunk. Idempotent: the server skips ids it already has, so pressing it again only reports them as skipped. */
export async function importOld(d: OldData, onProgress?: (done: number, total: number) => void, maxBytes = CHUNK_BYTES): Promise<ImportResult> {
  const parts = chunks(d, maxBytes);
  const sum: ImportResult = { imported: 0, skipped: 0, projects: 0, sessions: 0, turns: 0, files: 0 };
  onProgress?.(0, parts.length);
  for (const [i, body] of parts.entries()) {
    const res = await fetch(`${API_BASE}/v1/store/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(String(res.status));
    const n = await res.json() as Partial<ImportResult>;
    for (const k of ["projects", "sessions", "turns", "files"] as const) { sum[k] += n[k] ?? 0; sum.imported += n[k] ?? 0; }
    onProgress?.(i + 1, parts.length);
  }
  const t = summarize(d); // the server skips what it already holds without counting it, so skipped = sent - imported
  sum.skipped = Math.max(0, t.projects + t.sessions + t.turns + t.files - sum.imported);
  return sum;
}

export const clearOld = () => OLD_KEYS.forEach((k) => safeStorage.removeItem(k));
