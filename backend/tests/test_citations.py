import asyncio

import httpx

from scientist.citations import verify_references
from scientist.events import Paper


def paper(**kw):
    return Paper(**{"title": "T", "url": "https://x.org/a", **kw})


def client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def run(papers, handler):
    async with client(handler) as c:
        return await verify_references(papers, client=c)


async def test_doi_200_verified():
    refs = await run([paper(doi="10.1000/abc")], lambda r: httpx.Response(200, json={}))
    assert [r.status for r in refs] == ["verified"]


async def test_doi_404_unverified():
    refs = await run([paper(doi="10.1000/abc")], lambda r: httpx.Response(404))
    assert refs[0].status == "unverified"


async def test_malformed_doi_no_request():
    calls = []
    refs = await run([paper(doi="not a doi")], lambda r: calls.append(r) or httpx.Response(200))
    assert refs[0].status == "unverified" and not calls


async def test_5xx_and_timeout_unknown():
    assert (await run([paper(doi="10.1000/abc")], lambda r: httpx.Response(503)))[0].status == "unknown"

    def boom(r):
        raise httpx.ReadTimeout("slow")
    assert (await run([paper(doi="10.1000/abc")], boom))[0].status == "unknown"


async def test_same_doi_different_forms_one_reference():
    refs = await run([paper(doi="10.1000/ABC"), paper(doi="https://doi.org/10.1000/abc")],
                     lambda r: httpx.Response(200, json={}))
    assert len(refs) == 1


async def test_no_doi_or_pmid_unverified():
    calls = []
    refs = await run([paper()], lambda r: calls.append(r) or httpx.Response(200))
    assert refs[0].status == "unverified" and not calls


async def test_pmid():
    ok = lambda r: httpx.Response(200, json={"result": {"123": {"uid": "123"}}})
    gone = lambda r: httpx.Response(200, json={"result": {"999": {"uid": "999", "error": "cannot get document summary"}}})
    assert (await run([paper(pmid="123")], ok))[0].status == "verified"
    assert (await run([paper(pmid="999")], gone))[0].status == "unverified"
    assert (await run([paper(pmid="12x")], ok))[0].status == "unverified"
    assert (await run([paper(pmid="123")], lambda r: httpx.Response(500)))[0].status == "unknown"


async def test_dot_segment_dois_rejected_without_request():
    calls = []
    h = lambda r: calls.append(r) or httpx.Response(200, json={})
    for d in ("10.1000/x/../../something", "10.1000/x/../..", "10.1000/x/./y"):
        assert (await run([paper(doi=d)], h))[0].status == "unverified"
    assert not calls


async def test_doi_encoded_in_path():
    paths = []

    def h(r):
        paths.append(r.url.raw_path.decode())
        return httpx.Response(200, json={})
    await run([paper(doi="10.1000/x?mailto=a@b"), paper(doi="10.1000/y#frag"), paper(doi="10.1000/a/b")], h)
    assert sorted(paths) == sorted(["/works/10.1000%2Fx%3Fmailto%3Da%40b", "/works/10.1000%2Fy%23frag", "/works/10.1000%2Fa%2Fb"])


async def test_dedupe_keeps_first_position_and_data():
    a, b = paper(doi="10.1000/a", title="first"), paper(doi="10.1000/b")
    refs = await run([a, b, paper(doi="10.1000/A", title="dup")], lambda r: httpx.Response(200, json={}))
    assert [r.paper.title for r in refs] == ["first", "T"] and [r.id for r in refs] == ["1", "2"]


async def test_429_unknown():
    assert (await run([paper(doi="10.1000/abc")], lambda r: httpx.Response(429)))[0].status == "unknown"


async def test_doi_space_prefix_dedupes_with_bare():
    refs = await run([paper(doi="10.1000/abc"), paper(doi="DOI 10.1000/abc")], lambda r: httpx.Response(200, json={}))
    assert len(refs) == 1


def routed(**table):
    """Handler answering by host; records every request URL."""
    seen = []

    def h(r):
        seen.append(str(r.url))
        t = table[r.url.host]
        return t(r) if callable(t) else t
    return h, seen


async def test_crossref_404_then_handle_200_verified():
    h, seen = routed(**{"api.crossref.org": httpx.Response(404), "doi.org": httpx.Response(200, json={"responseCode": 1, "handle": "x"})})
    refs = await run([paper(doi="10.48550/arXiv.1706.03762")], h)
    assert refs[0].status == "verified"
    assert seen == ["https://api.crossref.org/works/10.48550%2FarXiv.1706.03762",
                    "https://doi.org/api/handles/10.48550%2FarXiv.1706.03762"]


async def test_crossref_404_then_handle_404_unverified():
    h, _ = routed(**{"api.crossref.org": httpx.Response(404), "doi.org": httpx.Response(404)})
    assert (await run([paper(doi="10.48550/arXiv.9999.99999")], h))[0].status == "unverified"


