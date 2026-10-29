"""The one place that lists where research evidence may come from.

PAPER_SOURCES: the 18 APIs of the `paper-lookup` skill. DATA_SOURCES: the scientific databases of the `database-lookup`
skill (revision SKILLS_REVISION in hermes.py). Hosts were taken from the https:// hosts in
~/.cache/scientist/upstream/scientific-agent-skills/skills/database-lookup/references/<db>.md, reduced to the registrable
site (api./rest./www. dropped) because a record links to a landing page, not to the API; shared hosts (ncbi.nlm.nih.gov,
www.ebi.ac.uk) stay as they are, so a record may cite any database on that host. Finance, economics, weather, patent,
government-statistics and general-purpose entries are left out (see the task report). The bridge cannot import this
module: hermes.py sends it the allowed ids and hosts in the request.
"""
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

PAPER_SOURCES: dict[str, str] = {
    "pubmed": "PubMed", "pmc": "PubMed Central", "europepmc": "Europe PMC", "biorxiv": "bioRxiv",
    "medrxiv": "medRxiv", "arxiv": "arXiv", "openalex": "OpenAlex", "crossref": "Crossref",
    "semanticscholar": "Semantic Scholar", "core": "CORE", "unpaywall": "Unpaywall",
    "opencitations": "OpenCitations", "pubtator3": "PubTator3", "zenodo": "Zenodo", "figshare": "figshare",
    "ror": "ROR", "biostudies": "BioStudies", "doaj": "DOAJ",
}


def _squash(v: str) -> str:
    return re.sub(r"[^a-z0-9]", "", v.lower())


_ALIASES = {_squash(k): k for k in PAPER_SOURCES} | {_squash(n): k for k, n in PAPER_SOURCES.items()} | {
    "s2": "semanticscholar", "pubmedcentral": "pmc", "europepubmedcentral": "europepmc", "pubtator": "pubtator3"}


def normalize_source(v: object) -> str | None:
    """Canonical paper-source id for a name the model wrote ("PubMed Central", "S2"), or None for anything else."""
    return _ALIASES.get(_squash(v)) if isinstance(v, str) else None


@dataclass(frozen=True)
class DataSource:
    name: str
    hosts: tuple[str, ...]
    needs_key: bool = False  # key-gated: skipped, the bridge passes no API keys


def _d(name: str, *hosts: str, key: bool = False) -> DataSource:
    return DataSource(name, hosts, key)


NCBI, EBI = "ncbi.nlm.nih.gov", "www.ebi.ac.uk"
DATA_SOURCES: dict[str, DataSource] = {
    "addgene": _d("Addgene", "addgene.org", key=True),
    "alphafold": _d("AlphaFold DB", "alphafold.ebi.ac.uk"),
    "bindingdb": _d("BindingDB", "bindingdb.org"),
    "biogrid": _d("BioGRID", "thebiogrid.org", key=True),
    "brenda": _d("BRENDA", "brenda-enzymes.org", key=True),
    "cbioportal": _d("cBioPortal", "cbioportal.org"),
    "chebi": _d("ChEBI", EBI),
    "chembl": _d("ChEMBL", EBI),
    "clinicaltrials": _d("ClinicalTrials.gov", "clinicaltrials.gov"),
    "clinpgx": _d("ClinPGx", "clinpgx.org"),
    "clinvar": _d("ClinVar", NCBI),
    "cod": _d("Crystallography Open Database", "crystallography.net"),
    "cosmic": _d("COSMIC", "cancer.sanger.ac.uk", key=True),
    "dailymed": _d("DailyMed", "dailymed.nlm.nih.gov"),
    "dbsnp": _d("dbSNP", NCBI),
    "disgenet": _d("DisGeNET", "disgenet.com", key=True),
    "drugbank": _d("DrugBank", "drugbank.com", key=True),
    "emdb": _d("EMDB", EBI),
    "ena": _d("European Nucleotide Archive", EBI),
    "encode": _d("ENCODE", "encodeproject.org"),
    "ensembl": _d("Ensembl", "ensembl.org"),
    "fda": _d("openFDA", "api.fda.gov", "open.fda.gov"),
    "gene-ontology": _d("Gene Ontology", "geneontology.org", EBI),
    "geo": _d("GEO", NCBI),
    "gnomad": _d("gnomAD", "gnomad.broadinstitute.org"),
    "gtex": _d("GTEx", "gtexportal.org"),
    "gwas-catalog": _d("GWAS Catalog", EBI),
    "hca": _d("Human Cell Atlas", "humancellatlas.org"),
    "hpo": _d("Human Phenotype Ontology", "ontology.jax.org"),
    "human-protein-atlas": _d("Human Protein Atlas", "proteinatlas.org"),
    "interpro": _d("InterPro", EBI),
    "jaspar": _d("JASPAR", "jaspar.elixir.no"),
    "kegg": _d("KEGG", "kegg.jp"),
    "lincs-l1000": _d("LINCS L1000", "clue.io", key=True),
    "materials-project": _d("Materials Project", "materialsproject.org", key=True),
    "metabolomics-workbench": _d("Metabolomics Workbench", "metabolomicsworkbench.org"),
    "monarch": _d("Monarch Initiative", "monarchinitiative.org"),
    "mousemine": _d("MouseMine", "mousemine.org"),
    "myvariant": _d("MyVariant.info", "myvariant.info"),
    "nasa-exoplanet-archive": _d("NASA Exoplanet Archive", "exoplanetarchive.ipac.caltech.edu"),
    "ncbi-gene": _d("NCBI Gene", NCBI),
    "ncbi-protein": _d("NCBI Protein", NCBI),
    "ncbi-taxonomy": _d("NCBI Taxonomy", NCBI),
    "nist": _d("NIST", "physics.nist.gov", "webbook.nist.gov"),
    "omim": _d("OMIM", "omim.org", key=True),
    "opentargets": _d("Open Targets", "opentargets.org"),
    "pdb": _d("RCSB PDB", "rcsb.org"),
    "pride": _d("PRIDE", EBI),
    "pubchem": _d("PubChem", "pubchem.ncbi.nlm.nih.gov"),
    "quickgo": _d("QuickGO", EBI),
    "reactome": _d("Reactome", "reactome.org"),
    "regulomedb": _d("RegulomeDB", "regulomedb.org"),
    "rummageo": _d("RummaGEO", "rummageo.com"),
    "sdss": _d("SDSS", "sdss.org"),
    "simbad": _d("SIMBAD", "simbad.cds.unistra.fr"),
    "sra": _d("SRA", NCBI),
    "string": _d("STRING", "string-db.org"),
    "tcga-gdc": _d("GDC (TCGA)", "gdc.cancer.gov"),
    "ucsc-genome": _d("UCSC Genome Browser", "genome.ucsc.edu"),
    "uniprot": _d("UniProt", "uniprot.org"),
    "who": _d("WHO Global Health Observatory", "who.int"),
    "zinc": _d("ZINC", "zinc.docking.org"),
}


def record_host_ok(db: str, url: str) -> bool:
    """https only, no userinfo, and the host is one of the database's official hosts or a subdomain of one."""
    source = DATA_SOURCES.get(db)
    if source is None or not isinstance(url, str):
        return False
    try:
        parts = urlsplit(url.strip())
        host, _ = parts.hostname, parts.port  # .port raises on a malformed port
    except ValueError:
        return False
    if parts.scheme != "https" or not host or "@" in parts.netloc:
        return False
    return any(host == h or host.endswith("." + h) for h in source.hosts)
