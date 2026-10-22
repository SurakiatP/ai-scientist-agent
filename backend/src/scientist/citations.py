"""Existence check for cited papers: DOI via Crossref, PMID via NCBI esummary. Existence only."""
import asyncio
import re
from urllib.parse import quote

import httpx

from scientist.events import Paper, Reference, paper_key

DOI = re.compile(r"10\.\d{4,9}/\S+")
PMID = re.compile(r"[1-9]\d{0,8}")
HEADERS = {"User-Agent": "ai-scientist-dem/0.1 (citation check)"}


async def _status(paper: Paper, client: httpx.AsyncClient) -> str:
    try:
        if paper.doi and paper.doi.strip():
            doi = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*|doi\s+)", "", paper.doi.strip(), flags=re.I)
            if not DOI.fullmatch(doi) or {".", ".."} & set(doi.split("/")):  # dot segments would be collapsed by the URL layer
                return "unverified"
            r = await client.get(f"https://api.crossref.org/works/{quote(doi, safe='')}", headers=HEADERS, timeout=10)
            return "verified" if r.status_code == 200 else "unverified" if r.status_code == 404 else "unknown"
        pmid = str(paper.pmid or "").strip()
        if not PMID.fullmatch(pmid):
            return "unverified"
        r = await client.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                             params={"db": "pubmed", "id": pmid, "retmode": "json"}, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return "unknown"
        entry = r.json().get("result", {}).get(pmid)
        if entry is None:
            return "unknown"  # unexpected shape: not proof of absence
        return "unverified" if "error" in entry else "verified"
    except (httpx.HTTPError, ValueError, AttributeError):
        return "unknown"  # timeout, outage, or garbage body: never "unverified"


async def verify_references(papers: list[Paper], *, client: httpx.AsyncClient) -> list[Reference]:
    first: dict = {}
    for p in papers:
        first.setdefault(paper_key(p.doi, p.pmid, p.title, p.url), p)
    unique = list(first.values())
    sem = asyncio.Semaphore(8)

    async def one(p: Paper) -> str:
        async with sem:
            return await _status(p, client)

    statuses = await asyncio.gather(*(one(p) for p in unique))
    return [Reference(id=str(i), paper=p, status=s) for i, (p, s) in enumerate(zip(unique, statuses), 1)]
