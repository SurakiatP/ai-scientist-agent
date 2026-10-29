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


# --- pipeline, provenance, runs --------------------------------------------------------------------------------------
from test_pipeline import Plan, Q as RQ, crossref, replan_reply, settings, strategy  # noqa: E402,F401
from scientist.events import BranchAnswer, Paper  # noqa: E402
from scientist.gate import RunGate  # noqa: E402
from scientist.pipeline import ask  # noqa: E402

HINT = "Field focus (Cheminformatics): prefer pubmed, europepmc, crossref for literature and pubchem, chembl, chebi, bindingdb, zinc for database facts."
BASE = "Field focus (Cheminformatics): prefer pubmed, europepmc, crossref for literature."


class Spy:
    """Branch runner that records the instructions it was given."""
    system = "branch system"

    def __init__(self):
        self.seen = []

    async def run(self, term, instructions):
        self.seen.append((term, instructions))
        yield Paper(title=term, authors=["A"], year=2024, doi=f"10.1/{term}", url="https://x.org")
        yield BranchAnswer(term=term, content="ok")


def strat(fc):
    return next(c["user"] for c in fc["calls"] if c["json_mode"])


async def go(settings, fake_complete, *, pack, skills=("database-lookup",), plan=None, rounds=0):
    settings.enabled_skills, settings.replan_rounds = list(skills), rounds
    fake_complete["strategy"] = strategy("a")
    spy = Spy()
    events = [e async for e in ask(RQ, spy, settings=settings, client=crossref(), gate=RunGate(4), pack=pack, plan=plan)]
    return spy, events


async def test_general_prompts_are_byte_identical(settings, fake_complete):
    spy, events = await go(settings, fake_complete, pack=None)
    assert spy.seen == [("a", "extract a")]
    assert strat(fake_complete) == f"Question:\n{RQ}"
    assert next(e for e in events if e.type == "final_answer").provenance.pack is None


async def test_pack_hint_reaches_strategy_branch_and_provenance(settings, fake_complete):
    spy, events = await go(settings, fake_complete, pack="chem")
    assert strat(fake_complete) == f"Question:\n{RQ}\n\n{HINT}"
    assert spy.seen == [("a", f"extract a\n{HINT}")]
    p = next(e for e in events if e.type == "final_answer").provenance
    assert p.pack == "chem" and p.rounds[0].searches[0].instructions == "extract a"  # provenance keeps the model's own text


async def test_databases_part_omitted_without_the_skill_and_given_plan_still_hinted(settings, fake_complete):
    spy, _ = await go(settings, fake_complete, pack="chem", skills=(), plan=[Plan("p")])
    assert spy.seen == [("p", f"\n{BASE}".strip())]
    assert not any(c["json_mode"] for c in fake_complete["calls"])  # given plan: no strategy call


async def test_replan_searches_get_the_hint(settings, fake_complete):
    fake_complete["replan"] = replan_reply("wider")
    settings.replan_min_papers = 5  # one paper is thin
    spy, _ = await go(settings, fake_complete, pack="chem", rounds=1)
    assert ("wider", f"extract wider\n{HINT}") in spy.seen
