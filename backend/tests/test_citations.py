import asyncio

import httpx
import pytest

from scientist import citations
from scientist.citations import verify_references
from scientist.events import Paper


def paper(**kw):
    return Paper(**{"title": "T", "url": "https://x.org/a", **kw})


def client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def run(papers, handler, **kw):
    async with client(handler) as c:
        return await verify_references(papers, client=c, **kw)


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
    assert seen == ["https://api.crossref.org/works/10.48550%2Farxiv.1706.03762",
                    "https://doi.org/api/handles/10.48550%2Farxiv.1706.03762"]


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
    assert status == "verified" and seen == ["https://export.arxiv.org/api/query?id_list=1706.03762&max_results=1"]
    assert (await arxiv("https://www.arxiv.org/pdf/1706.03762.pdf", REAL))[0] == "verified"
    old = atom(("http://arxiv.org/abs/hep-th/9901001v1", "T"))
    status, seen = await arxiv("https://arxiv.org/abs/hep-th/9901001", old)
    assert status == "verified" and seen == ["https://export.arxiv.org/api/query?id_list=hep-th%2F9901001&max_results=1"]


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


@pytest.mark.parametrize("placeholder", ["N/A", "none", "unknown", "-", "null", "", "  "])
async def test_placeholder_doi_falls_through_to_pmid(placeholder):
    h, seen = routed(**{"eutils.ncbi.nlm.nih.gov": httpx.Response(200, json={"result": {"123": {"uid": "123"}}})})
    refs = await run([paper(doi=placeholder, pmid="PMID: 123")], h)
    assert refs[0].status == "verified" and refs[0].paper.doi is None and refs[0].paper.pmid == "123"
    assert len(seen) == 1 and "eutils" in seen[0]


@pytest.mark.parametrize("placeholder", ["N/A", "none", "unknown", "-", "null", "", "PMID: n/a", "12x"])
def test_placeholder_identifiers_become_none(placeholder):
    p = paper(doi=placeholder, pmid=placeholder)
    assert (p.doi, p.pmid) == (None, None)


def test_valid_identifiers_round_trip_unchanged():
    p = paper(doi="https://doi.org/10.1038/Nature12373", pmid="123", authors=["A"], year=2024)
    assert Paper.model_validate_json(p.model_dump_json()) == p
    assert (p.doi, p.pmid) == ("https://doi.org/10.1038/Nature12373", "123")
    assert paper(pmid=123).pmid == "123" and paper(pmid="PMID: 456").pmid == "456"


async def test_placeholder_dois_do_not_merge_papers():
    refs = await run([paper(doi="N/A", title="A"), paper(doi="N/A", title="B")], lambda r: httpx.Response(200))
    assert [r.paper.title for r in refs] == ["A", "B"]


async def test_per_host_concurrency_caps():
    live: dict = {}
    peak: dict = {}

    async def h(r):
        host = r.url.host
        live[host] = live.get(host, 0) + 1
        peak[host] = max(peak.get(host, 0), live[host])
        await asyncio.sleep(0.01)
        live[host] -= 1
        if host == "export.arxiv.org":
            return httpx.Response(200, text=atom())
        if host == "eutils.ncbi.nlm.nih.gov":
            pmid = r.url.params["id"]
            return httpx.Response(200, json={"result": {pmid: {"uid": pmid}}})
        return httpx.Response(404 if host == "api.crossref.org" else 200, json={"responseCode": 1})
    papers = ([paper(doi=f"10.1000/{i}") for i in range(12)] + [paper(pmid=str(100 + i)) for i in range(12)]
              + [paper(url=f"https://arxiv.org/abs/2401.{i:05d}") for i in range(5)])
    async with httpx.AsyncClient(transport=httpx.MockTransport(h)) as c:
        # two runs at once share the caps
        await asyncio.gather(verify_references(papers, client=c), verify_references(papers, client=c))
    assert peak == {"api.crossref.org": 2, "doi.org": 2, "eutils.ncbi.nlm.nih.gov": 3, "export.arxiv.org": 1}


async def test_arxiv_ids_batched_in_one_request():
    feed = atom(("http://arxiv.org/abs/1706.03762v7", "A"), ("http://arxiv.org/abs/hep-th/9901001v1", "B"))
    h, seen = routed(**{"export.arxiv.org": httpx.Response(200, text=feed)})
    refs = await run([paper(url="https://arxiv.org/abs/1706.03762"), paper(url="https://arxiv.org/abs/hep-th/9901001"),
                      paper(url="https://arxiv.org/abs/2401.00001")], h)
    assert seen == ["https://export.arxiv.org/api/query?id_list=1706.03762%2Chep-th%2F9901001%2C2401.00001&max_results=3"]
    assert [r.status for r in refs] == ["verified", "verified", "unverified"]


async def test_arxiv_batch_failure_is_unknown_for_each():
    h, _ = routed(**{"export.arxiv.org": httpx.Response(503)})
    refs = await run([paper(url="https://arxiv.org/abs/1706.03762"), paper(url="https://arxiv.org/abs/2401.00001")], h)
    assert [r.status for r in refs] == ["unknown", "unknown"]


async def test_arxiv_batch_error_entry_is_unknown_not_unverified():
    h, _ = routed(**{"export.arxiv.org": httpx.Response(200, text=ERR)})
    refs = await run([paper(url="https://arxiv.org/abs/1706.03762"), paper(url="https://arxiv.org/abs/2401.00001")], h)
    assert [r.status for r in refs] == ["unknown", "unknown"]


async def test_user_agent_contact_email():
    uas = []

    def h(r):
        uas.append(r.headers["user-agent"])
        if r.url.host == "export.arxiv.org":
            return httpx.Response(200, text=REAL)
        return httpx.Response(200, json={"result": {"123": {"uid": "123"}}})
    ps = [paper(doi="10.1000/a"), paper(pmid="123"), paper(url="https://arxiv.org/abs/1706.03762")]
    await run(ps, h, contact_email="me@example.org")
    assert len(uas) == 3 and all(ua.endswith("; mailto:me@example.org)") for ua in uas)
    uas.clear()
    await run(ps, h)
    assert len(uas) == 3 and all("mailto" not in ua for ua in uas)


async def test_retry_after_retries_once_with_capped_wait():
    for code in (429, 503):
        waits, answers = [], [httpx.Response(code, headers={"Retry-After": "30"}), httpx.Response(200, json={})]

        async def sleep(s):
            waits.append(s)
        refs = await run([paper(doi="10.1000/a")], lambda r: answers.pop(0), sleep=sleep)
        assert refs[0].status == "verified" and waits == [citations.RETRY_AFTER_CAP] and not answers


async def test_retry_after_only_once_then_unknown():
    calls, waits = [], []

    async def sleep(s):
        waits.append(s)
    h = lambda r: calls.append(r) or httpx.Response(429, headers={"Retry-After": "1"})
    assert (await run([paper(doi="10.1000/a")], h, sleep=sleep))[0].status == "unknown"
    assert len(calls) == 2 and waits == [1.0]


async def test_no_retry_without_retry_after():
    calls = []

    async def sleep(s):
        raise AssertionError("must not wait")
    h = lambda r: calls.append(r) or httpx.Response(503)
    assert (await run([paper(doi="10.1000/a")], h, sleep=sleep))[0].status == "unknown" and len(calls) == 1
