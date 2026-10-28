import { create } from "zustand";
import { API_BASE, DEFER_HYDRATION, gate } from "./config";
import { capSessions, isProject, isSession, isTurn, MAX_SESSIONS, PERSONAL, personal, useChatStore, type Project, type RefusalCode, type Session, type Turn } from "./chat";
import { isFileEntry, useFilesStore, type FileEntry } from "./files";
import { safeStorage } from "./history";
import { emptyProgress } from "./progress";
import { attachRunning, isAttached, runningTurnId } from "./run";

// Shared-data sync. When /v1/health says db "ok", Postgres is the source of truth and the zustand stores are only a UI
// cache: every store change is diffed into a small op queue (key + id only, bodies are built from the cache at send
// time, so a replay is an idempotent PUT of the latest state). When the database is off, none of this runs and the app
// behaves exactly like the browser-only version.
export type SyncStatus = "disabled" | "connecting" | "online" | "offline" | "conflict";
type Kind = "project" | "session" | "file" | "turn";
type Op = { k: Kind; id: string; sid?: string; idx?: number; a: "put" | "del" | "restore" }; // a turn "del" = remove from position `idx` on (edited message)
type Row = Record<string, unknown>;
export type Notice = "conflict" | "remote" | "queueFull" | null;

export const useSync = create<{
  status: SyncStatus; ready: boolean; lastSyncAt: number | null; pending: number; notice: Notice; noticeAt: number;
  hasMore: boolean; rev: number; undo: { kind: Kind; id: string; at: number } | null;
}>(() => ({ status: DEFER_HYDRATION ? "connecting" : "disabled", ready: !DEFER_HYDRATION, lastSyncAt: null, pending: 0, notice: null, noticeAt: 0, hasMore: false, rev: 0, undo: null }));
const set = useSync.setState;
const notify = (n: Notice) => set({ notice: n, noticeAt: Date.now() });
export const dismissNotice = () => set({ notice: null });

const QUEUE_KEY = "scientist-queue-v1", ACTIVE_KEY = "scientist-active-v1";
export const QUEUE_MAX = 500; // ponytail: spec says 200; a "delete all chats" is up to 230 soft deletes in one go
export const TURN_GAP_MS = 1000; // a running turn is written at most once per second
const STALE_RUNNING_MS = 10 * 60_000;

let queue: Op[] = [];
let versions = new Map<string, number>(); // "kind:id" -> server version
const maxIdx = new Map<string, number>(); // session -> highest turn idx seen (never lowers, so a re-asked turn never reuses an idx)
const idxOf = new Map<string, number>(); // turn -> idx
const tombstones = new Set<string>(); // truncated turns the server may still hold (no turn delete route)
const lastTurnSend = new Map<string, number>();
let inflight: Op | null = null;
let releases: (() => void)[] = []; // store subscriptions and window listeners, released by the test reset
let applying = false, pumping = false, started = false, blockedUntil = 0, delay = 1000;
let timer: ReturnType<typeof setTimeout> | undefined, snapTimer: ReturnType<typeof setTimeout> | undefined, es: EventSource | null = null, limit = MAX_SESSIONS;

const vkey = (k: Kind, id: string) => `${k}:${id}`;
const ms = (v: unknown) => { const n = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(n) ? n : Date.now(); };
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const isFileId = (v: string) => /^[0-9a-f]{32}$/.test(v);
export const validId = (k: Kind, v: string) => (k === "file" ? isFileId(v) : isUuid(v)); // ids are checked before they reach a URL

const save = () => {
  try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {}
  set({ pending: queue.length });
};
const load = () => {
  try {
    const q = JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? "[]");
    if (Array.isArray(q)) queue = q.filter((o): o is Op => !!o && ["project", "session", "file", "turn"].includes(o.k) && ["put", "del", "restore"].includes(o.a) && typeof o.id === "string" && validId(o.k, o.id) && (o.idx === undefined || (Number.isInteger(o.idx) && o.idx >= 0 && o.idx <= 100000))).slice(0, QUEUE_MAX);
  } catch {}
};

