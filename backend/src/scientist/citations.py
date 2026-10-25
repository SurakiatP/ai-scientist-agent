"""Existence check for cited papers: DOI via Crossref (404 -> doi.org handle, for DataCite DOIs), PMID via NCBI esummary,
arXiv URL via the arXiv API (all arXiv ids of a run in one request). Existence only: a paper that exists but does not
support the claim still passes."""
import asyncio
import re
import weakref
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable
from urllib.parse import quote

import httpx

from scientist.events import Paper, Reference, arxiv_id, normalize_doi, paper_key

ATOM = "{http://www.w3.org/2005/Atom}"
ARXIV_API = "https://export.arxiv.org/api/query"
# polite per-host caps, shared by every run in the process (the scholarly APIs rate-limit per client)
HOST_LIMITS = {"api.crossref.org": 2, "doi.org": 2, "eutils.ncbi.nlm.nih.gov": 3, "export.arxiv.org": 1}
RETRY_AFTER_CAP = 5.0
_sems: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()  # event loop -> {host: Semaphore}

Sleep = Callable[[float], Awaitable[object]]


def _sem(host: str) -> asyncio.Semaphore:
    per_loop = _sems.setdefault(asyncio.get_running_loop(), {})
    if host not in per_loop:
        per_loop[host] = asyncio.Semaphore(HOST_LIMITS.get(host, 2))
    return per_loop[host]


def _retry_after(r: httpx.Response) -> float | None:
    if r.status_code not in (429, 503):
        return None
    try:
        return min(max(float(r.headers.get("retry-after", "")), 0.0), RETRY_AFTER_CAP)
    except ValueError:
        return None  # missing, or an HTTP date: give up (unknown)


class _Http:
    def __init__(self, client: httpx.AsyncClient, contact_email: str, sleep: Sleep):
        ua = "ai-scientist-dem/0.1 (citation check" + (f"; mailto:{contact_email}" if contact_email else "") + ")"
        self.client, self.headers, self.sleep = client, {"User-Agent": ua}, sleep

    async def get(self, url: str, params: dict | None = None) -> httpx.Response:
        """GET under the host's concurrency cap; one retry after a short Retry-After on 429/503."""
        async with _sem(httpx.URL(url).host):
            r = await self.client.get(url, params=params, headers=self.headers, timeout=10)
            if (wait := _retry_after(r)) is not None:
                await self.sleep(wait)
                r = await self.client.get(url, params=params, headers=self.headers, timeout=10)
            return r


async def _status(paper: Paper, http: _Http) -> str:
    """DOI or PMID check (arXiv-only papers are batched in _arxiv)."""
    try:
        if doi := normalize_doi(paper.doi):
            enc = quote(doi, safe="")
            r = await http.get(f"https://api.crossref.org/works/{enc}")
            if r.status_code == 404:  # not Crossref's: arXiv and Zenodo DOIs are DataCite. Ask the DOI handle system.
                r = await http.get(f"https://doi.org/api/handles/{enc}")
                if r.status_code == 200:  # handle API success marker: responseCode 1
                    body = r.json()
                    return "verified" if isinstance(body, dict) and body.get("responseCode") == 1 else "unknown"
            return "verified" if r.status_code == 200 else "unverified" if r.status_code == 404 else "unknown"
        if not paper.pmid:
            return "unverified"  # no identifier to check
        r = await http.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                           params={"db": "pubmed", "id": paper.pmid, "retmode": "json"})
        if r.status_code != 200:
            return "unknown"
        entry = r.json().get("result", {}).get(paper.pmid)
        if entry is None:
            return "unknown"  # unexpected shape: not proof of absence
        return "unverified" if "error" in entry else "verified"
    except (httpx.HTTPError, ValueError, AttributeError):
        return "unknown"  # timeout, outage, or garbage body: never "unverified"


async def _arxiv(ids: list[str], http: _Http) -> dict[str, str]:
    """One id_list request for every arXiv id; missing from the feed -> unverified, failed request -> unknown."""
    if not ids:
        return {}
    try:
        r = await http.get(ARXIV_API, params={"id_list": ",".join(ids), "max_results": str(len(ids))})
        if r.status_code != 200 or len(r.content) > 1_000_000:
            return dict.fromkeys(ids, "unknown")
        entries = list(ET.fromstring(r.text).iter(f"{ATOM}entry"))
    except (httpx.HTTPError, ValueError, ET.ParseError):
        return dict.fromkeys(ids, "unknown")
    found = {re.sub(r"v\d+$", "", (e.findtext(f"{ATOM}id") or "").rsplit("/abs/", 1)[-1]).lower() for e in entries}
    # an error entry with several ids does not say which one was bad: the rest stay unknown, not unverified
    errored = any("/api/errors" in i for i in found) and len(ids) > 1
    return {i: "verified" if i.lower() in found else "unknown" if errored else "unverified" for i in ids}


async def verify_references(papers: list[Paper], *, client: httpx.AsyncClient, contact_email: str = "",
                            sleep: Sleep = asyncio.sleep) -> list[Reference]:
    first: dict = {}
    for p in papers:
        first.setdefault(paper_key(p.doi, p.pmid, p.title, p.url), p)
    unique = list(first.values())
    http = _Http(client, contact_email, sleep)
    arxiv_only = {i: aid for i, p in enumerate(unique)
                  if not normalize_doi(p.doi) and not p.pmid and (aid := arxiv_id(p.url))}

    async def one(i: int, p: Paper) -> str:
        return "" if i in arxiv_only else await _status(p, http)

    *statuses, by_id = await asyncio.gather(*(one(i, p) for i, p in enumerate(unique)),
                                            _arxiv(list(dict.fromkeys(arxiv_only.values())), http))
    statuses = [by_id[arxiv_only[i]] if i in arxiv_only else s for i, s in enumerate(statuses)]
    return [Reference(id=str(i), paper=p, status=s) for i, (p, s) in enumerate(zip(unique, statuses), 1)]
