import io
import zipfile
from urllib.parse import unquote

import httpx
import pytest
from pypdf import PdfReader

from scientist import report_render
from scientist.config import get_settings
from scientist.main import create_app

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
