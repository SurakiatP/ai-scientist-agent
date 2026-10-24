import type { Reference } from "./sse";
import type { Strings } from "./strings";

const ARXIV = /^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//i;
const DOI = /^10\.[0-9]{4,9}\/\S+$/;
const PMID = /^[0-9]{1,9}$/;

export const doiOf = (p: Reference["paper"]) => p.doi?.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "") ?? "";
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

