"""Detect output the model should not have produced: letters in an unexpected script, or Thai marks stacked 3+ deep.
Detection only; callers re-ask or disclose, text is never edited."""
import re
import unicodedata

ALLOWED = {"LATIN", "THAI", "GREEK"}  # Greek: alpha, beta, mu are everyday science notation
STACKED = re.compile("[ัิ-ฺ็-๎]{3,}")  # 3+ combining marks in a row is never valid Thai


def _unexpected(ch: str) -> bool:
    # NFKC first: mathematical and fullwidth Latin letters fold to plain Latin
    return unicodedata.category(ch) in ("Lo", "Ll", "Lu", "Lt") and unicodedata.name(unicodedata.normalize("NFKC", ch)[0], "").split(" ")[0] not in ALLOWED


def stray(text: str, question: str, source_text: str) -> list[str]:
    """Runs of 2+ letters in an unexpected script (unless the question or sources contain them) and stacked Thai marks."""
    seen = question + "\n" + source_text
    found: list[str] = []
    run = ""
    for ch in text + " ":
        if run and unicodedata.category(ch)[0] == "M":  # combining marks stay inside the word (Devanagari, harakat, niqqud)
            run += ch
            continue
        if _unexpected(ch):
            run += ch
            continue
        if len(run) >= 2 and run not in seen and run not in found:
            found.append(run)
        run = ""
    for m in STACKED.finditer(text):
        if m[0] not in found and m[0] not in seen:
            found.append(m[0])
    return found
