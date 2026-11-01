"""Render a report draft as LaTeX source in one of a few journal/conference templates (the classes ship with TeX Live, so the
file compiles on Overleaf or any local TeX). All text is untrusted: every character LaTeX treats as markup is escaped, URLs are
written only when they are plain, and citations [n] become \\cite{} only for references that exist. XeLaTeX throughout: papers
carry arbitrary Unicode, and Thai needs fontspec plus ICU line breaking."""
import re
from contextvars import ContextVar

from pythainlp.tokenize import word_tokenize

from scientist.report_render import LABELS, blocks_of, clean

TEMPLATES = {  # id -> (\documentclass line, abstract heading inside frontmatter, serif face for Latin text or None = Latin Modern)
    "article": (r"\documentclass[11pt]{article}", False, None),
    "ieee": (r"\documentclass[conference]{IEEEtran}", False, "texgyretermes"),
    "elsevier": (r"\documentclass[preprint,12pt]{elsarticle}", True, "texgyretermes"),
    "springer": (r"\documentclass[runningheads]{llncs}", False, "texgyretermes"),
}
ESC = str.maketrans({"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "$": r"\$", "&": r"\&", "#": r"\#", "_": r"\_", "%": r"\%",
                     "^": r"\textasciicircum{}", "~": r"\textasciitilde{}", "<": r"\textless{}", ">": r"\textgreater{}", "|": r"\textbar{}"})
# Text faces lack Greek and maths symbols (science text is full of them): write those as maths, which every engine has.
GREEK = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi o pi rho varsigma sigma tau upsilon phi chi psi omega"
MATH = {chr(0x3B1 + i): ("o" if g == "o" else rf"\ensuremath{{\{g}}}") for i, g in enumerate(GREEK.split())}
MATH |= {chr(c): rf"\ensuremath{{\{g}}}" for c, g in zip((0x393, 0x394, 0x398, 0x39B, 0x39E, 0x3A0, 0x3A3, 0x3A6, 0x3A8, 0x3A9),
                                                        "Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega".split())}
MATH |= {chr(c): rf"\ensuremath{{\{g}}}" for c, g in ((0xB5, "mu"), (0x2265, "geq"), (0x2264, "leq"), (0xB1, "pm"), (0xD7, "times"),
                                                      (0x2192, "rightarrow"), (0x2190, "leftarrow"), (0x2248, "approx"), (0x2260, "neq"),
                                                      (0x223C, "sim"), (0xB7, "cdot"), (0x221E, "infty"), (0x221A, "surd"))}
THAI = re.compile("[฀-๿]")
EXT_LATIN = re.compile("[À-ɏ]")  # the Thai face has basic Latin only: accented names (Szőke, Łukasz) borrow the Latin face
_thai: ContextVar[bool] = ContextVar("thai", default=False)
_two_col: ContextVar[bool] = ContextVar("two_col", default=False)
CITE = re.compile(r"(?:\[\d+(?:\s*[,\u2013-]\s*\d+)*\])+")  # [1], [1, 3], [2-4] and runs of them: [6][7][8]
SAFE_URL = re.compile(r"https?://[A-Za-z0-9\-._~:/?=&@!$'()*+,;]+")  # no %, #, braces or backslash: \url{} takes it verbatim
ABSTRACT = re.compile(r"^\s*(abstract|summary|บทคัดย่อ|บทสรุป|สรุป)\b", re.I)
WORDS = {"th": {"refs": "เอกสารอ้างอิง", "abstract": "บทคัดย่อ"}, "en": {"refs": "References", "abstract": "Abstract"}}


def tex(s: str) -> str:
    s = clean(s)
    if _thai.get() and THAI.search(s):  # Thai has no spaces between words: mark each word boundary as a break point
        toks = word_tokenize(s, engine="newmm", keep_whitespace=True)
        return "".join((r"\allowbreak{}" if i and THAI.search(t) and THAI.search(toks[i - 1]) else "") + _esc(t) for i, t in enumerate(toks))
    return _esc(s)


