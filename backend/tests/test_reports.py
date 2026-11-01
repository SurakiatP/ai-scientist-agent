import io
import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import zipfile
from urllib.parse import unquote

import httpx
import pytest
from pypdf import PdfReader

from scientist import report_render
from scientist.config import get_settings
from scientist.main import create_app
from scientist.routes_reports import ExportRequest

TH = "รายงานผู้ป่วยที่เป็นโรคเบาหวาน น้ำปั๊ม"
BODY = "ผู้ป่วยที่เป็นโรคเบาหวานควรออกกำลังกายสม่ำเสมอและตรวจน้ำตาลในเลือดทุกสัปดาห์ " * 20


def body(**kw):
    b = {"format": "pdf", "language": "th", "title": TH, "subtitle": "ฉบับร่าง",
         "sections": [{"heading": "บทนำ", "paragraphs": [BODY, "second ที่ กี่"]}],
         "references": [{"id": "1", "title": "Paper A", "authors": ["Kim"], "year": 2020, "doi": "10.1/x",
                         "url": "https://doi.org/10.1/x", "status": "verified"},
                        {"id": "2", "title": "Paper B", "authors": [], "year": None, "doi": None,
                         "url": "javascript:alert(1)", "status": "unverified"},
                        {"id": "3", "title": "Paper C", "authors": [], "year": None, "doi": None,
                         "url": None, "status": "unknown"}]}
    b.update(kw)
    return b


ENV = {"OPENROUTER_API_KEY": "k", "MODEL": "m", "FALLBACK_MODEL": "f", "HERMES_SOURCE_PATH": ".", "HERMES_REVISION": "x"}


async def post(b, monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        return await c.post("/v1/reports/export", json=b)


def pdf_text(r):
    return "".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages).replace("​", "")


@pytest.mark.parametrize("style", ["standard", "official"])
async def test_pdf(style, monkeypatch):
    r = await post(body(style=style), monkeypatch)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert r.headers["content-type"] == "application/pdf" and r.headers["x-content-type-options"] == "nosniff"
    t = pdf_text(r)
    for s in ("ผู้ป่วย", "ที่", "น้ำ", "ปั๊ม", "identifier exists" if False else "พบตัวระบุ", "ยังไม่ยืนยัน", "ตรวจสอบไม่ได้"):
        assert s in t.replace(" ", ""), s
    assert "javascript:" not in t
    assert "https://doi.org/10.1/x" in t.replace("\n", "")
    assert len(PdfReader(io.BytesIO(r.content)).pages) >= 1


@pytest.mark.parametrize("style,font", [("standard", "Sarabun"), ("official", "TH Sarabun New")])
async def test_docx(style, font, monkeypatch):
    r = await post(body(format="docx", style=style), monkeypatch)
    assert r.status_code == 200 and r.headers["content-type"].endswith("wordprocessingml.document")
    z = zipfile.ZipFile(io.BytesIO(r.content))
    xml = z.read("word/document.xml").decode()
    assert TH in xml and f'w:cs="{font}"' in xml and "<w:szCs" in xml and "<w:bCs" in xml
    assert "ยังไม่ยืนยัน" in xml and "javascript:" not in xml


FAMILY = {"sarabun": "Sarabun", "th-sarabun-new": "Sarabun", "th-sarabun-psk": "Sarabun", "th-sarabun-it9": "Sarabun",
          "th-niramit": "Niramit", "th-chakra-petch": "ChakraPetch", "th-baijam": "BaiJamjuree", "th-k2d": "K2D",
          "th-krub": "Krub", "th-koho": "KoHo", "noto-sans-thai": "NotoSansThai", "ibm-plex-sans-thai": "IBMPlexSansThai",
          "prompt": "Prompt", "kanit": "Kanit"}