async def test_crossref_404_then_handle_5xx_or_429_unknown():
    for code in (503, 429):
        h, _ = routed(**{"api.crossref.org": httpx.Response(404), "doi.org": httpx.Response(code)})
        assert (await run([paper(doi="10.1000/abc")], h))[0].status == "unknown"


async def test_crossref_200_one_request():
    h, seen = routed(**{"api.crossref.org": httpx.Response(200, json={})})
    assert (await run([paper(doi="10.1038/nature12373")], h))[0].status == "verified"
    assert len(seen) == 1


def atom(*entries):
    return ('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">'
            + "".join(f"<entry><id>{i}</id><title>{t}</title></entry>" for i, t in entries) + "</feed>")


REAL = atom(("http://arxiv.org/abs/1706.03762v7", "Attention Is All You Need"))
ERR = atom(("http://arxiv.org/api/errors#incorrect_id_format_for_1706", "Error"))


async def arxiv(url, body, status=200):
    h, seen = routed(**{"export.arxiv.org": httpx.Response(status, text=body)})
    return (await run([paper(url=url)], h))[0].status, seen


async def test_arxiv_real_entry_verified_exact_url():
    status, seen = await arxiv("https://arxiv.org/abs/1706.03762v5", REAL)
    assert status == "verified" and seen == ["https://export.arxiv.org/api/query?id_list=1706.03762"]
    assert (await arxiv("https://www.arxiv.org/pdf/1706.03762.pdf", REAL))[0] == "verified"
    old = atom(("http://arxiv.org/abs/hep-th/9901001v1", "T"))
    status, seen = await arxiv("https://arxiv.org/abs/hep-th/9901001", old)
    assert status == "verified" and seen == ["https://export.arxiv.org/api/query?id_list=hep-th%2F9901001"]


async def test_arxiv_zero_entries_and_error_entry_unverified():
    assert (await arxiv("https://arxiv.org/abs/1706.03762", atom()))[0] == "unverified"
    assert (await arxiv("https://arxiv.org/abs/1706.03762", ERR))[0] == "unverified"


async def test_arxiv_5xx_and_unparseable_unknown():
    assert (await arxiv("https://arxiv.org/abs/1706.03762", "", 503))[0] == "unknown"
    assert (await arxiv("https://arxiv.org/abs/1706.03762", "<feed><entry>"))[0] == "unknown"
    assert (await arxiv("https://arxiv.org/abs/1706.03762", "not xml"))[0] == "unknown"


async def test_non_arxiv_urls_never_fetched():
    calls = []
    h = lambda r: calls.append(r) or httpx.Response(200, text=REAL)
    for u in ("https://evil.example/abs/1706.03762", "https://arxiv.org.evil.example/abs/1706.03762",
              "https://arxiv.org@evil.example/abs/1706.03762", "https://evilarxiv.org/abs/1706.03762",
              "https://arxiv.org/abs/1706.03762?x=1", "https://arxiv.org/abs/../1706.03762"):
        assert (await run([paper(url=u)], h))[0].status == "unverified"
    assert not calls


async def test_arxiv_forms_dedupe_and_doi_wins():
    h, seen = routed(**{"export.arxiv.org": httpx.Response(200, text=REAL)})
    refs = await run([paper(url="https://arxiv.org/abs/1706.03762", title="a"),
                      paper(url="https://arxiv.org/pdf/1706.03762v3", title="b"),
                      paper(url="http://www.arxiv.org/pdf/1706.03762v1.pdf", title="c")], h)
    assert [r.paper.title for r in refs] == ["a"] and len(seen) == 1


async def test_concurrency_bounded():
    live = peak = 0

    async def h(r):
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        await asyncio.sleep(0.01)
        live -= 1
        return httpx.Response(200, json={})
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        await verify_references([paper(doi=f"10.1000/{i}") for i in range(30)], client=c)
    assert 1 < peak <= 8


async def test_handle_200_bad_body_unknown():
    for resp in (httpx.Response(200, text="<html>oops"), httpx.Response(200, json={}),
                 httpx.Response(200, json={"responseCode": 100}), httpx.Response(200, json=[1])):
        h, _ = routed(**{"api.crossref.org": httpx.Response(404), "doi.org": resp})
        assert (await run([paper(doi="10.1000/abc")], h))[0].status == "unknown"


async def test_arxiv_id_strict_ascii_and_case():
    calls = []
    h = lambda r: calls.append(r) or httpx.Response(200, text=REAL)
    for u in ("https://arxiv.org/abs/\u0661\u0667\u0660\u0666.\u0660\u0663\u0667\u0666\u0662",
              "https://arxiv.org/abs/1706.03762v\u0661", "https://arxiv.org/abs/HEP-TH/9901001"):
        assert (await run([paper(url=u)], h))[0].status == "unverified"
    assert not calls
    assert (await arxiv("https://arxiv.org/abs/math.GT/0309136", atom(("http://arxiv.org/abs/math.GT/0309136v2", "T"))))[0] == "verified"


async def test_arxiv_oversize_response_unknown():
    assert (await arxiv("https://arxiv.org/abs/1706.03762", REAL + " " * 1_000_001))[0] == "unknown"
