import pytest
from pydantic import ValidationError

from scientist.events import DataRecord, Paper
from scientist.sources import DATA_SOURCES, PAPER_SOURCES, normalize_source, record_host_ok


def test_paper_sources_are_the_eighteen():
    assert set(PAPER_SOURCES) == set("""pubmed pmc europepmc biorxiv medrxiv arxiv openalex crossref semanticscholar
        core unpaywall opencitations pubtator3 zenodo figshare ror biostudies doaj""".split())


@pytest.mark.parametrize("raw,want", [
    ("PubMed Central", "pmc"), ("Europe PMC", "europepmc"), ("europe_pmc", "europepmc"), ("S2", "semanticscholar"),
    ("Semantic Scholar", "semanticscholar"), (" PubMed ", "pubmed"), ("bioRxiv", "biorxiv"), ("arXiv.org", None),
    ("garbage", None), ("", None), (None, None), (5, None), ("PubTator", "pubtator3")])
def test_normalize_source(raw, want):
    assert normalize_source(raw) == want


def test_paper_source_garbage_is_none_not_rejected():
    assert Paper(title="t", url="https://x.org", source="PubMed Central").source == "pmc"
    assert Paper(title="t", url="https://x.org", source="nonsense").source is None
    assert Paper(title="t", url="https://x.org").source is None


def test_every_data_source_has_name_and_hosts():
    assert len(DATA_SOURCES) > 30
    for key, d in DATA_SOURCES.items():
        assert d.name and d.hosts, key
        assert all(h == h.lower() and "/" not in h for h in d.hosts), key


URL_CASES = [
    ("https://uniprot.org/uniprotkb/P04637", True), ("https://rest.uniprot.org/uniprotkb/P04637", True),
    ("https://UniProt.org/x", True), ("https://uniprot.org.evil.com/x", False), ("https://eviluniprot.org/x", False),
    ("http://uniprot.org/x", False), ("https://93.184.216.34/x", False), ("https://uniprot.org@evil.com/", False),
    ("https://evil.com/?u=uniprot.org", False),
    ("https://evil.com\\.uniprot.org/x", False), ("https://evil.com%2f.uniprot.org/x", False),
    ("https://evil.com%2F.uniprot.org/x", False), ("https://uniprot.org /x", False), ("https://uniprot.org/a b", False),
    ("https://uniprot.org\\@evil.com/", False), ("https://uniprot.org:443/x", True), ("https://uniprot.org", True), ("javascript:alert(1)", False), ("https://uniprot.org:bad/x", False)]


@pytest.mark.parametrize("url,ok", URL_CASES)
def test_record_host_ok(url, ok):
    assert record_host_ok("uniprot", url) is ok


def test_record_host_unknown_database():
    assert not record_host_ok("nope", "https://uniprot.org/x")


GOOD = {"database": "uniprot", "id": "P04637", "title": "p53", "url": "https://www.uniprot.org/uniprotkb/P04637"}


def test_data_record_rules():
    assert DataRecord(**GOOD).summary == ""
    for bad in ({"database": "nope"}, {"url": "http://uniprot.org/x"}, {"title": "x" * 301}, {"summary": "x" * 601},
                {"id": "x" * 101}, {"id": ""}):
        with pytest.raises(ValidationError):
            DataRecord(**{**GOOD, **bad})


def test_data_record_strips_and_caps():
    assert DataRecord(**{**GOOD, "title": "  p53  ", "id": " P1 "}).title == "p53"
    for bad in ({"title": "   "}, {"id": "  "}, {"url": "https://uniprot.org/" + "a" * 2000}):
        with pytest.raises(ValidationError):
            DataRecord(**{**GOOD, **bad})
