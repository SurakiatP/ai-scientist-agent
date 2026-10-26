import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { useChatStore, type Turn } from "./chat";
import { API_BASE } from "./config";
import { registerUpload, useFilesStore } from "./files";
import { uploadFile, UploadError } from "./sse";
import { doiOf, httpUrl, paperLink } from "./refs";
import type { Lang, Strings } from "./strings";

// Limits of POST /v1/reports/export (backend contract).
export const LIM = { title: 200, subtitle: 300, heading: 200, para: 5000, sections: 30, paras: 60, refs: 100, runs: 200, cols: 12, rows: 100, cell: 500, items: 100 } as const;
export type Format = "pdf" | "docx";
export type ReportStyle = "standard" | "official";
export type Draft = { style: ReportStyle; title: string; subtitle: string; refs: boolean; lang: Lang; doc: JSONContent; lead: string };
type Section = { heading: string; blocks: Block[] };
type Payload = { format: Format; style: ReportStyle; language: Lang; title: string; subtitle: string | null; sections: { heading: string; paragraphs: string[]; blocks: Block[] }[]; references: unknown[] };

export type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean };
export type Block = { type: "paragraph"; runs: Run[] } | { type: "bullets" | "numbered"; items: Run[][] } | { type: "table"; header: string[]; rows: string[][] };
type N = { type: string; value?: string; url?: string; alt?: string; ordered?: boolean; children?: N[] };

const plain = (n: N): string => n.value ?? n.alt ?? (n.children ?? []).map(plain).join("");

// Inline mdast -> runs (adjacent runs with the same format merge). Text is never rewritten; a link whose text is not its URL keeps the URL in parentheses.
function inline(nodes: N[], f: Omit<Run, "text"> = {}, out: Run[] = []): Run[] {
  const push = (text: string, g: Omit<Run, "text">) => {
    if (!text) return;
    const l = out.at(-1);
    if (l && !!l.bold === !!g.bold && !!l.italic === !!g.italic && !!l.code === !!g.code) l.text += text;
    else out.push({ text, ...g });
  };
  for (const n of nodes) {
    if (n.type === "text") push(n.value ?? "", f);
    else if (n.type === "inlineCode") push(n.value ?? "", { ...f, code: true });
    else if (n.type === "break") push("\n", f);
    else if (n.type === "image") push(n.alt ?? "", f);
    else if (n.type === "strong") inline(n.children ?? [], { ...f, bold: true }, out);
    else if (n.type === "emphasis") inline(n.children ?? [], { ...f, italic: true }, out);
    else if (n.children) {
      inline(n.children, f, out);
      if (n.type === "link" && n.url && plain(n) !== n.url) push(` (${n.url})`, f);
    } else push(n.value ?? "", f);
  }
  return out;
}

// Split runs so none is over the per-run limit (no text lost).
function splitRuns(runs: Run[]): Run[] {
  const flat: Run[] = [];
  for (const r of runs) {
    let t = r.text;
    while (t.length > LIM.para) {
      let cut = t.lastIndexOf(" ", LIM.para);
      if (cut < LIM.para / 2) cut = LIM.para;
      flat.push({ ...r, text: t.slice(0, cut) });
      t = t.slice(cut);
    }
    if (t) flat.push({ ...r, text: t });
  }
  return flat;
}
// Split runs into paragraph blocks that respect the per-run and runs-per-block limits.
function pack(runs: Run[]): Block[] {
  const flat = splitRuns(runs);
  const out: Block[] = [];
  for (let i = 0; i < flat.length; i += LIM.runs) out.push({ type: "paragraph", runs: flat.slice(i, i + LIM.runs) });
  return out;
}

function listItems(list: N, out: Run[][]) {
  for (const li of list.children ?? []) {
    const runs: Run[] = [];
    const nested: N[] = [];
    for (const c of li.children ?? []) {
      if (c.type === "list") { nested.push(c); continue; }
      if (runs.length) runs.push({ text: " " });
      inline(c.type === "paragraph" ? (c.children ?? []) : [c], {}, runs);
    }
    out.push(runs);
    nested.forEach((n) => listItems(n, out)); // nested lists are flattened into the parent list
  }
}

