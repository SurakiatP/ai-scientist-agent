"""Domain packs: a field the user picks to steer which literature and database sources a research run prefers.
No pack (None) is General: nothing is added anywhere."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Pack:
    name_th: str
    name_en: str
    paper_sources: tuple[str, ...]  # ids of sources.PAPER_SOURCES
    databases: tuple[str, ...]  # ids of the keyless databases only (hermes.KEYLESS_SOURCES)
    libs: tuple[str, ...]  # analysis import roots (used by the analysis image, not by research)

    def hint(self, databases: bool = True) -> str:
        """The one line appended to the strategy message and every branch's instructions."""
        line = f"Field focus ({self.name_en}): prefer {', '.join(self.paper_sources)} for literature"
        if databases and self.databases:
            line += f" and {', '.join(self.databases)} for database facts"
        return line + "."


PACKS: dict[str, Pack] = {
    "bio": Pack("ชีวสารสนเทศ", "Bioinformatics", ("pubmed", "europepmc", "biorxiv"),
                ("uniprot", "ncbi-gene", "geo", "ensembl", "string", "reactome"), ("scanpy", "anndata")),
    "chem": Pack("เคมีสารสนเทศ", "Cheminformatics", ("pubmed", "europepmc", "crossref"),  # chemrxiv is not a paper source here
                 ("pubchem", "chembl", "chebi", "bindingdb", "zinc"), ("rdkit",)),
    "med": Pack("แพทยศาสตร์", "Medicine", ("pubmed", "europepmc", "medrxiv"),
                ("clinicaltrials", "clinvar", "dailymed", "fda", "who"), ("lifelines", "pymc", "scipy")),
    "materials": Pack("วัสดุศาสตร์", "Materials science", ("arxiv", "crossref", "openalex"), ("cod", "nist"), ("pymatgen",)),
    "ml": Pack("แมชชีนเลิร์นนิง", "Machine learning", ("arxiv", "semanticscholar", "openalex"), (), ("sklearn", "shap", "scipy")),
    "comm": Pack("นิเทศศาสตร์", "Communication", ("crossref", "openalex", "semanticscholar", "doaj"), (), ()),
}


def hint(pack: str | None, databases: bool) -> str:
    """"" for General (or an id this version does not know)."""
    return PACKS[pack].hint(databases) if pack in PACKS else ""