def _esc(s: str) -> str:
    out = s.translate(ESC).translate(str.maketrans(MATH))
    return EXT_LATIN.sub(lambda m: rf"{{\latinfont {m[0]}}}", out) if _thai.get() else out


def _url(u: str | None) -> str:
    """A plain http(s) URL as a url command, any other http(s) URL as escaped text, anything else (javascript:, file:) not at all."""
    if not u or not u.lower().startswith(("http://", "https://")):
        return ""
    return rf"\url{{{u}}}" if SAFE_URL.fullmatch(u) else tex(u)


def _text(s: str, keys: dict[str, str]) -> str:
    """Escaped text; [1], [1, 3], [2-4] become \\cite{} when every number is a known reference, else stay as text."""
    out, pos = [], 0
    for m in CITE.finditer(s):
        ids: list[str] = []
        for part in re.split(r"\s*,\s*|\]\[", m[0][1:-1]):
            lo, _, hi = re.split(r"\s*([–-])\s*", part, maxsplit=1) if re.search(r"[–-]", part) else (part, "", "")
            a, b = int(lo), int(hi or lo)
            ids += [str(n) for n in range(a, min(b, a + 100) + 1)] if a <= b else [lo]
        if ids and all(i in keys for i in ids):
            out += [tex(s[pos:m.start()]), r"\cite{" + ",".join(dict.fromkeys(keys[i] for i in ids)) + "}"]
            pos = m.end()
    return "".join(out) + tex(s[pos:])


def _runs(runs: list[dict], keys: dict[str, str]) -> str:
    out = []
    for r in runs:
        t = r"\newline ".join(_text(x, keys) for x in r["text"].split("\n"))
        if r.get("code"):
            t = rf"\texttt{{{t}}}"
        if r.get("italic"):
            t = rf"\emph{{{t}}}"
        if r.get("bold"):
            t = rf"\textbf{{{t}}}"
        out.append(t)
    return "".join(out).strip()


def _block(b: dict, keys: dict[str, str]) -> str:
    if b["type"] == "paragraph":
        return _runs(b["runs"], keys)
    if b["type"] in ("bullets", "numbered"):
        env = "itemize" if b["type"] == "bullets" else "enumerate"
        return "\n".join([rf"\begin{{{env}}}", *(r"  \item " + _runs(i, keys) for i in b["items"]), rf"\end{{{env}}}"])
    n = max([len(b["header"])] + [len(r) for r in b["rows"]] + [1])
    col = rf"p{{\dimexpr(\linewidth-{2 * n}\tabcolsep)/{n}\relax}}"
    row = lambda cells, f=lambda c: _text(c, keys): " & ".join(f(c) for c in cells + [""] * (n - len(cells))) + r" \\"  # noqa: E731
    head = [row(b["header"], lambda c: rf"\textbf{{{tex(c)}}}" if c else ""), r"\midrule"] if b["header"] else []
    rows = [row(r) for r in b["rows"]]
    if _two_col.get():  # two columns cannot break a table across pages: span both columns at the top of a page
        col = col.replace(r"\linewidth", r"\textwidth")
        return "\n".join([r"\begin{table*}[!t]", r"\centering", r"\small", rf"\begin{{tabular}}{{{col * n}}}", r"\toprule", *head, *rows,
                          r"\bottomrule", r"\end{tabular}", r"\end{table*}"])
    # supertabular breaks between rows across pages (longtable kept tall-row tables whole and left blank pages); the header repeats
    top = "\n".join([r"\toprule", *head])
    return "\n".join([r"\par\medskip", r"{\small", rf"\tablefirsthead{{{top}}}", rf"\tablehead{{{top}}}", r"\tabletail{\midrule}",
                      r"\tablelasttail{\bottomrule}", rf"\begin{{supertabular}}{{{col * n}}}", *rows, r"\end{supertabular}}", r"\par\medskip"])


