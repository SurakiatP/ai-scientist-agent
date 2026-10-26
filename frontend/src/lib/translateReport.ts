import type { JSONContent } from "@tiptap/react";
import { API_BASE } from "./config";
import { inlineNodes, LIM, runsOf, type Run } from "./exportReport";
import type { Lang } from "./strings";

// Report translation. The document is cut into segments (title, subtitle, then one per paragraph/heading in order) with bold/italic/code
// kept as inline markdown, translated by the server, and poured back into the same nodes, so structure and attrs never change.
const TEXTBLOCK = new Set(["paragraph", "heading"]);

// Inline markdown subset shared with the model: \x escape, `code`, ** bold, * italic, \n hard break. Nothing else is special.
const escape = (s: string) => s.replace(/([\\*`])/g, "\\$1");
function codeSpan(body: string): string {
  const fence = "`".repeat(Math.max(0, ...(body.match(/`+/g) ?? []).map((m) => m.length)) + 1);
  const pad = body.startsWith("`") || body.endsWith("`") || (body.startsWith(" ") && body.endsWith(" ") && !!body.trim());
  return pad ? `${fence} ${body} ${fence}` : fence + body + fence;
}
// ** and * only toggle, so between neighbouring runs just the marks that change are written (3 stars = both), and the end closes what is open.
function toMd(n: JSONContent): string {
  let b = false, i = false, out = "";
  for (const r of runsOf(n.content)) {
    out += "*".repeat((!!r.bold !== b ? 2 : 0) + (!!r.italic !== i ? 1 : 0));
    b = !!r.bold; i = !!r.italic;
    out += r.code ? codeSpan(r.text) : escape(r.text);
  }
  return out + "*".repeat((b ? 2 : 0) + (i ? 1 : 0));
}

// Not CommonMark: Thai has no spaces, so ** and * toggle wherever they stand. A marker with no partner is plain text.
type Tok = { k: "t" | "c" | "B" | "I"; v: string };
export function runsFromMd(md: string): Run[] {
  const toks: Tok[] = [];
  const text = (v: string) => { const l = toks.at(-1); if (l?.k === "t") l.v += v; else toks.push({ k: "t", v }); };
  for (let i = 0; i < md.length;) {
    const c = md[i];
    if (c === "\\") { text(i + 1 < md.length ? md[i + 1] : "\\"); i += 2; }
    else if (c === "`") {
      let n = 1; while (md[i + n] === "`") n++;
      let j = i + n, end = -1;
      while (j < md.length) { if (md[j] !== "`") { j++; continue; } let m = 1; while (md[j + m] === "`") m++; if (m === n) { end = j; break; } j += m; }
      if (end < 0) { text(md.slice(i, i + n)); i += n; continue; }
      let v = md.slice(i + n, end);
      if (v.length > 2 && v.startsWith(" ") && v.endsWith(" ") && v.trim()) v = v.slice(1, -1);
      toks.push({ k: "c", v }); i = end + n;
    } else if (c === "*") {
      let n = 0; while (md[i + n] === "*") n++;
      for (let k = n; k > 0; k -= 2) toks.push(k >= 2 ? { k: "B", v: "**" } : { k: "I", v: "*" });
      i += n;
    } else { text(c); i++; }
  }
  for (const k of ["B", "I"] as const) {
    const at = toks.flatMap((t, x) => (t.k === k ? [x] : []));
    if (at.length % 2) toks[at.at(-1)!] = { k: "t", v: k === "B" ? "**" : "*" };
  }
  const out: Run[] = [];
  let bold = false, italic = false;
  for (const t of toks) {
    if (t.k === "B") { bold = !bold; continue; }
    if (t.k === "I") { italic = !italic; continue; }
    const g = { ...(bold && { bold }), ...(italic && { italic }), ...(t.k === "c" && { code: true }) };
    const l = out.at(-1);
    if (l && !!l.bold === !!g.bold && !!l.italic === !!g.italic && !!l.code === !!g.code) l.text += t.v;
    else out.push({ text: t.v, ...g });
  }
  return out;
}
const plainOf = (md: string) => runsFromMd(md).map((r) => r.text).join("").replace(/\n/g, " ").trim();

function blocks(n: JSONContent, f: (b: JSONContent) => JSONContent): JSONContent {
  if (TEXTBLOCK.has(n.type ?? "")) return f(n);
  return n.content ? { ...n, content: n.content.map((c) => blocks(c, f)) } : n;
}

export function segmentsOf(doc: JSONContent, title: string, subtitle: string): string[] {
  const out = [escape(title), escape(subtitle)];
  blocks(doc, (b) => { out.push(toMd(b)); return b; });
  return out;
}

export function applySegments(doc: JSONContent, segs: string[]): { doc: JSONContent; title: string; subtitle: string } {
  let i = 1;
  const next = blocks(doc, (b) => {
    const s = segs[++i];
    if (!s?.trim()) return b;
    const content = inlineNodes(runsFromMd(s));
    return content.length ? { ...b, content } : b;
  });
  return { doc: next, title: plainOf(segs[0] ?? "").slice(0, LIM.title), subtitle: plainOf(segs[1] ?? "").slice(0, LIM.subtitle) };
}

// cyrb53: small sync string hash, enough to tell "same content" from "edited".
export function hashOf(segs: string[]): string {
  const s = JSON.stringify(segs);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export type TrError = "422" | "429" | "502" | "504" | "net" | "other";

// Same-tab cache of finished translations, newest last, capped by size.
const KEY = "scientist-tr-v1", CAP = 2_000_000;
const load = (): [string, string[]][] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e): e is [string, string[]] => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && Array.isArray(e[1]) && e[1].every((x: unknown) => typeof x === "string")) : [];
  } catch { return []; }
};
export const cachedTranslation = (target: Lang, segs: string[]) => { const hit = load().find(([x]) => x === `${target}:${hashOf(segs)}`)?.[1]; return hit?.length === segs.length ? hit : undefined; };
function remember(k: string, v: string[]) {
  try {
    const all = load().filter(([x]) => x !== k);
    all.push([k, v]);
    while (all.length && JSON.stringify(all).length > CAP) all.shift();
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage blocked or full: just no cache */ }
}

async function request(target: Lang, segments: string[], signal: AbortSignal): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/reports/translate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, segments }), signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw "net" satisfies TrError;
  }
  if (!res.ok) throw ([422, 429, 502, 504].includes(res.status) ? String(res.status) : "other") as TrError;
  try {
    const { segments: out } = await res.json();
    if (Array.isArray(out) && out.length === segments.length) return out;
  } catch { /* fall through */ }
  throw "other" satisfies TrError;
}

// Empty segments are not sent. Returns one translated string per input segment.
export async function translateSegments(target: Lang, segs: string[], signal: AbortSignal): Promise<string[]> {
  const key = `${target}:${hashOf(segs)}`;
  const hit = cachedTranslation(target, segs);
  if (hit) return hit;
  const idx = segs.flatMap((s, i) => (s.trim() ? [i] : []));
  const got = idx.length ? await request(target, idx.map((i) => segs[i]), signal) : [];
  const out = segs.map(() => "");
  idx.forEach((i, j) => { out[i] = got[j]; });
  remember(key, out);
  return out;
}

// Outline of the document for the loading skeleton: one entry per text block, with its size and whether it is a heading.
export function shapeOf(doc: JSONContent): { h: boolean; n: number }[] {
  const out: { h: boolean; n: number }[] = [];
  blocks(doc, (b) => { out.push({ h: b.type === "heading", n: (b.content ?? []).reduce((s, c) => s + (c.text?.length ?? 1), 0) }); return b; });
  return out;
}