function enqueue(op: Op) {
  if (op.a === "put") queue = queue.filter((o) => !(o.k === op.k && o.id === op.id && o.a === "del")); // re-created: the pending delete is moot
  if (op.a === "put" && queue.some((o) => o !== inflight && o.k === op.k && o.id === op.id && o.a === "put")) return save(); // coalesce: body is built at send time
  if (op.a === "del") queue = queue.filter((o) => !(o.a === "put" && ((o.k === op.k && o.id === op.id) || (op.k === "session" && o.sid === op.id))));
  if (queue.length >= QUEUE_MAX) { notify("queueFull"); return save(); }
  queue.push(op);
  save();
  void pump();
}

// --- row <-> cache --------------------------------------------------------------------------------------------------
export const toTurn = (r: Row): Turn | null => {
  const prog = (r.progress && typeof r.progress === "object" && !Array.isArray(r.progress) ? { ...(r.progress as Row) } : {}) as Row;
  const code = prog._code; delete prog._code;
  const err = prog._err; delete prog._err;
  const runId = typeof r.run_id === "string" && isUuid(r.run_id) ? r.run_id : undefined;
  const analysis = r.mode === "analysis";
  let status = str(r.status) as Turn["status"];
  if (status === "running" && !runId && Date.now() - ms(r.updated_at) > STALE_RUNNING_MS) status = "interrupted"; // its tab died mid-run (a server run says so itself)
  const t = {
    id: str(r.id), question: str(r.question), createdAt: ms(r.created_at), status, progress: { ...emptyProgress, ...prog } as Turn["progress"],
    ...(r.mode === "deep" || r.mode === "quick" || r.mode === "chat" ? { mode: r.mode } : {}),
    ...(analysis ? { kind: "analysis" as const } : {}),
    ...(runId ? { runId } : {}), ...(err === "cut_off" || err === "failed" || err === "interrupted" || err === "stopped" ? { errCode: err } : {}),
    ...(r.plan ? { plan: r.plan } : {}), ...(r.answer ? { answer: r.answer } : {}), ...(r.analysis ? { analysis: r.analysis } : {}),
    ...(r.refused ? { refused: str(r.refused) } : {}), ...(typeof code === "string" ? { refusedCode: code as RefusalCode } : {}), ...(r.error ? { error: str(r.error) } : {}),
  } as Turn;
  return isTurn(t) ? t : null;
};
export const turnBody = (t: Turn, idx: number) => ({
  idx, question: t.question.slice(0, 4000), mode: t.kind === "analysis" ? "analysis" : t.mode ?? null, status: t.status,
  answer: t.answer ?? null, progress: t.refusedCode ? { ...t.progress, _code: t.refusedCode } : t.progress, plan: t.plan ?? null, analysis: t.analysis ?? null,
  refused: t.refused ?? null, error: t.error ?? null,
});
const toSession = (r: Row, local?: Session): Session => {
  const id = str(r.id);
  const rows = (Array.isArray(r.turns) ? (r.turns as Row[]) : []).filter((x) => !tombstones.has(str(x.id))).sort((a, b) => Number(a.idx) - Number(b.idx));
  rows.forEach((x) => { idxOf.set(str(x.id), Number(x.idx)); maxIdx.set(id, Math.max(maxIdx.get(id) ?? -1, Number(x.idx))); versions.set(vkey("turn", str(x.id)), Number(x.version)); });
  const turns = rows.map((x) => {
    const mine = local?.turns.find((t) => t.id === x.id);
    return mine && (isAttached(mine.id) || runningTurnId() === mine.id || queue.some((o) => o.k === "turn" && o.id === mine.id)) ? mine : toTurn(x);
  }).filter((t): t is Turn => !!t);
  if (r.has_more_turns === true && local && rows.length) { // the server sent only the newest turns: keep the older ones we already hold
    const first = Number(rows[0].idx);
    turns.unshift(...local.turns.filter((t) => (idxOf.get(t.id) ?? Infinity) < first && !tombstones.has(t.id)));
  }
  // a question just sent from this tab, shown before the server has its row: a snapshot must not wipe it
  if (local) turns.push(...local.turns.filter((t) => isAttached(t.id) && !turns.some((x) => x.id === t.id) && !tombstones.has(t.id)));
  return { id, projectId: typeof r.project_id === "string" ? r.project_id : PERSONAL, title: str(r.title), createdAt: ms(r.created_at), updatedAt: ms(r.updated_at), turns };
};
const toProject = (r: Row): Project => ({ id: str(r.id), name: str(r.name), createdAt: ms(r.created_at) });
const toFile = (r: Row): FileEntry => ({ id: str(r.id), name: str(r.name), size: Number(r.size) || 0, kind: str(r.kind).slice(0, 10), createdAt: ms(r.added_at), projectId: typeof r.project_id === "string" ? r.project_id : PERSONAL });
const remember = (k: Kind, r: Row) => { if (typeof r.id === "string" && typeof r.version === "number") versions.set(vkey(k, r.id), r.version); };

