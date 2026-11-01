"""Detect output the model should not have produced: letters in an unexpected script, or Thai marks stacked 3+ deep.
Detection only; callers re-ask or disclose, text is never edited."""
import re
import unicodedata
from collections import Counter

ALLOWED = {"LATIN", "THAI", "GREEK"}  # Greek: alpha, beta, mu are everyday science notation
STACKED = re.compile("[ัิ-ฺ็-๎]{3,}")  # 3+ combining marks in a row is never valid Thai


FAMILY = {"HIRAGANA": "CJK", "KATAKANA": "CJK"}  # ponytail: Han+kana are one family, so a Chinese question also lets kana through; split it if that slip shows up


def _script(ch: str) -> str:
    # NFKC first: mathematical and fullwidth Latin letters fold to plain Latin, half-width katakana to KATAKANA
    s = unicodedata.name(unicodedata.normalize("NFKC", ch)[0], "").split(" ")[0]
    return FAMILY.get(s, s)


def _question_scripts(q: str) -> set[str]:
    """Scripts the question is written in: at least 2 letters and a third of its non-Latin/Greek letters (Thai counts)."""
    n = Counter(_script(c) for c in q if unicodedata.category(c)[0] == "L" and _script(c) not in ("LATIN", "GREEK"))
    total = sum(n.values())
    return {s for s, k in n.items() if k >= 2 and 3 * k >= total}


def _unexpected(ch: str, allowed: set[str]) -> bool:
    return unicodedata.category(ch) in ("Lo", "Ll", "Lu", "Lt") and _script(ch) not in ALLOWED | allowed


def stray(text: str, question: str, source_text: str) -> list[str]:
    """Runs of 2+ letters in an unexpected script (unless the question or sources contain them) and stacked Thai marks."""
    seen = question + "\n" + source_text
    allowed = _question_scripts(question)
    found: list[str] = []
    run = ""
    for ch in text + " ":
        if run and unicodedata.category(ch)[0] == "M":  # combining marks stay inside the word (Devanagari, harakat, niqqud)
            run += ch
            continue
        if _unexpected(ch, allowed):
            run += ch
            continue
        if len(run) >= 2 and run not in seen and run not in found:
            found.append(run)
        run = ""
    for m in STACKED.finditer(text):
        if m[0] not in found and m[0] not in seen:
            found.append(m[0])
    return found
