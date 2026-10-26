"""Render a report draft to PDF (fpdf2 + HarfBuzz shaping) or DOCX (python-docx). Pure functions; Markdown arrives as typed blocks, never parsed or interpreted here."""
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
# font id -> (dir under fonts/ == file prefix, name written into DOCX). PDF embeds the OFL face; Word looks up the docx name on the reader's machine.
FONTS_BY_ID = {
    "sarabun": ("sarabun/Sarabun", "Sarabun"),
    "th-sarabun-new": ("sarabun/Sarabun", "TH Sarabun New"),
    "th-sarabun-psk": ("sarabun/Sarabun", "TH SarabunPSK"),
    "th-sarabun-it9": ("sarabun/Sarabun", "TH SarabunIT๙"),
    "th-niramit": ("niramit/Niramit", "TH Niramit AS"),
    "th-chakra-petch": ("chakrapetch/ChakraPetch", "TH Chakra Petch"),
    "th-baijam": ("baijamjuree/BaiJamjuree", "TH Baijam"),
    "th-k2d": ("k2d/K2D", "TH K2D July8"),
    "th-krub": ("krub/Krub", "TH Krub"),
    "th-koho": ("koho/KoHo", "TH KoHo"),
    "noto-sans-thai": ("notosansthai/NotoSansThai", "Noto Sans Thai"),
    "ibm-plex-sans-thai": ("ibmplexsansthai/IBMPlexSansThai", "IBM Plex Sans Thai"),
    "prompt": ("prompt/Prompt", "Prompt"),
    "kanit": ("kanit/Kanit", "Kanit"),
}
# families without italic files reuse upright files so fpdf2 can still register all four styles
NO_ITALIC = {"notosansthai", "ibmplexsansthai"}
OFFICIAL_DEFAULT = "th-sarabun-new"  # official style with no explicit font keeps the government-letter face in DOCX
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
    body: int
    heading: int
    title: int
    margins: tuple[float, float, float, float]  # left, top, right, bottom in cm
    numbered: bool