// Store changes that come from the server must not echo back as writes.
function quiet(f: () => void) { applying = true; try { f(); } finally { applying = false; } }
const pendingFor = (k: Kind, id: string) => queue.some((o) => o.k === k && o.id === id && o.a !== "restore");

function merge(snap: Row, first: boolean) {
  const sessions = (Array.isArray(snap.sessions) ? snap.sessions : []) as Row[];
  const projects = (Array.isArray(snap.projects) ? snap.projects : []) as Row[];
  const files = (Array.isArray(snap.files) ? snap.files : []) as Row[];
  const cur = useChatStore.getState();
  const before = cur.sessions.find((s) => s.id === cur.activeId);
  projects.forEach((r) => remember("project", r)); sessions.forEach((r) => remember("session", r)); files.forEach((r) => remember("file", r));
  const sp = projects.map(toProject).filter(isProject).filter((p) => p.id !== PERSONAL);
  const sids = new Set(sessions.map((r) => str(r.id)));
  const nextProjects = [personal, ...sp.map((p) => (pendingFor("project", p.id) ? cur.projects.find((x) => x.id === p.id) ?? p : p)), ...cur.projects.filter((p) => p.id !== PERSONAL && !sp.some((x) => x.id === p.id) && pendingFor("project", p.id))];
  const pids = new Set(nextProjects.map((p) => p.id));
  const fromServer = sessions.map((r) => {
    const local = cur.sessions.find((s) => s.id === r.id);
    const busy = !!local && (pendingFor("session", local.id) || queue.some((o) => o.k === "turn" && o.sid === local.id && o.a === "put"));
    const s = toSession(r, local);
    return busy && local ? { ...s, title: local.title, projectId: local.projectId, turns: local.turns.length >= s.turns.length ? local.turns : s.turns } : s;
  }).filter(isSession).map((s) => (pids.has(s.projectId) ? s : { ...s, projectId: PERSONAL }));
  const localOnly = cur.sessions.filter((s) => !sids.has(s.id) && (pendingFor("session", s.id) || (!s.title && !s.turns.length))); // unsent or blank; anything else was deleted elsewhere
  const next = capSessions([...fromServer, ...localOnly]);
  const active = next.find((s) => s.id === cur.activeId);
  const fileRows = files.map(toFile).filter(isFileEntry);
  quiet(() => {
    useChatStore.setState({ projects: nextProjects, sessions: next, activeId: active ? active.id : null, activeProjectId: pids.has(cur.activeProjectId) ? cur.activeProjectId : PERSONAL });
    const pf = useFilesStore.getState().files;
    useFilesStore.setState({ files: [...fileRows, ...pf.filter((f) => pendingFor("file", f.id) && !fileRows.some((x) => x.id === f.id))] });
  });
  set({ hasMore: sessions.length >= limit, rev: useSync.getState().rev + 1 });
  attachRunning(); // runs the server is still working on: follow them, whoever started them
  const after = next.find((s) => s.id === cur.activeId);
  if (!first && before && after && JSON.stringify(before) !== JSON.stringify(after) && runningTurnId() === null) notify("remote");
}

