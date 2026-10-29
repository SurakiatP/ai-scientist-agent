import pytest
from pydantic import ValidationError

from scientist import hermes, packs, sources
from scientist.routes_ask import AskRequest

Q = "What is known about X?"


def test_registry_ids_and_integrity():
    assert list(packs.PACKS) == ["bio", "chem", "med", "materials", "ml", "comm"]
    for k, p in packs.PACKS.items():
        assert set(p.paper_sources) <= set(sources.PAPER_SOURCES), k
        assert set(p.databases) <= set(hermes.KEYLESS_SOURCES), k  # keyless only
        assert len(p.hint()) <= 400 and p.name_th and p.name_en
    assert "materials-project" not in packs.PACKS["materials"].databases and "chemrxiv" not in packs.PACKS["chem"].paper_sources


def test_hint_text_exact():
    assert packs.hint("chem", True) == ("Field focus (Cheminformatics): prefer pubmed, europepmc, crossref for literature "
                                        "and pubchem, chembl, chebi, bindingdb, zinc for database facts.")
    assert packs.hint("chem", False) == "Field focus (Cheminformatics): prefer pubmed, europepmc, crossref for literature."
    assert packs.hint("ml", True) == "Field focus (Machine learning): prefer arxiv, semanticscholar, openalex for literature."
    assert packs.hint(None, True) == "" and packs.hint("nope", True) == ""


def test_request_pack_validation(monkeypatch, tmp_path):
    from scientist.config import get_settings
    monkeypatch.chdir(tmp_path)
    for k, v in {"OPENROUTER_API_KEY": "k", "MODEL": "m", "FALLBACK_MODEL": "f", "HERMES_SOURCE_PATH": ".", "HERMES_REVISION": "x"}.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    assert AskRequest(question=Q).pack is None and AskRequest(question=Q, pack="bio").pack == "bio"
    with pytest.raises(ValidationError):
        AskRequest(question=Q, pack="alchemy")
    get_settings.cache_clear()
