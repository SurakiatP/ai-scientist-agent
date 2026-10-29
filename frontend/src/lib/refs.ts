import type { Check, Reference } from "./sse";
import type { Strings } from "./strings";

const ARXIV = /^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//i;
const DOI = /^10\.[0-9]{4,9}\/\S+$/;
const PMID = /^[0-9]{1,9}$/;

export const doiOf = (p: Reference["paper"]) => p.doi?.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:?\s*)/i, "") ?? "";
export const httpUrl = (u: string | undefined) => {
  try {
    const x = new URL(u?.trim() ?? "");
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : null;
  } catch {
    return null;
  }
};

// Anchors only for http(s): DOI > PMID > arXiv > any other http(s) url. javascript:/data:/ftp: never.
export function paperLink(p: Reference["paper"]): string | null {
  const doi = doiOf(p);
  if (DOI.test(doi)) return `https://doi.org/${encodeURI(doi)}`;
  const pmid = p.pmid?.trim();
  if (pmid && PMID.test(pmid)) return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  return httpUrl(p.url);
}

// "unverified" also covers papers with nothing to check, so word it by whether an identifier exists.
export const hasId = (p: Reference["paper"]) => !!(doiOf(p) || p.pmid?.trim() || ARXIV.test(p.url?.trim() ?? ""));

// Identifier-check wording shared by the inspector and the exported report (existence only, never "supports the claim").
export const checkLabel = (r: Reference, t: Strings) =>
  r.status === "verified" ? t.verified : r.status === "unknown" ? t.chkUnknown : hasId(r.paper) ? t.chkNotFound : t.chkNoId;


// Domain for a citation chip: the paper's own http(s) url, else the resolver we link to (doi.org / pubmed). "" when there is none.
// URL() lowercases and drops the port; we also drop "www." and a trailing dot.
export function sourceHost(p: Reference["paper"]): string {
  const u = httpUrl(p.url) ?? paperLink(p);
  if (!u) return "";
  return new URL(u).hostname.replace(/\.$/, "").replace(/^www\./, "");
}

// Chip text: the publisher host when the paper has its own url; a resolver host (doi.org) names nobody, so use "Author year".
const RESOLVERS = new Set(["doi.org", "dx.doi.org", "pubmed.ncbi.nlm.nih.gov"]);
export function citeLabel(p: Reference["paper"]): string {
  const host = sourceHost(p);
  if (host && !RESOLVERS.has(host)) return host;
  const first = p.authors?.[0]?.trim().split(/[\s,]+/)[0] ?? "";
  const who = first ? `${first}${(p.authors?.length ?? 0) > 1 ? " et al." : ""}` : "";
  return [who, p.year ? String(p.year) : ""].filter(Boolean).join(" ") || host;
}

// Stored/streamed abstract and checks are unvalidated: keep the usable ones (bounded), drop bad entries and fields, never the reference.
const SUPPORT = ["supported", "partial", "unsupported", "no_quote"];
export function cleanEvidence(r: Reference): Reference {
  const { checks, ...rest } = r;
  const paper = { ...r.paper };
  if (typeof paper.abstract === "string") paper.abstract = paper.abstract.slice(0, 2000);
  else if (paper.abstract !== null) delete paper.abstract; // null (cleared by the server) stays distinct from absent (old turn)
  const ok: Check[] = Array.isArray(checks)
    ? checks.filter((c) => !!c && typeof c.claim === "string" && SUPPORT.includes(c.support) && (c.quote === null || typeof c.quote === "string"))
      .slice(0, 5).map((c) => ({ claim: c.claim.slice(0, 400), support: c.support, quote: c.quote ? c.quote.slice(0, 600) : null }))
    : [];
  return { ...rest, paper, ...(ok.length && { checks: ok }) };
}
export const unsupported = (r: Reference) => !!r.checks?.some((c) => c.support === "unsupported");