function walk(nodes: N[], out: Block[]) {
  for (const n of nodes) {
    if (n.type === "paragraph") out.push(...pack(inline(n.children ?? [])));
    else if (n.type === "heading") out.push(...pack(inline(n.children ?? [], { bold: true })));
    else if (n.type === "code" || n.type === "html") out.push(...pack([n.type === "code" ? { text: n.value ?? "", code: true } : { text: n.value ?? "" }]));
    else if (n.type === "blockquote") walk(n.children ?? [], out);
    else if (n.type === "list") {
      const items: Run[][] = [];
      listItems(n, items);
      for (let i = 0; i < items.length; i += LIM.items) out.push({ type: n.ordered ? "numbered" : "bullets", items: items.slice(i, i + LIM.items).map(splitRuns) });
    } else if (n.type === "table") {
      const [head, ...body] = (n.children ?? []).map((r) => (r.children ?? []).map(plain));
      for (let i = 0; i === 0 || i < body.length; i += LIM.rows) out.push({ type: "table", header: head ?? [], rows: body.slice(i, i + LIM.rows) });
    }
  }
}

// Markdown text -> typed blocks (paragraph, bullets, numbered, table). Parsed to a syntax tree, never rendered as HTML.
export function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  walk((unified().use(remarkParse).use(remarkGfm).parse(text) as N).children ?? [], out);
  return out;
}

// A table the server would refuse: too many columns or a cell over the limit (cannot be split without changing it).
export const tableIssue = (bs: Block[]) => bs.some((b) => b.type === "table" && (b.header.length > LIM.cols || b.rows.some((r) => r.length > LIM.cols) || [...b.header, ...b.rows.flat()].some((c) => c.length > LIM.cell)));

// Markdown answer -> editable sections. Headings (outside code fences) start a section; text before the first heading goes under `fallback`.
export function draftSections(content: string, fallback: string): { heading: string; text: string }[] {
  const out: { heading: string; lines: string[] }[] = [];
  let fence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && /^#{1,3}\s+(.+?)\s*#*$/.exec(line);
    if (h) { out.push({ heading: h[1], lines: [] }); continue; }
    if (!out.length) { if (!line.trim()) continue; out.push({ heading: fallback, lines: [] }); }
    out.at(-1)!.lines.push(line);
  }
  return out.map((s) => ({ heading: s.heading.slice(0, LIM.heading), text: s.lines.join("\n").trim() }));
}

