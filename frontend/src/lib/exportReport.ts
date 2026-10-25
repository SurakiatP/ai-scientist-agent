import { create } from "zustand";
import type { Turn } from "./chat";
import { API_BASE } from "./config";
import { doiOf, httpUrl, paperLink } from "./refs";
import type { Lang, Strings } from "./strings";

// Limits of POST /v1/reports/export (backend contract).
export const LIM = { title: 200, subtitle: 300, heading: 200, para: 5000, sections: 30, paras: 60, refs: 100 } as const;
export type Format = "pdf" | "docx";
export type ReportStyle = "standard" | "official";
export type Draft = { style: ReportStyle; title: string; subtitle: string; refs: boolean; lang: Lang; sections: { heading: string; text: string }[] };
type Payload = { format: Format; style: ReportStyle; language: Lang; title: string; subtitle: string | null; sections: { heading: string; paragraphs: string[] }[]; references: unknown[] };

// Paragraph = blank-line separated block; a block over the limit is split at whitespace so no text is lost.
export function paragraphsOf(text: string): string[] {
  const out: string[] = [];
  for (let block of text.split(/\n[ \t]*\n/).map((b) => b.trim()).filter(Boolean)) {
    while (block.length > LIM.para) {
      let cut = block.lastIndexOf(" ", LIM.para);
      if (cut < LIM.para / 2) cut = LIM.para;
      out.push(block.slice(0, cut).trim());
      block = block.slice(cut).trim();
    }
    if (block) out.push(block);
  }
  return out;
}

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

export function initialDraft(turn: Turn, lang: Lang, t: Strings): Draft {
  return { style: "standard", title: docTitle(turn), subtitle: turn.answer ? turn.question.slice(0, LIM.subtitle) : "", refs: true, lang, sections: draftSections(turn.answer?.content ?? "", t.reportAnswerSection) };
}

export const draftIssue = (d: Draft): "title" | "limits" | null =>
  !d.title.trim() ? "title"
    : d.sections.length > LIM.sections || d.sections.some((s) => paragraphsOf(s.text).length > LIM.paras || s.heading.length > LIM.heading) ? "limits" : null;

export function toPayload(d: Draft, format: Format, turn: Turn): Payload {
  const refs = d.refs ? (turn.answer?.references ?? []).slice(0, LIM.refs).map((r) => ({
    id: r.id, title: r.paper.title, authors: r.paper.authors, year: r.paper.year ?? null,
    doi: doiOf(r.paper) || null, url: httpUrl(paperLink(r.paper) ?? r.paper.url) ?? null, status: r.status,
  })) : [];
  return { format, style: d.style, language: d.lang, title: d.title.trim().slice(0, LIM.title), subtitle: d.subtitle.trim().slice(0, LIM.subtitle) || null, sections: d.sections.map((s) => ({ heading: s.heading.trim() || " ", paragraphs: paragraphsOf(s.text) })), references: refs };
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

// One export at a time, shared by the panel menu and the form so both show the same honest state.
type ExportState = { busy: Format | null; error: ExportError | null; done: boolean; run: (d: Draft, f: Format, turn: Turn) => Promise<void>; reset: () => void };
export const useExport = create<ExportState>()((set, get) => ({
  busy: null, error: null, done: false,
  reset: () => set({ error: null, done: false }),
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
