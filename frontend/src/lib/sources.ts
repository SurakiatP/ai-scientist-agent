import type { DataRecord, RunUsage } from "./sse";

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

/** A stored/streamed usage is unvalidated: the object when every field is well-formed, else undefined (the turn stays, the line hides). */
export const usableUsage = (u: unknown): RunUsage | undefined => {
  const x = u as Partial<Record<keyof RunUsage, unknown>> | null;
  const n = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  return x && typeof x === "object" && n(x.prompt_tokens) && n(x.completion_tokens) && (x.cost_usd === null || n(x.cost_usd)) && typeof x.estimated === "boolean" ? (x as RunUsage) : undefined;
};
