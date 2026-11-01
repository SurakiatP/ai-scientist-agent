import type { DataRecord, DocRef, EmptyFile, Provenance, RunUsage } from "./sse";

// Display names of the evidence sources the backend reports by id. Kept in sync with backend/src/scientist/sources.py
// (sources.test.ts parses that file and fails when the two lists differ).
export const SOURCE_NAMES: Record<string, string> = {
  "pubmed": "PubMed",
  "pmc": "PubMed Central",
  "europepmc": "Europe PMC",
  "biorxiv": "bioRxiv",
  "medrxiv": "medRxiv",
  "arxiv": "arXiv",
  "openalex": "OpenAlex",
  "crossref": "Crossref",
  "semanticscholar": "Semantic Scholar",
  "core": "CORE",
  "unpaywall": "Unpaywall",
  "opencitations": "OpenCitations",
  "pubtator3": "PubTator3",
  "zenodo": "Zenodo",
  "figshare": "figshare",
  "ror": "ROR",
  "biostudies": "BioStudies",
  "doaj": "DOAJ",
  // databases
  "addgene": "Addgene",
  "alphafold": "AlphaFold DB",
  "bindingdb": "BindingDB",
  "biogrid": "BioGRID",
  "brenda": "BRENDA",
  "cbioportal": "cBioPortal",
  "chebi": "ChEBI",
  "chembl": "ChEMBL",
  "clinicaltrials": "ClinicalTrials.gov",
  "clinpgx": "ClinPGx",
  "clinvar": "ClinVar",
  "cod": "Crystallography Open Database",
  "cosmic": "COSMIC",
  "dailymed": "DailyMed",
  "dbsnp": "dbSNP",
  "disgenet": "DisGeNET",
  "drugbank": "DrugBank",
  "emdb": "EMDB",
  "ena": "European Nucleotide Archive",
  "encode": "ENCODE",
  "ensembl": "Ensembl",
  "fda": "openFDA",
  "gene-ontology": "Gene Ontology",
  "geo": "GEO",
  "gnomad": "gnomAD",
  "gtex": "GTEx",
  "gwas-catalog": "GWAS Catalog",
  "hca": "Human Cell Atlas",
  "hpo": "Human Phenotype Ontology",
  "human-protein-atlas": "Human Protein Atlas",
  "interpro": "InterPro",
  "jaspar": "JASPAR",
  "kegg": "KEGG",
  "lincs-l1000": "LINCS L1000",
  "materials-project": "Materials Project",
  "metabolomics-workbench": "Metabolomics Workbench",
  "monarch": "Monarch Initiative",
  "mousemine": "MouseMine",
  "myvariant": "MyVariant.info",
  "nasa-exoplanet-archive": "NASA Exoplanet Archive",
  "ncbi-gene": "NCBI Gene",
  "ncbi-protein": "NCBI Protein",
  "ncbi-taxonomy": "NCBI Taxonomy",
  "nist": "NIST",
  "omim": "OMIM",
  "opentargets": "Open Targets",
  "pdb": "RCSB PDB",
  "pride": "PRIDE",
  "pubchem": "PubChem",
  "quickgo": "QuickGO",
  "reactome": "Reactome",
  "regulomedb": "RegulomeDB",
  "rummageo": "RummaGEO",
  "sdss": "SDSS",
  "simbad": "SIMBAD",
  "sra": "SRA",
  "string": "STRING",
  "tcga-gdc": "GDC (TCGA)",
  "ucsc-genome": "UCSC Genome Browser",
  "uniprot": "UniProt",
  "who": "WHO Global Health Observatory",
  "zinc": "ZINC",
};

// Databases that need an API key. The bridge passes no keys (backend sources.py `key=True`), so they return nothing; the landing does not count them.
// The first PAPER_COUNT entries above are literature sources, the rest databases (sources.test.ts checks both against sources.py).
export const KEY_GATED = ["addgene", "biogrid", "brenda", "cosmic", "disgenet", "drugbank", "lincs-l1000", "materials-project", "omim"];
export const PAPER_COUNT = 18;
export const usableCounts = () => { const all = Object.keys(SOURCE_NAMES).length - KEY_GATED.length; return { papers: PAPER_COUNT, dbs: all - PAPER_COUNT, all }; };

/** Display name for a source id, or "" when it is missing or unknown (old turns, a name the table does not know). */
export const sourceName = (id: string | null | undefined): string => (id && Object.hasOwn(SOURCE_NAMES, id) ? SOURCE_NAMES[id] : "");

/** "PubMed · arXiv · UniProt": names of the sources seen so far in a run, in the order they appeared; unknown ids are left out. */
export const sourceNames = (ids: readonly string[] | undefined): string => (ids ?? []).map(sourceName).filter(Boolean).join(" · ");

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** Stored records are unvalidated dicts: keep the usable ones (an object with a title), every field a trimmed string. Never throws. */
export const usableRecords = (records: unknown): DataRecord[] =>
  (Array.isArray(records) ? records : []).flatMap((r: unknown) => {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const title = str(x.title);
    return title ? [{ database: str(x.database), id: str(x.id), title, url: str(x.url), summary: str(x.summary) }] : [];
  });