// --- network --------------------------------------------------------------------------------------------------------
class Net extends Error { constructor(readonly status: number, readonly body?: Row, readonly retryAfter = 0) { super(`sync ${status}`); } }
async function call(method: string, path: string, body?: unknown, keepalive = false): Promise<Row> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, keepalive, ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: "{}" }) });
  } catch { throw new Net(0); }
  let json: Row = {};
  try { const b = await res.json(); if (b && typeof b === "object") json = b as Row; } catch {}
  if (!res.ok) throw new Net(res.status, json, Number(res.headers.get("Retry-After")) || 0);
  return json;
}
const path = (o: Op) => {
  const base = { project: "projects", session: "sessions", file: "files", turn: `sessions/${o.sid}/turns` }[o.k];
  return `/v1/store/${base}/${o.id}`;
};
function build(o: Op): unknown | null {
  const v = versions.get(vkey(o.k, o.id));
  const st = useChatStore.getState();
  if (o.k === "project") { const p = st.projects.find((x) => x.id === o.id); return p && { name: p.name || "-", ...(v ? { version: v } : {}) }; }
  if (o.k === "session") { const s = st.sessions.find((x) => x.id === o.id); return s && { title: s.title || null, project_id: s.projectId === PERSONAL ? null : s.projectId, ...(v ? { version: v } : {}) }; }
  if (o.k === "file") { const f = useFilesStore.getState().files.find((x) => x.id === o.id); return f && { name: f.name, size: f.size, kind: f.kind, project_id: f.projectId === PERSONAL ? null : f.projectId, ...(v ? { version: v } : {}) }; }
  const t = st.sessions.find((x) => x.id === o.sid)?.turns.find((x) => x.id === o.id);
  if (!t || t.runId) return null; // a run's turn is written by the server only
  if (!idxOf.has(t.id)) { const n = (maxIdx.get(o.sid!) ?? -1) + 1; idxOf.set(t.id, n); maxIdx.set(o.sid!, n); }
  return turnBody(t, idxOf.get(t.id)!);
}

function adopt(o: Op, current: Row) { // 409: someone else saved first. Keep their version, say so calmly.
  remember(o.k, current);
  quiet(() => {
    if (o.k === "session") { const n = toSession(current, useChatStore.getState().sessions.find((x) => x.id === o.id)); useChatStore.setState((s) => ({ sessions: s.sessions.map((x) => (x.id === o.id ? { ...n, turns: x.turns } : x)) })); }
    else if (o.k === "project") useChatStore.setState((s) => ({ projects: s.projects.map((x) => (x.id === o.id ? toProject(current) : x)) }));
    else if (o.k === "file") useFilesStore.setState((s) => ({ files: s.files.map((x) => (x.id === o.id ? toFile(current) : x)) }));
  });
  notify("conflict");
  set({ status: "conflict" });
  setTimeout(() => { if (useSync.getState().status === "conflict") set({ status: "online" }); }, 6000);
}

type Out = "ok" | "drop" | "retry";
async function send(o: Op, keepalive = false): Promise<Out> {
  if (!validId(o.k, o.id) || (o.sid && !isUuid(o.sid))) return "drop";
  try {
    if (o.a === "del" && o.k === "turn") { // the server has one route: remove this position and everything after it
      if (o.idx === undefined) return "ok"; // it never reached the server
      await call("DELETE", `/v1/store/sessions/${o.sid}/turns/from/${o.idx}`);
      return "ok";
    }
    if (o.a === "del") { await call("DELETE", path(o)); versions.delete(vkey(o.k, o.id)); return "ok"; }
    if (o.a === "restore") { await call("POST", `${path(o)}/restore`); return "ok"; }
    const body = build(o);
    if (body === null) return "ok"; // gone from the cache meanwhile
    const row = await call("PUT", path(o), body, keepalive);
    remember(o.k, row);
    return "ok";
  } catch (e) {
    if (!(e instanceof Net)) return "drop";
    if (e.status === 409 && e.body?.current && typeof e.body.current === "object") { adopt(o, e.body.current as Row); return "drop"; }
    if (e.status === 404 && o.a === "del") return "ok";
    if (e.status === 410) { // an edit removed this turn on the server: our copy is stale, drop it quietly
      if (o.k === "turn") { tombstones.add(o.id); idxOf.delete(o.id); versions.delete(vkey("turn", o.id)); quiet(() => useChatStore.setState((s) => ({ sessions: s.sessions.map((x) => (x.id === o.sid ? { ...x, turns: x.turns.filter((t) => t.id !== o.id) } : x)) }))); }
      return "drop";
    }
    if (e.status === 404 && o.k === "turn" && o.a === "del") return "ok";
    if (e.status === 405) return "ok";
    if (e.status === 429) { blockedUntil = Date.now() + Math.min(60, Math.max(1, e.retryAfter || 5)) * 1000; return "retry"; }
    if (e.status === 0 || e.status >= 500) return "retry";
    if (e.status === 422 || e.status === 404 || e.status === 409) snapSoon(); // our cache and the server disagree: realign
    return "drop";
  }
}

