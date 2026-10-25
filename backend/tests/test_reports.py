import io
import zipfile
from urllib.parse import unquote

import httpx
import pytest
from pypdf import PdfReader

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
