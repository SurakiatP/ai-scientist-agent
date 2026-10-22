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