export async function pump(): Promise<void> {
  if (pumping || useSync.getState().status === "disabled") return;
  pumping = true;
  try {
    while (queue.length) {
      const wait = blockedUntil - Date.now();
      if (wait > 0) { later(wait); break; }
      const o = queue[0];
      if (o.k === "turn" && o.a === "put") { // coalesce a running turn to one write per second; anything else goes at once
        const t = useChatStore.getState().sessions.find((x) => x.id === o.sid)?.turns.find((x) => x.id === o.id);
        const gap = TURN_GAP_MS - (Date.now() - (lastTurnSend.get(o.id) ?? 0));
        if (t?.status === "running" && gap > 0) { later(gap); break; }
        lastTurnSend.set(o.id, Date.now());
      }
      inflight = o;
      const r = await send(o);
      inflight = null;
      if (r === "retry") { goOffline(); break; }
      queue = queue.filter((x) => x !== o); save();
      if (useSync.getState().status === "offline") { set({ status: "online" }); delay = 1000; }
    }
    if (!queue.length && useSync.getState().status === "offline") void snapshot(); // the quietest probe there is
  } finally { pumping = false; }
}
function later(ms_: number) { clearTimeout(timer); timer = setTimeout(() => void pump(), ms_); }
function goOffline() {
  if (useSync.getState().status !== "disabled") set({ status: "offline" });
  clearTimeout(timer);
  timer = setTimeout(() => { if (queue.length) void pump(); else void snapshot(); }, delay);
  delay = Math.min(delay * 2, 30_000);
}

async function snapshot(first = false): Promise<boolean> {
  try {
    merge(await call("GET", `/v1/store/snapshot?limit_sessions=${limit}`), first);
    delay = 1000;
    set({ status: useSync.getState().status === "conflict" ? "conflict" : "online", lastSyncAt: Date.now(), ready: true });
    if (queue.length) void pump();
    return true;
  } catch (e) {
    if (e instanceof Net && e.status === 429) blockedUntil = Date.now() + Math.max(1, e.retryAfter || 5) * 1000;
    set({ ready: true });
    goOffline();
    return false;
  }
}
const snapSoon = () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => void snapshot(), 2000); };
export const refreshNow = () => snapshot();
export const loadMore = () => { limit = Math.min(limit + MAX_SESSIONS, 1000); return snapshot(); };

// --- realtime -------------------------------------------------------------------------------------------------------
function listen() {
  if (typeof EventSource === "undefined" || es) return;
  const open = () => {
    const src = new EventSource(`${API_BASE}/v1/store/events`);
    es = src;
    let failed = false;
    src.onopen = () => { if (failed) { failed = false; snapSoon(); } }; // missed events while the stream was down
    src.onmessage = (m) => {
      let e: Row | null = null;
      try { e = JSON.parse(m.data); } catch {}
      if (!e || e.type !== "changed" || typeof e.id !== "string" || typeof e.entity !== "string" || !["project", "session", "file", "turn"].includes(e.entity)) return;
      const known = versions.get(vkey(e.entity as Kind, e.id));
      if (known !== undefined && typeof e.version === "number" && e.version <= known) return; // our own write echoing back
      snapSoon();
    };
    src.onerror = () => { // EventSource retries by itself unless the server refused (429/closed): then back off and reopen
      failed = true;
      // CLOSED means the server refused (e.g. 429 listener cap): not an outage, retry later. A dropped connection stays CONNECTING.
      if (src.readyState !== 2 && useSync.getState().status === "online") goOffline(); // the live stream dropping is the earliest sign the server is gone
      if (src.readyState === 2) { src.close(); es = null; setTimeout(() => { if (useSync.getState().status !== "disabled" && !es) open(); }, Math.min(delay * 2, 30_000)); }
    };
  };
  open();
}