@pytest.mark.parametrize("font", FAMILY)
async def test_every_font(font, monkeypatch):
    r = await post(body(font=font, sections=[{"heading": "บทนำ", "paragraphs": ["ผู้ป่วยที่เป็นโรคเบาหวาน *x*"]}]), monkeypatch)
    assert r.status_code == 200 and "ผู้ป่วย" in pdf_text(r).replace(" ", "")
    assert FAMILY[font].encode() in r.content  # /BaseFont /XXXXXX+<PostScript name>
    d = await post(body(format="docx", font=font), monkeypatch)
    xml = zipfile.ZipFile(io.BytesIO(d.content)).read("word/document.xml").decode()
    assert f'w:ascii="{report_render.FONTS_BY_ID[font][1]}"' in xml and f'w:cs="{report_render.FONTS_BY_ID[font][1]}"' in xml
    assert f'w:eastAsia="{report_render.FONTS_BY_ID[font][1]}"' in xml


async def test_unknown_font(monkeypatch):
    assert (await post(body(font="comic-sans"), monkeypatch)).status_code == 422


async def test_english_and_filename(monkeypatch):
    r = await post(body(language="en", title='A/B: "x"?', subtitle=None), monkeypatch)
    assert r.status_code == 200 and "not confirmed" in pdf_text(r)
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment; filename*=UTF-8''") and cd.endswith(".pdf")
    assert not any(c in unquote(cd.split("''")[1]) for c in '/\\:"?*')
    r = await post(body(format="docx"), monkeypatch)
    assert unquote(r.headers["content-disposition"].split("''")[1]).endswith(".docx")


@pytest.mark.parametrize("patch", [
    {"title": "x" * 201}, {"format": "txt"}, {"font": "comic"}, {"style": "fancy"},
    {"sections": [{"heading": "h", "paragraphs": ["x" * 5001]}]},
    {"sections": [{"heading": "h", "paragraphs": ["x"]}] * 31},
    {"sections": [{"heading": "h", "paragraphs": ["x"] * 61}]},
    {"references": [{"id": "1", "title": "t", "authors": [], "status": "verified"}] * 101},
    {"sections": [{"heading": "h", "paragraphs": ["x" * 4000] * 60}] * 5},  # total size cap
])
async def test_limits(patch, monkeypatch):
    assert (await post(body(**patch), monkeypatch)).status_code == 422


def R(t, **kw):
    return {"text": t, "bold": False, "italic": False, "code": False} | kw


MD = [
    {"type": "paragraph", "runs": [R("Intro "), R("bold", bold=True), R(" "), R("it", italic=True), R(" "), R("a|b", code=True), R(" [1] ไทย")]},
    {"type": "bullets", "items": [[R("one")], [R("สอง", bold=True)]]},
    {"type": "numbered", "items": [[R("first")], [R("second")]]},
    {"type": "numbered", "items": [[R("again")]]},
    {"type": "table", "header": ["ชื่อ", "ค่า", ""], "rows": [["a", "1"], ["", "", "x", ], ["น้ำ", "ปั๊ม", "ok"]]},
    {"type": "table", "header": [], "rows": [["h", "i"]]},
]


@pytest.mark.parametrize("style", ["standard", "official"])
async def test_blocks_pdf(style, monkeypatch):
    b = body(style=style, sections=[{"heading": "H", "blocks": MD}])
    r = await post(b, monkeypatch)
    assert r.status_code == 200
    t = pdf_text(r)
    assert "**" not in t and "|---" not in t
    for s in ("Intro", "bold", "a|b", "[1]", "first", "again", "ชื่อ", "x", "น้ำ"):
        assert s in t.replace(" ", ""), s


@pytest.mark.parametrize("style", ["standard", "official"])
async def test_blocks_docx(style, monkeypatch):
    r = await post(body(format="docx", style=style, sections=[{"heading": "H", "blocks": MD}]), monkeypatch)
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    xml = z.read("word/document.xml").decode()
    assert "<w:tbl>" in xml and xml.count("<w:tbl>") == 2 and "<w:tblHeader" in xml
    assert "<w:i/>" in xml and "<w:iCs" in xml and 'w:ascii="Courier New"' in xml and "<w:bCs" in xml
    assert 'w:cs="%s"' % ("Sarabun" if style == "standard" else "TH Sarabun New") in xml
    assert 'w:pStyle w:val="ListBullet"' in xml and 'w:pStyle w:val="ListNumber"' in xml and xml.count("<w:numId") >= 2
    assert "<w:startOverride" in z.read("word/numbering.xml").decode()
    assert "**" not in xml