STYLES = {
    "standard": Style(12, 15, 22, (2.5, 2.5, 2.5, 2.5), False),
    # Thai government letter (saraban rule): 16 pt body, 18 pt headings, margins 3/3/2/2 cm, Arabic numerals
    "official": Style(16, 18, 20, (3, 3, 2, 2), True),
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


def blocks_of(sec: dict) -> list[dict]:
    """Typed blocks if the client sent them, else the plain paragraphs as one-run blocks."""
    if sec.get("blocks"):
        return sec["blocks"]
    return [{"type": "paragraph", "runs": [{"text": t, "bold": False, "italic": False, "code": False}]}
            for t in sec["paragraphs"]]


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
        self.set_font("F", "", 10)
        self.cell(0, 8, f"{self.page_word} {self.page_no()}", align="C")


def render_pdf(d: dict) -> bytes:
    st, lang = STYLES[d["style"]], d["language"]
    pdf = _Pdf(format="A4")
    pdf.page_word = LABELS[lang]["page"]
    base = str(FONTS / FONTS_BY_ID[d.get("font") or "sarabun"][0])
    plain = base.split("/")[-2] in NO_ITALIC
    for style, suffix in (("", "Regular"), ("B", "Bold"), ("I", "Italic"), ("BI", "BoldItalic")):
        if plain:
            suffix = "Bold" if "B" in style else "Regular"
        pdf.add_font("F", style, f"{base}-{suffix}.ttf")
    pdf.set_text_shaping(True)
    left, top, right, bottom = st.margins
    pdf.set_margins(left * 10, top * 10, right * 10)
    pdf.set_auto_page_break(True, bottom * 10 + 5)
    pdf.set_title(clean(d["title"]))
    pdf.add_page()

    def para(text, size, bold=False, gap=2):
        pdf.set_font("F", "B" if bold else "", size)
        pdf.multi_cell(0, size * 0.5, segment(clean(text)), new_x="LMARGIN", new_y="NEXT")  # left-aligned, not justified
        pdf.ln(gap)

    def runs(rs, size):
        for r in rs:
            t, b = clean(r["text"]), "B" if r["bold"] else ""
            if r["code"] and t.isascii():
                pdf.set_font("Courier", b + ("I" if r["italic"] else ""), size - 1)
            else:  # Thai in a code run stays in the document font: the core Courier font has no Thai glyphs
                pdf.set_font("F", b + ("I" if r["italic"] else ""), size)
            pdf.write(size * 0.5, segment(t))

    def block(b):
        size = st.body
        if b["type"] == "paragraph":
            runs(b["runs"], size)
            pdf.ln(size * 0.5 + 2)
        elif b["type"] == "table":
            n = max([len(b["header"])] + [len(r) for r in b["rows"]])
            pad = lambda row: [clean(c) for c in row] + [""] * (n - len(row))
            pdf.set_font("F", "", size - 1)
            with pdf.table(first_row_as_headings=bool(b["header"]), text_align="LEFT") as tb:
                for row in ([b["header"]] if b["header"] else []) + b["rows"]:
                    r = tb.row()
                    for c in pad(row):
                        r.cell(segment(c))
            pdf.ln(2)
        else:
            base = pdf.l_margin
            for k, item in enumerate(b["items"], 1):
                pdf.set_font("F", "", size)
                pdf.set_x(base + 1)
                pdf.write(size * 0.5, "\u2022" if b["type"] == "bullets" else f"{k}.")
                pdf.l_margin = base + 7
                pdf.set_x(base + 7)
                runs(item, size)
                pdf.l_margin = base
                pdf.ln(size * 0.5 + 1)
            pdf.ln(1)

    para(d["title"], st.title, True)
    if d["subtitle"]:
        para(d["subtitle"], st.body)
    for i, s in enumerate(d["sections"], 1):
        if pdf.get_y() > pdf.h - pdf.b_margin - 40:  # keep the heading with the text that follows
            pdf.add_page()
        para((f"{i}. " if st.numbered else "") + s["heading"], st.heading, True)
        for b in blocks_of(s):
            block(b)
    if d["references"]:
        para(LABELS[lang]["refs"], st.heading, True)
        for r in d["references"]:
            para(ref_line(r, lang, seg=segment), st.body - 1, gap=1)
        para(LABELS[lang]["note"], st.body - 1)
    return bytes(pdf.output())


def _run(p, text, font, size, bold=False, italic=False, code=False):
    r = p.add_run(text)
    r.font.size, r.font.bold, r.font.italic, r.font.name = Pt(size), bold, italic, font
    rpr = r._r.get_or_add_rPr()
    f = rpr.find(qn("w:rFonts"))
    for a in ("w:ascii", "w:hAnsi"):
        f.set(qn(a), "Courier New" if code else font)
    f.set(qn("w:cs"), font)  # Thai (complex script) always in the document font
    for tag, val in (("w:szCs", str(size * 2)),) + ((("w:bCs", None),) if bold else ()) + ((("w:iCs", None),) if italic else ()):
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
    f = FONTS_BY_ID[d.get("font") or (OFFICIAL_DEFAULT if d["style"] == "official" else "sarabun")][1]

    def para(text, size, bold=False, keep=False):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = keep
        _run(p, clean(text), f, size, bold)

    def runs(p, rs, size, bold=False):
        for r in rs:
            _run(p, clean(r["text"]), f, size, bold or r["bold"], r["italic"], r["code"])

    def block(b):
        size = st.body
        if b["type"] == "paragraph":
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(6)
            runs(p, b["runs"], size)
        elif b["type"] == "table":
            n = max([len(b["header"])] + [len(r) for r in b["rows"]])
            rows = ([b["header"]] if b["header"] else []) + b["rows"]
            tb = doc.add_table(rows=len(rows), cols=n)
            tb.style = "Table Grid"
            for ri, row in enumerate(rows):
                for ci, c in enumerate(row + [""] * (n - len(row))):
                    runs(tb.cell(ri, ci).paragraphs[0], [{"text": c, "bold": False, "italic": False, "code": False}],
                         size - 1, bold=bool(b["header"]) and ri == 0)
            if b["header"]:
                tb.rows[0]._tr.get_or_add_trPr().append(OxmlElement("w:tblHeader"))
            doc.add_paragraph().paragraph_format.space_after = Pt(2)
        else:
            numbered = b["type"] == "numbered"
            if numbered:  # own w:num per list so each numbered list restarts at 1
                nums = doc.part.numbering_part.numbering_definitions._numbering
                base = doc.styles["List Number"].element.pPr.numPr.numId.val
                num = nums.add_num(nums.num_having_numId(base).abstractNumId.val)
                num.add_lvlOverride(ilvl=0).add_startOverride(1)
            for item in b["items"]:
                p = doc.add_paragraph(style="List Number" if numbered else "List Bullet")
                p.paragraph_format.space_after = Pt(3)
                if numbered:
                    p._p.get_or_add_pPr().get_or_add_numPr().get_or_add_numId().val = num.numId
                runs(p, item, size)

    para(d["title"], st.title, True)
    if d["subtitle"]:
        para(d["subtitle"], st.body)
    for i, s in enumerate(d["sections"], 1):
        para((f"{i}. " if st.numbered else "") + s["heading"], st.heading, True, keep=True)
        for b in blocks_of(s):
            block(b)
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