// --- cache -> queue (the mirror) ---------------------------------------------------------------------------------------
function mirrorChat(s: ReturnType<typeof useChatStore.getState>, p: ReturnType<typeof useChatStore.getState>) {
  if (applying || (s.projects === p.projects && s.sessions === p.sessions)) return;
  const pp = new Map(p.projects.map((x) => [x.id, x]));
  for (const x of s.projects) if (x.id !== PERSONAL && pp.get(x.id) !== x && pp.get(x.id)?.name !== x.name) enqueue({ k: "project", id: x.id, a: "put" });
  const removed: Op[] = [];
  const sNow = new Set(s.projects.map((x) => x.id));
  for (const x of p.projects) if (x.id !== PERSONAL && !sNow.has(x.id)) { removed.push({ k: "project", id: x.id, a: "del" }); p.sessions.filter((z) => z.projectId === x.id).forEach((z) => versions.delete(vkey("session", z.id))); }
  const ps = new Map(p.sessions.map((x) => [x.id, x]));
  const sIds = new Set(s.sessions.map((x) => x.id));
  for (const x of s.sessions) {
    const o = ps.get(x.id);
    if (o === x) continue;
    if (!o || o.title !== x.title || o.projectId !== x.projectId) { if (x.title || x.turns.length) enqueue({ k: "session", id: x.id, a: "put" }); }
    const ot = new Map((o?.turns ?? []).map((t) => [t.id, t]));
    const xt = new Set(x.turns.map((t) => t.id));
    const dropped = (o?.turns ?? []).filter((t) => !xt.has(t.id));
    if (dropped.length) { // an edit: one truncate call, queued BEFORE the replacing turn is written, which then reuses the freed position
      const at = dropped.map((t) => idxOf.get(t.id)).filter((n): n is number => n !== undefined);
      const first = dropped.find((t) => idxOf.get(t.id) === (at.length ? Math.min(...at) : undefined));
      for (const t of dropped) { tombstones.add(t.id); idxOf.delete(t.id); versions.delete(vkey("turn", t.id)); }
      const kept = x.turns.map((t) => idxOf.get(t.id)).filter((n): n is number => n !== undefined);
      maxIdx.set(x.id, kept.length ? Math.max(...kept) : -1);
      if (first && at.length) enqueue({ k: "turn", id: first.id, sid: x.id, idx: Math.min(...at), a: "del" });
    }
    for (const t of x.turns) if (ot.get(t.id) !== t && !t.runId) { if (!queue.some((q) => q.k === "session" && q.id === x.id) && !versions.has(vkey("session", x.id))) enqueue({ k: "session", id: x.id, a: "put" }); enqueue({ k: "turn", id: t.id, sid: x.id, a: "put" }); }
  }
  for (const x of p.sessions) if (!sIds.has(x.id) && (x.title || x.turns.length)) removed.push({ k: "session", id: x.id, a: "del" });
  removed.forEach(enqueue);
  if (removed.length === 1) set({ undo: { kind: removed[0].k, id: removed[0].id, at: Date.now() } });
}
function mirrorFiles(s: { files: FileEntry[] }, p: { files: FileEntry[] }) {
  if (applying || s.files === p.files) return;
  const pf = new Map(p.files.map((x) => [x.id, x]));
  for (const f of s.files) { const o = pf.get(f.id); if (o !== f && (!o || o.name !== f.name || o.projectId !== f.projectId || o.size !== f.size)) enqueue({ k: "file", id: f.id, a: "put" }); }
  const now = new Set(s.files.map((x) => x.id));
  for (const f of p.files) if (!now.has(f.id)) { enqueue({ k: "file", id: f.id, a: "del" }); set({ undo: { kind: "file", id: f.id, at: Date.now() } }); }
}

export async function undoDelete() {
  const u = useSync.getState().undo;
  if (!u) return;
  set({ undo: null });
  while (queue.length || pumping) await new Promise((r) => setTimeout(r, 100)); // let the delete land first
  if (await send({ k: u.kind, id: u.id, a: "restore" }, false) === "ok") await snapshot();
}

// Best effort on tab close: push what is still queued, and mark this tab's live run as interrupted.
function flush() {
  const run = runningTurnId();
  if (run) {
    const s = useChatStore.getState().sessions.find((x) => x.turns.some((t) => t.id === run));
    const t = s?.turns.find((x) => x.id === run);
    if (s && t && !t.runId) void call("PUT", `/v1/store/sessions/${s.id}/turns/${t.id}`, turnBody({ ...t, status: "interrupted" }, idxOf.get(t.id) ?? (maxIdx.get(s.id) ?? 0)), true).catch(() => {});
  }
  for (const o of queue.slice(0, 20)) void send(o, true);
}

