"""BibTeX and RIS for an answer's references: a line-for-line port of frontend/src/lib/bibliography.ts.
Both are asserted against the same fixtures (tests/fixtures/bibliography), so change them together."""
import re
import unicodedata

WS = r"[\t\n\v\f\r    -     　﻿]"  # JS \s (Python's \s differs)
TEX = {"\\": "\\textbackslash{}", "^": "\\^{}", "~": "\\~{}", "{": "\\textbraceleft{}", "}": "\\textbraceright{}"}
RAW = {"{": "%7B", "}": "%7D", "\\": "%5C", " ": "%20"}


def one(s: str) -> str:  # untrusted metadata: no newline may start a new line or entry
    return re.sub(WS + "+", " ", s).strip(" ")  # every run is one space by now


def esc(s: str) -> str:
    return re.sub(r"[{}%&_#$\\^~]", lambda m: TEX.get(m[0], "\\" + m[0]), one(s))


def raw(s: str) -> str:  # doi/url stay unescaped for LaTeX
    return re.sub(r"[{}\\ ]", lambda m: RAW[m[0]], one(s))


def author(a: str) -> str:  # a name containing " and " would split into two authors
    return "{" + esc(a) + "}" if re.search(WS + "and" + WS, one(a), re.I) else esc(a)


def family(a: str) -> str:
    """Text before a comma, else the last word; ASCII letters only (accents folded, Thai etc. dropped)."""
    name = a.split(",")[0] if "," in a else (re.split(WS + "+", one(a)) or [""])[-1]
    return re.sub("[^A-Za-z]", "", unicodedata.normalize("NFD", name)).lower()


def to_bibtex(refs: list[dict]) -> str:
    count: dict[str, int] = {}
    used: set[str] = set()
    out = []
    for ref in refs:
        p = ref["paper"]
        authors = p.get("authors") or []
        year = p.get("year")
        base = (family(authors[0] if authors else "") or "ref") + (str(year) if year is not None else "nd")
        i = count.get(base, 0)
        while True:
            key = base + ("" if i == 0 else chr(96 + i) if i <= 26 else str(i))
            i += 1
            if key not in used:
                break
        count[base] = i
        used.add(key)
        pmid = re.sub("[^0-9]", "", p.get("pmid") or "")
        fields = [("title", esc(p.get("title") or "")), ("author", " and ".join(author(a) for a in authors)),
                  ("year", "" if year is None else str(year)), ("doi", raw(p.get("doi") or "")),
                  ("note", f"PMID: {pmid}" if pmid else ""), ("url", raw(p.get("url") or ""))]
        body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields if v)
        out.append(f"@{'article' if p.get('doi') or year is not None else 'misc'}{{{key},\n{body}\n}}\n")
    return "\n".join(out)


def to_ris(refs: list[dict]) -> str:
    """CRLF line endings, one ER per record."""
    line = lambda tag, v: f"{tag}  - {one(v)}\r\n"  # noqa: E731
    out = []
    for ref in refs:
        p = ref["paper"]
        year = p.get("year")
        out.append(line("TY", "JOUR") + (line("TI", p["title"]) if p.get("title") else "")
                   + "".join(line("AU", a) for a in p.get("authors") or [])
                   + (line("PY", str(year)) if year is not None else "")
                   + (line("DO", p["doi"]) if p.get("doi") else "") + (line("UR", p["url"]) if p.get("url") else "")
                   + (line("N1", f"PMID: {p['pmid']}") if p.get("pmid") else "") + line("ER", ""))
    return "".join(out)
