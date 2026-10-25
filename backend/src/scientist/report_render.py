"""Render a report draft to PDF (fpdf2 + HarfBuzz shaping) or DOCX (python-docx). Pure functions, plain text only."""
import io
import re
from dataclasses import dataclass
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from fpdf import FPDF
from pythainlp.tokenize import word_tokenize

FONTS = Path(__file__).parent / "fonts"
ZWSP = "​"
THAI = re.compile("[฀-๿]")
CTRL = re.compile("[\x00-\x08\x0b-\x1f\x7f​]")  # keeps \n and \t; drops stray ZWSP so ours is the only one
LABELS = {
    "th": {"verified": "พบตัวระบุอ้างอิง", "unverified": "ยังไม่ยืนยัน", "unknown": "ตรวจสอบไม่ได้",
           "refs": "เอกสารอ้างอิง", "page": "หน้า",
           "note": "หมายเหตุ: การตรวจสอบเอกสารอ้างอิงยืนยันเพียงว่าตัวระบุ (DOI/URL) มีอยู่จริง "
                   "ไม่ได้พิสูจน์ว่างานนั้นสนับสนุนข้อความที่อ้าง"},
    "en": {"verified": "identifier exists", "unverified": "not confirmed", "unknown": "could not be checked",
           "refs": "References", "page": "Page",
           "note": "Note: the reference check only confirms that the identifier (DOI/URL) exists. "
                   "It does not prove the paper supports the claim it is cited for."},
}


@dataclass(frozen=True)
class Style:
    docx_font: str  # name Word looks up on the reader's machine; Word does not embed fonts
    body: int
    heading: int
    title: int
    margins: tuple[float, float, float, float]  # left, top, right, bottom in cm
    numbered: bool


STYLES = {
    "standard": Style("Sarabun", 12, 15, 22, (2.5, 2.5, 2.5, 2.5), False),
    # Thai government letter (saraban rule): 16 pt body, 18 pt headings, margins 3/3/2/2 cm, Arabic numerals
    "official": Style("TH Sarabun New", 16, 18, 20, (3, 3, 2, 2), True),
}


def clean(s: str) -> str:
    return CTRL.sub("", s)


def segment(s: str) -> str:
    """fpdf2 cannot break Thai words, so put a zero-width space between dictionary words (PDF only)."""
    if not THAI.search(s):
        return s
    out, prev_space = [], True
    for tok in word_tokenize(s, engine="newmm", keep_whitespace=True):
        space = tok.isspace()
        if out and not space and not prev_space:
            out.append(ZWSP)
        out.append(tok)
        prev_space = space
    return "".join(out)


def ref_line(r: dict, lang: str, *, seg=lambda s: s) -> str:
    bits = [f"[{clean(r['id'])}]"]
    if r["authors"]:
        bits.append(", ".join(clean(a) for a in r["authors"]) + (f" ({r['year']})." if r["year"] else "."))
    elif r["year"]:
        bits.append(f"({r['year']}).")
    bits.append(seg(clean(r["title"])) + ".")
    if r["doi"]:
        bits.append("DOI: " + clean(r["doi"]))
    if r["url"] and r["url"].lower().startswith(("http://", "https://")):
        bits.append(clean(r["url"]))
    bits.append(f"({LABELS[lang][r['status']]})")
    return " ".join(bits)


class _Pdf(FPDF):
    page_word = "Page"

    def footer(self):
        self.set_y(-15)
        self.set_font("Sarabun", "", 10)
        self.cell(0, 8, f"{self.page_word} {self.page_no()}", align="C")


def render_pdf(d: dict) -> bytes:
    st, lang = STYLES[d["style"]], d["language"]
    pdf = _Pdf(format="A4")
    pdf.page_word = LABELS[lang]["page"]
    pdf.add_font("Sarabun", "", str(FONTS / "Sarabun-Regular.ttf"))
    pdf.add_font("Sarabun", "B", str(FONTS / "Sarabun-Bold.ttf"))
    pdf.set_text_shaping(True)
    left, top, right, bottom = st.margins
    pdf.set_margins(left * 10, top * 10, right * 10)
    pdf.set_auto_page_break(True, bottom * 10 + 5)
    pdf.set_title(clean(d["title"]))
    pdf.add_page()

    def para(text, size, bold=False, gap=2):
        pdf.set_font("Sarabun", "B" if bold else "", size)
        pdf.multi_cell(0, size * 0.5, segment(clean(text)), new_x="LMARGIN", new_y="NEXT")  # left-aligned, not justified
        pdf.ln(gap)

    para(d["title"], st.title, True)
    if d["subtitle"]:
        para(d["subtitle"], st.body)
    for i, s in enumerate(d["sections"], 1):
        para((f"{i}. " if st.numbered else "") + s["heading"], st.heading, True)
        for p in s["paragraphs"]:
            para(p, st.body)
    if d["references"]:
        para(LABELS[lang]["refs"], st.heading, True)
        for r in d["references"]:
            para(ref_line(r, lang, seg=segment), st.body - 1, gap=1)
        para(LABELS[lang]["note"], st.body - 1)
    return bytes(pdf.output())


def _run(p, text, font, size, bold=False):
    r = p.add_run(text)
    r.font.size, r.font.bold, r.font.name = Pt(size), bold, font
    rpr = r._r.get_or_add_rPr()
    f = rpr.find(qn("w:rFonts"))
    for a in ("w:ascii", "w:hAnsi", "w:cs"):
        f.set(qn(a), font)
    for tag, val in (("w:szCs", str(size * 2)),) + ((("w:bCs", None),) if bold else ()):
        e = OxmlElement(tag)
        if val:
            e.set(qn("w:val"), val)
        rpr.append(e)
    lang = OxmlElement("w:lang")  # lets Word pick Thai complex-script rules
    lang.set(qn("w:bidi"), "th-TH")
    rpr.append(lang)
    return r


def render_docx(d: dict) -> bytes:
    st, lang = STYLES[d["style"]], d["language"]
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    sec.left_margin, sec.top_margin, sec.right_margin, sec.bottom_margin = (Cm(m) for m in st.margins)
    doc.core_properties.title = clean(d["title"])
    f = st.docx_font

    def para(text, size, bold=False):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_after = Pt(6)
        _run(p, clean(text), f, size, bold)

    para(d["title"], st.title, True)
    if d["subtitle"]:
        para(d["subtitle"], st.body)
    for i, s in enumerate(d["sections"], 1):
        para((f"{i}. " if st.numbered else "") + s["heading"], st.heading, True)
        for p in s["paragraphs"]:
            para(p, st.body)
    if d["references"]:
        para(LABELS[lang]["refs"], st.heading, True)
        for r in d["references"]:
            para(ref_line(r, lang), st.body - 1)
        para(LABELS[lang]["note"], st.body - 1)

    fp = sec.footer.paragraphs[0]  # "Page N" with a PAGE field
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _run(fp, LABELS[lang]["page"] + " ", f, 10)
    r = _run(fp, "", f, 10)
    for kind, text in (("begin", None), (None, " PAGE "), ("end", None)):
        if kind:
            e = OxmlElement("w:fldChar")
            e.set(qn("w:fldCharType"), kind)
        else:
            e = OxmlElement("w:instrText")
            e.set(qn("xml:space"), "preserve")
            e.text = text
        r._r.append(e)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