// --- start ----------------------------------------------------------------------------------------------------------
export async function startSync(): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;
  let db = false;
  try {
    const r = await fetch(`${API_BASE}/v1/health`, { signal: AbortSignal.timeout(4000) });
    db = r.ok && (await r.json())?.db === "ok";
  } catch {}
  if (!db) { // browser-only: exactly the old behaviour
    gate.writes = true;
    set({ status: "disabled", ready: true });
    void useChatStore.persist.rehydrate(); void useFilesStore.persist.rehydrate();
    return;
  }
  gate.writes = false; // localStorage keeps the old browser data untouched until it is imported or cleared
  set({ status: "connecting" });
  load(); save();
  const saved = (() => { try { return JSON.parse(safeStorage.getItem(ACTIVE_KEY) ?? "{}"); } catch { return {}; } })();
  if (await snapshot(true)) {
    const s = useChatStore.getState();
    if (typeof saved.activeId === "string" && s.sessions.some((x) => x.id === saved.activeId)) quiet(() => s.setActive(saved.activeId));
  }
  releases.push(useChatStore.subscribe((s, p) => {
    mirrorChat(s, p);
    if (s.activeId !== p.activeId || s.activeProjectId !== p.activeProjectId) { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ activeId: s.activeId })); } catch {} }
  }));
  releases.push(useFilesStore.subscribe(mirrorFiles));
  listen();
  const on = (t: EventTarget, e: string, f: () => void) => { t.addEventListener(e, f); releases.push(() => t.removeEventListener(e, f)); };
  on(window, "online", () => { delay = 1000; void pump(); void snapshot(); });
  on(window, "offline", goOffline); // the browser knows before any request fails
  on(window, "pagehide", flush);
  on(document, "visibilitychange", () => { if (document.visibilityState === "visible") snapSoon(); });
  void pump();
}

// Wait (bounded) until the session itself is on the server and any truncate (an edited question) for it has been applied,
// so a run can point at it. Turn puts do not matter: the server allocates a run's turn itself. A truncate does: the server
// gives the new turn max+1, which a later truncate from an older idx would delete. true = ready.
export async function settleSession(sid: string, signal?: AbortSignal): Promise<boolean> {
  const truncate = (o: Op | null) => !!o && o.k === "turn" && o.a === "del" && o.sid === sid;
  const pendingSession = () => queue.some((o) => (o.k === "session" && o.id === sid) || truncate(o)) || (inflight?.k === "session" && inflight.id === sid) || truncate(inflight) || !versions.has(vkey("session", sid));
  for (let i = 0; i < 100 && !signal?.aborted && useSync.getState().status !== "disabled" && pendingSession(); i++) {
    void pump();
    await new Promise((r) => setTimeout(r, 50));
  }
  return !pendingSession();
}

// A turn row the server wrote for a run: remember its position and version like a snapshot would, so a later edit
// truncates from the right place and a plan review after it gets the next idx.
export function recordServerTurn(sid: string, r: Row) {
  const id = str(r.id), idx = Number(r.idx);
  if (!id || !Number.isFinite(idx)) return;
  idxOf.set(id, idx); maxIdx.set(sid, Math.max(maxIdx.get(sid) ?? -1, idx)); remember("turn", r);
}

// A 409 use_runs means the server has the shared database although the first health probe said otherwise: ask again.
export async function reprobeSync(): Promise<void> {
  if (useSync.getState().status !== "disabled") return;
  started = false;
  await startSync();
}

// Test seam: forget everything.
export function __resetSync() {
  queue = []; versions = new Map(); maxIdx.clear(); idxOf.clear(); tombstones.clear(); lastTurnSend.clear();
  inflight = null; applying = false; pumping = false; started = false; blockedUntil = 0; delay = 1000; limit = MAX_SESSIONS;
  clearTimeout(timer); clearTimeout(snapTimer); es?.close(); es = null; releases.forEach((f) => f()); releases = [];
  set({ status: DEFER_HYDRATION ? "connecting" : "disabled", ready: !DEFER_HYDRATION, lastSyncAt: null, pending: 0, notice: null, hasMore: false, rev: 0, undo: null });
}
export const __queue = () => queue;
export const __versions = () => versions;

// Plain JSON call for the trash and usage pages (throws on any failure; the pages show their own error state).
export const storeCall = call;
export const refreshAfterTrashAction = () => snapshot();