def _line(s: str) -> str:
    """Escaped single-line text: a blank line inside \\author{} or \\keywords{} would end the paragraph and break the build."""
    return tex(" ".join(s.split()))


def _front(d: dict, cls: str, kw_label: str) -> tuple[list[str], list[str]]:
    """(author lines, keyword lines placed after the abstract); empty lists when the request has none."""
    authors = [(_line(a["name"]), _line(a["affiliation"]) if a.get("affiliation") else "") for a in d.get("authors") or []]
    kws = [k for k in map(_line, d.get("keywords") or []) if k]
    AND = r" \and "
    if cls.endswith("{IEEEtran}"):
        au = r"\author{" + AND.join(r"\IEEEauthorblockN{" + n + "}" + (r"\IEEEauthorblockA{" + a + "}" if a else "") for n, a in authors) + "}"
        kw = [r"\begin{IEEEkeywords}", ", ".join(kws), r"\end{IEEEkeywords}"] if kws else []
    elif cls.endswith("{elsarticle}"):
        au = "\n".join(rf"\author[a{i}]{{{n}}}\address[a{i}]{{{a}}}" if a else rf"\author{{{n}}}" for i, (n, a) in enumerate(authors, 1))
        kw = [r"\begin{keyword}", r" \sep ".join(kws), r"\end{keyword}"] if kws else []
    elif cls.endswith("{llncs}"):
        affs = list(dict.fromkeys(a for _, a in authors if a))
        au = r"\author{" + AND.join(n + (rf"\inst{{{affs.index(a) + 1}}}" if a else "") for n, a in authors) + "}"
        if affs:
            au += "\n" + r"\institute{" + AND.join(affs) + "}"
        kw = [r"\keywords{" + AND.join(kws) + "}"] if kws else []
    else:
        au = r"\author{" + AND.join(n + (r" \\ \small " + a if a else "") for n, a in authors) + "}"
        kw = [r"\par\noindent\textbf{" + kw_label + r":} " + ", ".join(kws) + r"\par\medskip"] if kws else []
    return ([au] if authors else []), kw


def _ref(r: dict) -> str:
    bits = []
    if r["authors"]:
        bits.append(tex(", ".join(r["authors"])) + ".")
    bits.append(tex(r["title"]) + ".")
    if r["year"]:
        bits.append(f"{r['year']}.")
    if r["doi"]:
        bits.append(_url(f"https://doi.org/{r['doi']}") if SAFE_URL.fullmatch(f"https://doi.org/{r['doi']}") else "doi: " + tex(r["doi"]))
    elif r["url"]:
        bits.append(_url(r["url"]))
    return " ".join(b for b in bits if b)


def render_latex(d: dict) -> bytes:
    """d is an ExportRequest dump; d["template"] picks the class. Returns UTF-8 LaTeX source."""
    tokens = _thai.set(False), _two_col.set((d.get("template") or "article") == "ieee")
    try:
        return _render(d)
    finally:
        _thai.reset(tokens[0])
        _two_col.reset(tokens[1])