export const docTitle = (turn: Turn) => ((/^#{1,3}\s+(.+?)\s*#*$/m.exec(turn.answer?.content ?? "")?.[1]) || turn.question).slice(0, LIM.title);

const textNode = (r: Run): JSONContent => {
  const marks = [r.bold && "bold", r.italic && "italic", r.code && "code"].filter(Boolean).map((type) => ({ type: type as string }));
  return { type: "text", text: r.text, ...(marks.length ? { marks } : {}) };
};
// Runs -> inline nodes; "\n" becomes a hard break (a text node may not hold one).
const inlineNodes = (runs: Run[]): JSONContent[] => runs.flatMap((r) => r.text.split("\n").flatMap((t, i) => [...(i ? [{ type: "hardBreak" }] : []), ...(t ? [textNode({ ...r, text: t })] : [])]));
const para = (runs: Run[]): JSONContent => { const content = inlineNodes(runs); return content.length ? { type: "paragraph", content } : { type: "paragraph" }; };
const cell = (type: string, text: string): JSONContent => ({ type, content: [para(text ? [{ text }] : [])] });

// Sections (heading + markdown text) -> editor document: heading level 2, then the blocks of the text.
export function docFromSections(sections: { heading: string; text: string }[]): JSONContent {
  const content: JSONContent[] = [];
  for (const s of sections) {
    content.push({ type: "heading", attrs: { level: 2 }, ...(s.heading ? { content: [{ type: "text", text: s.heading }] } : {}) });
    for (const b of blocksOf(s.text)) {
      if (b.type === "paragraph") content.push(para(b.runs));
      else if (b.type === "table") content.push({ type: "table", content: [...(b.header.length ? [{ type: "tableRow", content: b.header.map((c) => cell("tableHeader", c)) }] : []), ...b.rows.map((r) => ({ type: "tableRow", content: r.map((c) => cell("tableCell", c)) }))] });
      else content.push({ type: b.type === "bullets" ? "bulletList" : "orderedList", content: b.items.map((it) => ({ type: "listItem", content: [para(it)] })) });
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

// Inline nodes -> runs (adjacent runs with the same format merge; empty runs vanish).
function runsOf(nodes: JSONContent[] = [], out: Run[] = []): Run[] {
  for (const n of nodes) {
    const text = n.type === "hardBreak" ? "\n" : n.text ?? "";
    if (!text) continue;
    const m = new Set((n.marks ?? []).map((x) => x.type));
    const g = { ...(m.has("bold") && { bold: true }), ...(m.has("italic") && { italic: true }), ...(m.has("code") && { code: true }) };
    const l = out.at(-1);
    if (l && !!l.bold === !!g.bold && !!l.italic === !!g.italic && !!l.code === !!g.code) l.text += text;
    else out.push({ text, ...g });
  }
  return out;
}
const flatText = (n: JSONContent): string => (n.type === "hardBreak" ? " " : n.text ?? (n.content ?? []).map(flatText).join(""));
function itemRuns(list: JSONContent, out: Run[][]) {
  for (const li of list.content ?? []) {
    const runs: Run[] = [];
    for (const c of li.content ?? []) {
      if (c.type === "bulletList" || c.type === "orderedList") continue;
      if (runs.length) runs.push({ text: " " });
      if (c.type === "paragraph") runsOf(c.content, runs);
      else { const x = flatText(c).trim(); if (x) runs.push({ text: x }); } // e.g. a table inside an item: keep its text
    }
    out.push(runs);
    for (const c of li.content ?? []) if (c.type === "bulletList" || c.type === "orderedList") itemRuns(c, out); // nested lists are flattened
  }
}
const blocksOfNode = (n: JSONContent): Block[] => {
  if (n.type === "bulletList" || n.type === "orderedList") {
    const items: Run[][] = [];
    itemRuns(n, items);
    return Array.from({ length: Math.ceil(items.length / LIM.items) }, (_, i) => ({ type: n.type === "bulletList" ? "bullets" : "numbered", items: items.slice(i * LIM.items, (i + 1) * LIM.items).map(splitRuns) }) as Block);
  }
  if (n.type === "table") {
    const [head = [], ...body] = (n.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map(flatText).join(" ").trim()));
    return Array.from({ length: Math.max(1, Math.ceil(body.length / LIM.rows)) }, (_, i) => ({ type: "table", header: head, rows: body.slice(i * LIM.rows, (i + 1) * LIM.rows) }) as Block);
  }
  return pack(runsOf(n.content).filter((r, _, a) => r.text.trim() || a.length > 1));
};

// Editor document -> sections. A heading starts a section; blocks before the first heading go under `lead`.
export function sectionsOf(d: Pick<Draft, "doc" | "lead">): Section[] {
  const out: Section[] = [];
  for (const n of d.doc.content ?? []) {
    if (n.type === "heading") { out.push({ heading: flatText(n).trim(), blocks: [] }); continue; }
    const bs = blocksOfNode(n);
    if (!bs.length) continue;
    if (!out.length) out.push({ heading: d.lead, blocks: [] });
    out.at(-1)!.blocks.push(...bs);
  }
  return out;
}

export function initialDraft(turn: Turn, lang: Lang, t: Strings): Draft {
  return { style: "standard", title: docTitle(turn), subtitle: turn.answer ? turn.question.slice(0, LIM.subtitle) : "", refs: true, lang, lead: t.reportAnswerSection, doc: docFromSections(draftSections(turn.answer?.content ?? "", t.reportAnswerSection)) };
}

const MAX_CHARS = 200_000; // backend ExportRequest total: title + headings + every run, header and cell
const blockChars = (b: Block) => b.type === "paragraph" ? b.runs.reduce((n, r) => n + r.text.length, 0) : b.type === "table" ? [...b.header, ...b.rows.flat()].reduce((n, c) => n + c.length, 0) : b.items.flat().reduce((n, r) => n + r.text.length, 0);

export function draftIssue(d: Draft): "title" | "limits" | "heading" | "table" | null {
  if (!d.title.trim()) return "title";
  const ss = sectionsOf(d);
  if (ss.some((s) => s.heading.length > LIM.heading)) return "heading";
  if (ss.length > LIM.sections || ss.some((s) => s.blocks.length > LIM.paras)) return "limits";
  if (ss.some((s) => s.blocks.some((b) => (b.type === "paragraph" && b.runs.length > LIM.runs) || ((b.type === "bullets" || b.type === "numbered") && b.items.some((i) => i.length > LIM.runs))))) return "limits";
  if (d.title.length + ss.reduce((n, s) => n + s.heading.length + s.blocks.reduce((m, b) => m + blockChars(b), 0), 0) > MAX_CHARS) return "limits";
  return ss.some((s) => tableIssue(s.blocks)) ? "table" : null;
}

export function toPayload(d: Draft, format: Format, turn: Turn): Payload {
  const refs = d.refs ? (turn.answer?.references ?? []).slice(0, LIM.refs).map((r) => ({
    id: r.id, title: r.paper.title, authors: r.paper.authors, year: r.paper.year ?? null,
    doi: doiOf(r.paper) || null, url: httpUrl(paperLink(r.paper) ?? r.paper.url) ?? null, status: r.status,
  })) : [];
  return { format, style: d.style, language: d.lang, title: d.title.trim().slice(0, LIM.title), subtitle: d.subtitle.trim().slice(0, LIM.subtitle) || null, sections: sectionsOf(d).map((s) => ({ heading: s.heading.trim() || " ", paragraphs: [], blocks: s.blocks })), references: refs };
}

export type ExportError = "413" | "422" | "503" | "net" | "other";
export const errorText = (e: ExportError, t: Strings) => ({ "413": t.fErr413, "422": t.fErr422, "503": t.fErr503, net: t.fErrNet, other: t.fErrOther })[e];

// Server filename from Content-Disposition (filename*=UTF-8''...), else a plain fallback.
export function fileNameOf(cd: string | null, ext: string): string {
  const m = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd ?? "");
  if (m) { try { return decodeURIComponent(m[1].trim()).replace(/[\\/]/g, "_"); } catch {} }
  return `report.${ext}`;
}

export async function requestExport(p: Payload, signal?: AbortSignal): Promise<{ blob: Blob; name: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/reports/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p), signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw "net" satisfies ExportError;
  }
  if (!res.ok) throw (res.status === 413 ? "413" : res.status === 422 ? "422" : res.status === 503 ? "503" : "other") satisfies ExportError;
  return { blob: await res.blob(), name: fileNameOf(res.headers.get("Content-Disposition"), p.format) };
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// File name for the library: title without path/reserved characters, Thai kept, <= 120 chars with the extension, " (2)" etc. when taken.
export function libraryName(title: string, ext: Format, taken: string[]): string {
  const base = title.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "").trim().slice(0, 100).trim() || "report";
  const used = new Set(taken.map((n) => n.toLowerCase()));
  let name = `${base}.${ext}`;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i}).${ext}`;
  return name;
}

// One export at a time, shared by the panel menu and the form so both show the same honest state.
type ExportState = { busy: Format | null; error: ExportError | null; done: boolean; saved: string | null; upErr: string | null; run: (d: Draft, f: Format, turn: Turn) => Promise<void>; save: (d: Draft, f: Format, turn: Turn) => Promise<void>; reset: () => void };
export const useExport = create<ExportState>()((set, get) => ({
  busy: null, error: null, done: false, saved: null, upErr: null,
  reset: () => set({ error: null, done: false, saved: null, upErr: null }),
  // Generate, then keep the file in "My files" (upload + library entry). Nothing is downloaded; on failure nothing is added.
  save: async (d, f, turn) => {
    if (get().busy) return;
    set({ busy: f, error: null, done: false, saved: null, upErr: null });
    let blob: Blob;
    try {
      ({ blob } = await requestExport(toPayload(d, f, turn)));
    } catch (e) {
      set({ busy: null, error: e === "413" || e === "422" || e === "503" || e === "net" ? e : "other" });
      return;
    }
    try {
      const name = libraryName(d.title, f, useFilesStore.getState().files.map((x) => x.name));
      const up = await uploadFile(new File([blob], name, { type: blob.type || (f === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") }), new AbortController().signal);
      registerUpload(up, useChatStore.getState().activeProjectId);
      set({ busy: null, saved: up.name });
    } catch (e) {
      set({ busy: null, upErr: e instanceof UploadError ? e.message : "" });
    }
  },
  run: async (d, f, turn) => {
    if (get().busy) return;
    set({ busy: f, error: null, done: false });
    try {
      const { blob, name } = await requestExport(toPayload(d, f, turn));
      saveBlob(blob, name);
      set({ busy: null, done: true });
    } catch (e) {
      set({ busy: null, error: e === "413" || e === "422" || e === "503" || e === "net" ? e : "other" });
    }
  },
}));

// Which turn's document panel is open (null = closed). Plain store: the panel sits in the right aside on wide screens, a sheet below lg.
type PanelState = { ref: { sessionId: string; turnId: string } | null; tab: "report" | "sources"; open: (sessionId: string, turnId: string) => void; close: () => void; setTab: (t: "report" | "sources") => void };
export const useReportPanel = create<PanelState>()((set) => ({
  ref: null, tab: "report",
  open: (sessionId, turnId) => set({ ref: { sessionId, turnId }, tab: "report" }),
  close: () => set({ ref: null }),
  setTab: (tab) => set({ tab }),
}));