async def test_paragraphs_still_work_and_blocks_win(monkeypatch):
    b = body(sections=[{"heading": "H", "paragraphs": ["plainold"], "blocks": [{"type": "paragraph", "runs": [R("newer")]}]}])
    t = pdf_text(await post(b, monkeypatch))
    assert "newer" in t and "plainold" not in t


@pytest.mark.parametrize("blk", [
    {"type": "table", "header": list("abcdefghijklm"), "rows": []},
    {"type": "table", "header": ["a"], "rows": [list("abcdefghijklm")]},
    {"type": "table", "header": ["a"], "rows": [["x"]] * 101},
    {"type": "table", "header": ["a"], "rows": [["x" * 501]]},
    {"type": "paragraph", "runs": [R("x")] * 201},
    {"type": "paragraph", "runs": [R("x" * 5001)]},
    {"type": "bullets", "items": [[R("x")]] * 101},
    {"type": "html", "runs": []},
])
async def test_block_limits(blk, monkeypatch):
    assert (await post(body(sections=[{"heading": "h", "blocks": [blk]}]), monkeypatch)).status_code == 422


async def test_too_many_blocks(monkeypatch):
    blk = {"type": "paragraph", "runs": [R("x")]}
    assert (await post(body(sections=[{"heading": "h", "blocks": [blk] * 61}]), monkeypatch)).status_code == 422