def _render(d: dict) -> bytes:
    cls, front, latin = TEMPLATES[d.get("template") or "article"]
    sections = [dict(s) for s in d["sections"]]
    text_all = (d["title"] + "".join(s["heading"] for s in sections) + str(sections) + (d.get("abstract") or "") + str(d.get("authors") or [])
                + str(d.get("keywords") or []) + str(d.get("statements") or []) + str(d["references"]))
    thai = d["language"] == "th" or bool(THAI.search(text_all))
    _thai.set(thai)  # read by tex(); reset by render_latex
    w = WORDS["th" if d["language"] == "th" else "en"]
    lbl = LABELS["th" if d["language"] == "th" else "en"]
    keys = {r["id"]: f"ref{i}" for i, r in enumerate(d["references"], 1)}
    abstract = ""
    if d.get("abstract"):  # the front-matter field wins; a section headed Abstract then stays a normal section
        abstract = "\n\n".join(tex(p) for p in re.split(r"\n\s*\n", d["abstract"].strip()) if p.strip())
    elif sections and ABSTRACT.match(sections[0]["heading"]):
        abstract = "\n\n".join(_block(b, keys) for b in blocks_of(sections.pop(0)))

    pre = ["% !TeX program = xelatex", "% Draft exported from AI Scientist. Add the authors; check every claim and reference before submitting.",
           cls]
    if cls.endswith("{article}"):
        pre.append(r"\usepackage[margin=1in]{geometry}")
    pre += [r"\usepackage{fontspec}", r"\usepackage{booktabs}", r"\usepackage{array}", r"\usepackage{supertabular}", r"\usepackage{url}"]
    if thai:  # TeX Live's fonts-tlwg; Laksaman is the Sarabun-style face. Word breaks come from tex() (pythainlp), not the engine.
        pre += [r"\setmainfont{Laksaman}[Extension=.otf, UprightFont=*, BoldFont=*-Bold, ItalicFont=*-Italic, BoldItalicFont=*-BoldItalic, Scale=1.2]",
                r"\newfontfamily\latinfont{texgyretermes}[Extension=.otf, UprightFont=*-regular, BoldFont=*-bold, ItalicFont=*-italic, BoldItalicFont=*-bolditalic]",
                r"\usepackage{ragged2e}", r"\AtBeginDocument{\RaggedRight}", r"\linespread{1.1}"]  # justified Thai spreads the word breaks into visible gaps
    elif latin:
        pre.append(rf"\setmainfont{{{latin}}}[Extension=.otf, UprightFont=*-regular, BoldFont=*-bold, ItalicFont=*-italic, BoldItalicFont=*-bolditalic]")
    if not cls.endswith("{IEEEtran}"):
        pre.append(r"\usepackage[hidelinks]{hyperref}")
    pre += [rf"\providecommand{{\abstractname}}{{}}\renewcommand{{\abstractname}}{{{w['abstract']}}}",
            rf"\providecommand{{\refname}}{{}}\renewcommand{{\refname}}{{{w['refs']}}}"]

    title = tex(d["title"])
    au, kw = _front(d, cls, tex(lbl["keywords"]))
    body = [r"\begin{document}"]
    if front:  # elsarticle: title, author and abstract live in the frontmatter environment
        body += [r"\begin{frontmatter}", rf"\title{{{title}}}", *(au or [r"\author{}  % add the authors"])]
        if abstract:
            body += [r"\begin{abstract}", abstract, r"\end{abstract}"]
        body += kw + [r"\end{frontmatter}"]
    else:
        pre += [rf"\title{{{title}}}", *(au or [r"\author{}  % add the authors"])]
        if cls.endswith("{llncs}") and not au:
            pre.append(r"\institute{}  % add the affiliations")
        if cls.endswith("{article}"):
            pre.append(r"\date{\today}")
        body.append(r"\maketitle")
        if abstract:
            body += [r"\begin{abstract}", abstract, r"\end{abstract}"]
        body += kw
    if d.get("subtitle"):
        body.append(rf"\noindent\emph{{{tex(d['subtitle'])}}}" + "\n")
    for s in sections:
        if s["heading"].strip():
            body.append(rf"\section{{{tex(s['heading'])}}}")
        body += [_block(b, keys) + "\n" for b in blocks_of(s)]
    for st in d.get("statements") or []:
        body += [rf"\section*{{{tex(lbl['stmt'][st['kind']])}}}", "\n\n".join(tex(p) for p in re.split(r"\n\s*\n", st["text"].strip()) if p.strip()) + "\n"]
    if d["references"]:
        body.append(r"\begin{thebibliography}{99}")
        body += [rf"\bibitem{{{keys[r['id']]}}} {_ref(r)}" for r in d["references"]]
        body.append(r"\end{thebibliography}")
    body.append(r"\end{document}")
    return ("\n".join(pre) + "\n\n" + "\n".join(body) + "\n").encode()
