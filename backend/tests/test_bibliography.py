"""Parity with frontend/src/lib/bibliography.ts: both sides assert the same fixtures (frontend/src/lib/bibliography.fixtures.test.ts)."""
import json
from pathlib import Path

import pytest

from scientist.bibliography import to_bibtex, to_ris

FIX = sorted((Path(__file__).parent / "fixtures" / "bibliography").glob("*.json"))


def test_fixtures_exist():
    assert len(FIX) >= 8


@pytest.mark.parametrize("path", FIX, ids=lambda p: p.stem)
def test_matches_the_frontend_output(path):
    case = json.loads(path.read_text(encoding="utf-8"))
    assert to_bibtex(case["references"]) == case["bibtex"]
    assert to_ris(case["references"]) == case["ris"]