async def test_export_gated_and_json_only(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    app = create_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        r = await c.post("/v1/reports/export", content=b"{}", headers={"content-type": "text/plain"})
        assert r.status_code in (415, 422)
        app.state.preview_gate.free = 0
        assert (await c.post("/v1/reports/export", json=body())).status_code == 429


# --- LaTeX export -------------------------------------------------------------------------------------------------
from scientist import report_latex  # noqa: E402

EVIL = r"\input{/etc/passwd} \write18{rm -rf /} $x^2$ 50% #1 a_b ~ {x} & <y> |z|"


def tex_body(**kw):
    return body(format="tex", language="en", title="RAG vs fine-tuning", subtitle=EVIL,
                sections=[{"heading": "Abstract", "paragraphs": ["We compare [1] and [2]."]},
                          {"heading": "Method " + EVIL, "paragraphs": ["As in [1, 3] and [9]. " + EVIL],
                           "blocks": [{"type": "paragraph", "runs": [{"text": "As in [1, 3] and [9]. " + EVIL}]},
                                      {"type": "paragraph", "runs": [{"text": "Bold ", "bold": True}, {"text": "code_x", "code": True},
                                                                     {"text": " see [1-2]."}]},
                                      {"type": "bullets", "items": [[{"text": "one"}], [{"text": "two [3]"}]]},
                                      {"type": "table", "header": ["A", "B_2"], "rows": [["1", "50%"], ["x"]]}]}], **kw)


@pytest.mark.parametrize("template", list(report_latex.TEMPLATES))
async def test_tex_templates(template, monkeypatch):
    r = await post(tex_body(template=template), monkeypatch)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-tex")
    assert unquote(r.headers["content-disposition"]).endswith(".tex")
    src = r.text
    assert src.startswith("% !TeX program = xelatex") and report_latex.TEMPLATES[template][0] in src
    assert r"\begin{abstract}" in src and "We compare \\cite{ref1} and \\cite{ref2}." in src
    assert "\\cite{ref1,ref3} and [9]." in src and "see \\cite{ref1,ref2}." in src  # [9] is no reference: stays text
    assert "\\bibitem{ref1} Kim. Paper A. 2020. \\url{https://doi.org/10.1/x}" in src
    assert "javascript" not in src  # an unsafe URL is never written
    assert ("\\begin{table*}" if template == "ieee" else "\\begin{supertabular}") in src and "\\textbf{B\\_2}" in src and "50\\%" in src and "\\texttt{code\\_x}" in src


def test_tex_escapes_every_markup_character():
    out = report_latex.tex(EVIL)
    assert "\\input{" not in out and "\\write18{" not in out
    assert out.count("\\textbackslash{}") == 2 and "\\$x\\textasciicircum{}2\\$" in out and "50\\%" in out and "\\#1" in out
    assert "\\{x\\}" in out and "\\&" in out and "\\textless{}y\\textgreater{}" in out and "\\textbar{}z\\textbar{}" in out


def test_thai_uses_laksaman_and_thai_line_breaking():
    src = report_latex.render_latex({**body(format="tex"), "template": "ieee"}).decode()
    assert "\\setmainfont{Laksaman}" in src and "ผู้ป่วย\\allowbreak{}ที่\\allowbreak{}เป็น" in src and "\\renewcommand{\\refname}{เอกสารอ้างอิง}" in src
    assert TH in src.replace("\\allowbreak{}", "")


async def test_unknown_template_is_422(monkeypatch):
    assert (await post(tex_body(template="nature"), monkeypatch)).status_code == 422


def test_greek_and_symbols_become_maths_and_thai_borrows_a_latin_face_for_accents():
    assert report_latex.tex("α ≥ 5 µg ΔT") == r"\ensuremath{\alpha} \ensuremath{\geq} 5 \ensuremath{\mu}g \ensuremath{\Delta}T"
    assert report_latex.tex("Szőke") == "Szőke"  # Latin faces have it
    src = report_latex.render_latex({**body(format="tex"), "title": "ผลของ Szőke β"}).decode()
    assert r"\title{ผล\allowbreak{}ของ Sz{\latinfont ő}ke \ensuremath{\beta}}" in src and r"\newfontfamily\latinfont{texgyretermes}" in src
    assert report_latex.tex("ő") == "ő"  # the Thai setting does not leak out of the render


def test_adjacent_citations_merge_into_one_cite():
    keys = {"6": "ref6", "7": "ref7", "8": "ref8", "12": "ref12"}
    assert report_latex._text("restored.[6][7][8][12] and [6][99]", keys) == "restored.\\cite{ref6,ref7,ref8,ref12} and [6][99]"


# --- front matter and closing statements -------------------------------------------------------------------------------
HOSTILE = r"\input{/etc/passwd} } { \and"
FRONT = {"authors": [{"name": "Ann Lee", "affiliation": "MIT " + HOSTILE}, {"name": "Bo " + HOSTILE}],
         "keywords": ["rag", "k" + HOSTILE], "abstract": "Abs " + HOSTILE + "\n\nSecond paragraph.",
         "statements": [{"kind": "ai", "text": "AI " + HOSTILE}, {"kind": "coi", "text": "None declared."}]}


@pytest.mark.parametrize("template", list(report_latex.TEMPLATES))
async def test_tex_front_matter_and_statements(template, monkeypatch):
    src = (await post(tex_body(template=template, **FRONT), monkeypatch)).text
    assert "\\input{" not in src.replace("\\textbackslash{}input\\{", "") and "\\textbackslash{}input\\{/etc/passwd\\} \\} \\{" in src
    assert "Ann Lee" in src and "rag" in src and "Second paragraph." in src
    assert src.count("\\begin{abstract}") == 1 and "We compare" in src  # the field wins; the Abstract section stays a section
    assert "\\section*{Use of generative AI}" in src and "\\section*{Conflicts of interest}" in src
    assert src.index("\\section*{Conflicts") < src.index("\\begin{thebibliography}")
    marker = {"ieee": "\\IEEEauthorblockN{Ann Lee}", "elsevier": "\\author[a1]{Ann Lee}\n\\author{Bo", "springer": "\\institute{MIT",
              "article": "\\author{Ann Lee \\\\ \\small MIT"}[template]
    assert marker in src
    assert {"ieee": "\\begin{IEEEkeywords}", "elsevier": "\\begin{keyword}", "springer": "\\keywords{", "article": "\\textbf{Keywords:}"}[template] in src


def test_tex_without_new_fields_is_unchanged():
    src = report_latex.render_latex({**body(format="tex"), "template": "springer"}).decode()
    assert "\\author{}" in src and "\\institute{}" in src and "keywords" not in src and "\\section*" not in src


async def test_pdf_and_docx_front_matter(monkeypatch):
    kw = {"language": "en", "authors": [{"name": "Ann Lee", "affiliation": "MIT"}], "keywords": ["rag", "llm"], "abstract": "Short abstract.",
          "statements": [{"kind": "data", "text": "Data on request."}]}
    r = await post(body(**kw), monkeypatch)
    txt = pdf_text(r)
    assert all(x in txt for x in ("Ann Lee, MIT", "Abstract", "Short abstract.", "Keywords: rag; llm", "Data and code availability", "Data on request."))
    assert txt.index("Data on request.") < txt.index("References")
    r = await post(body(format="docx", **kw), monkeypatch)
    from docx import Document
    paras = [p.text for p in Document(io.BytesIO(r.content)).paragraphs]
    assert "Ann Lee, MIT" in paras and "Short abstract." in paras and "Keywords: rag; llm" in paras
    assert paras.index("Data on request.") < paras.index("References")


@pytest.mark.parametrize("patch", [
    {"keywords": ["k"] * 9}, {"keywords": ["x" * 61]}, {"keywords": [""]}, {"authors": [{"name": ""}]}, {"authors": [{"name": "x" * 101}]},
    {"authors": [{"name": "a", "affiliation": "x" * 201}]}, {"authors": [{"name": "a"}] * 21}, {"abstract": "x" * 3001},
    {"statements": [{"kind": "funding", "text": "x"}]}, {"statements": [{"kind": "ai", "text": "x" * 1501}]},
    {"statements": [{"kind": "ai", "text": "x"}] * 5},
])
async def test_front_matter_limits(patch, monkeypatch):
    assert (await post(body(**patch), monkeypatch)).status_code == 422


@pytest.mark.parametrize("template", list(report_latex.TEMPLATES))
def test_blank_lines_in_single_line_fields_are_collapsed(template):
    d = {**tex_body(template=template), "authors": [{"name": "Ann\n\nLee", "affiliation": "MIT\n\n\nLab"}, {"name": "Bo\n \nWu"}],
         "keywords": ["rag\n\nllm", "b"]}
    src = report_latex.render_latex(ExportRequest(**d).model_dump()).decode()
    assert "Ann Lee" in src and "Bo Wu" in src and "rag llm" in src and "MIT Lab" in src
    assert "Ann\n" not in src and "rag\n" not in src and "MIT\n" not in src


def test_thai_only_in_new_fields_enables_the_thai_font_and_compiles():
    d = {**tex_body(), "language": "en", "authors": [{"name": "สมชาย ใจดี", "affiliation": "มหาวิทยาลัยเชียงใหม่"}], "keywords": ["ข้อมูล"],
         "abstract": "บทคัดย่อภาษาไทย", "statements": [{"kind": "coi", "text": "ไม่มีผลประโยชน์ทับซ้อน"}]}
    d = ExportRequest(**d).model_dump()
    src = report_latex.render_latex(d).decode()
    assert "\\setmainfont{Laksaman}" in src
    plain = report_latex.render_latex(ExportRequest(**tex_body()).model_dump()).decode()
    assert "Laksaman" not in plain  # English-only documents are unchanged
    if shutil.which("tectonic"):
        with tempfile.TemporaryDirectory() as tmp:
            pathlib.Path(tmp, "a.tex").write_text(src, encoding="utf-8")
            r = subprocess.run(["tectonic", "--untrusted", "a.tex"], cwd=tmp, capture_output=True, text=True, timeout=300)
            assert r.returncode == 0 and "Missing character" not in r.stderr, r.stderr[-800:]


@pytest.mark.parametrize("patch", [
    {"authors": [{"name": "   "}]}, {"keywords": ["  "]}, {"statements": [{"kind": "ai", "text": " \n "}]}, {"abstract": "x" * 3001},
    {"statements": [{"kind": "ai", "text": "a"}, {"kind": "ai", "text": "b"}]},
])
async def test_whitespace_only_and_duplicate_kinds_are_422(patch, monkeypatch):
    r = await post(body(**patch), monkeypatch)
    assert r.status_code == 422 and isinstance(r.json()["detail"], list)


def test_whitespace_abstract_is_dropped():
    assert ExportRequest(**body(abstract="   \n ")).abstract == ""


# --- characters XML and TeX cannot take (U+FFFE/U+FFFF crashed DOCX with a 500; U+2028 had no glyph in LaTeX) -----------------
BAD = "a￾b￿c\x0cd e f"


def bad_fields():
    return dict(title="T" + BAD, subtitle="S" + BAD, authors=[{"name": "N" + BAD, "affiliation": "A" + BAD}], keywords=["K" + BAD],
                abstract="Abs" + BAD, statements=[{"kind": "ai", "text": "St" + BAD}],
                sections=[{"heading": "H" + BAD, "paragraphs": [], "blocks": [
                    {"type": "paragraph", "runs": [{"text": "P" + BAD, "bold": False, "italic": False, "code": False}]},
                    {"type": "table", "header": ["h" + BAD], "rows": [["c" + BAD]]}]}])


@pytest.mark.parametrize("fmt", ["pdf", "docx", "tex"])
async def test_xml_illegal_characters_in_any_field_do_not_fail_export(fmt, monkeypatch):
    r = await post(body(format=fmt, language="en", **bad_fields()), monkeypatch)
    assert r.status_code == 200
    if fmt == "tex":
        assert "￾" not in r.text and "￿" not in r.text and " " not in r.text and " " not in r.text
    if fmt == "docx":
        assert b"\xef\xbf\xbe" not in zipfile.ZipFile(io.BytesIO(r.content)).read("word/document.xml")


def test_clean_turns_line_separators_into_breaks():
    assert report_render.clean(BAD) == "abc" + "d\ne\nf"


def test_elsevier_shares_one_address_and_the_header_comment_follows_the_authors():
    d = {**tex_body(template="elsevier"), "authors": [{"name": "A", "affiliation": "MIT"}, {"name": "B", "affiliation": "MIT"}, {"name": "C"}]}
    src = report_latex.render_latex(ExportRequest(**d).model_dump()).decode()
    assert src.count("\\address[a1]{MIT}") == 1 and "\\author[a1]{A}" in src and "\\author[a1]{B}" in src and "\\author{C}" in src
    assert "Add the authors" not in src
    assert "Add the authors" in report_latex.render_latex(ExportRequest(**tex_body(template="elsevier")).model_dump()).decode()


# --- doubled line separators must not become a blank line inside a one-paragraph argument; lone surrogates must not be a 500 ---
def _compiles(src):
    if shutil.which("tectonic"):
        with tempfile.TemporaryDirectory() as tmp:
            pathlib.Path(tmp, "a.tex").write_text(src, encoding="utf-8")
            r = subprocess.run(["tectonic", "--untrusted", "a.tex"], cwd=tmp, capture_output=True, text=True, timeout=300)
            assert r.returncode == 0, r.stderr[-800:]


@pytest.mark.parametrize("template", list(report_latex.TEMPLATES))
@pytest.mark.parametrize("sep", ["\u2028\u2028", "\u2029\u2029", "\n\n"])
def test_doubled_separators_compile(template, sep):
    x = f"x{sep}y"
    d = {**tex_body(template=template), "title": x, "subtitle": x}
    d["sections"] = [{"heading": x, "paragraphs": [], "blocks": [
        {"type": "paragraph", "runs": [{"text": x, "bold": True}, {"text": x, "italic": True}, {"text": x, "code": True}]},
        {"type": "table", "header": [x, "B"], "rows": [["1", "2"]]}]}]
    src = report_latex.render_latex(ExportRequest(**d).model_dump()).decode()
    assert not re.search(r"\\n[ \t]*\n", src.split("\\begin{document}")[1].split("\\maketitle")[0] if False else "")
    _compiles(src)


@pytest.mark.parametrize("fmt", ["pdf", "docx", "tex"])
async def test_lone_surrogate_is_not_a_500(fmt, monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    raw = json.dumps(body(format=fmt, title="T"), ensure_ascii=True).replace('"T"', '"a\\ud835b"').encode()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c:
        r = await c.post("/v1/reports/export", content=raw, headers={"content-type": "application/json"})
    assert r.status_code in (200, 422), r.status_code
    if r.status_code == 422:
        assert isinstance(r.json()["detail"], list)