/** Distinct source ids of a finished answer, first appearance first: its references' papers, then its records' databases. */
export const answerSourceIds = (answer: { references: { paper: { source?: string | null } }[]; records?: unknown }): string[] =>
  [...new Set([...answer.references.map((r) => r.paper?.source), ...usableRecords(answer.records).map((r) => r.database)].filter((i): i is string => !!i))];

/** A stored/streamed provenance is unvalidated: the object when it has schema 1 and fits in 50 KB, else undefined (the turn stays, the download hides). */
export const usableProvenance = (p: unknown): Provenance | undefined => {
  const x = p as { schema?: unknown } | null;
  if (!x || typeof x !== "object" || Array.isArray(x) || x.schema !== 1) return undefined;
  try { return JSON.stringify(x).length > 50_000 ? undefined : (x as Provenance); } catch { return undefined; }
};
/** A stored/streamed usage is unvalidated: the object when every field is well-formed, else undefined (the turn stays, the line hides). */
export const usableUsage = (u: unknown): RunUsage | undefined => {
  const x = u as Partial<Record<keyof RunUsage, unknown>> | null;
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  return x && typeof x === "object" && n(x.prompt_tokens) && n(x.completion_tokens) && (x.cost_usd === null || n(x.cost_usd)) && typeof x.estimated === "boolean" ? (x as RunUsage) : undefined;
};

const DOC_REFS = 12, EMPTY_FILES = 20, DOC_TEXT = 1200, DOC_QUOTE = 600, DOC_NAME = 500;
const s = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
/** Stored/streamed doc citations are unvalidated: keep the well-formed ones (bounded), drop bad entries. Never throws. */
export const usableDocRefs = (v: unknown): DocRef[] =>
  (Array.isArray(v) ? v : []).flatMap((r: unknown): DocRef[] => {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    if (!s(x.id, 20) || !s(x.file_id, 100) || !s(x.file_name, DOC_NAME) || typeof x.page !== "number" || !Number.isInteger(x.page) || x.page < 1 || typeof x.text !== "string") return [];
    return [{ id: x.id, file_id: x.file_id, file_name: x.file_name, page: x.page, text: x.text.slice(0, DOC_TEXT), quote: typeof x.quote === "string" && x.quote ? x.quote.slice(0, DOC_QUOTE) : null }];
  }).slice(0, DOC_REFS);
export const usableEmptyFiles = (v: unknown): EmptyFile[] =>
  (Array.isArray(v) ? v : []).flatMap((r: unknown): EmptyFile[] => {
    const x = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return s(x.file_id, 100) && s(x.file_name, DOC_NAME) ? [{ file_id: x.file_id, file_name: x.file_name }] : [];
  }).slice(0, EMPTY_FILES);
/** An answer with its doc citations and empty-file notes cleaned: a key with nothing usable left is removed (the turn stays). */
export const cleanDocs = <A extends object>(a: A): A => {
  const { doc_refs, empty_files, ...rest } = a as A & { doc_refs?: unknown; empty_files?: unknown };
  const d = usableDocRefs(doc_refs), e = usableEmptyFiles(empty_files);
  return { ...rest, ...(d.length ? { doc_refs: d } : {}), ...(e.length ? { empty_files: e } : {}) } as unknown as A;
};

/** The PDFs a docs turn asked about: stored on the turn in this browser, else rebuilt from the answer (a synced or older turn). */
export const docsOf = (t: { docs?: { id: string; name: string }[]; answer?: { doc_refs?: unknown; empty_files?: unknown } }): { id: string; name: string }[] => {
  if (t.docs?.length) return t.docs;
  const seen = new Map<string, string>();
  for (const d of [...usableDocRefs(t.answer?.doc_refs), ...usableEmptyFiles(t.answer?.empty_files)]) if (!seen.has(d.file_id)) seen.set(d.file_id, d.file_name);
  return [...seen].map(([id, name]) => ({ id, name }));
};

/** A docs error shown in the UI language by its stable code; the file name is what sits between the first and the last quote of the server message (a name may hold quotes). An unknown code returns the message. */
export const docsErrorText = (code: string | undefined, message: string, t: Record<"docsUnreadable" | "docsUnreadablePermanent" | "docsReadLater" | "docsLoadFailed" | "docsNotFound", string>): string => {
  const key = ({ docs_unreadable: "docsUnreadable", docs_unreadable_permanent: "docsUnreadablePermanent", docs_host: "docsReadLater", docs_load_failed: "docsLoadFailed", docs_not_found: "docsNotFound" } as const)[code as "docs_host"];
  return key ? t[key].replace("{name}", /"(.{1,500})"/.exec(message)?.[1] ?? "") : message;
};

/** Ids of the PDFs the provenance says were only partly read; anything unexpected in it is ignored. */
export const truncatedFiles = (p: Record<string, unknown> | undefined): Set<string> => {
  const files = (p?.docs as { files?: unknown } | undefined)?.files;
  return new Set(Array.isArray(files) ? files.flatMap((f: { file_id?: unknown; truncated?: unknown }) => (f && f.truncated === true && typeof f.file_id === "string" ? [f.file_id] : [])) : []);
};
