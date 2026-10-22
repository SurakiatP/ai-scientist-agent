"""Existence check for cited papers: DOI via Crossref (404 -> doi.org handle, for DataCite DOIs), PMID via NCBI esummary,
arXiv URL via the arXiv API. Existence only."""
import asyncio
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote

import httpx

from scientist.events import Paper, Reference, arxiv_id, paper_key

DOI = re.compile(r"10\.\d{4,9}/\S+")
PMID = re.compile(r"[1-9]\d{0,8}")
ATOM = "{http://www.w3.org/2005/Atom}"
HEADERS = {"User-Agent": "ai-scientist-dem/0.1 (citation check)"}


async def _status(paper: Paper, client: httpx.AsyncClient) -> str:
    try:
        if paper.doi and paper.doi.strip():
            doi = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*|doi\s+)", "", paper.doi.strip(), flags=re.I)
            if not DOI.fullmatch(doi) or {".", ".."} & set(doi.split("/")):  # dot segments would be collapsed by the URL layer
                return "unverified"
            enc = quote(doi, safe="")
            r = await client.get(f"https://api.crossref.org/works/{enc}", headers=HEADERS, timeout=10)
            if r.status_code == 404:  # not Crossref's: arXiv and Zenodo DOIs are DataCite. Ask the DOI handle system.
                r = await client.get(f"https://doi.org/api/handles/{enc}", headers=HEADERS, timeout=10)
            if r.status_code == 200 and r.url.host == "doi.org":  # handle API success marker: responseCode 1
                body = r.json()
                return "verified" if isinstance(body, dict) and body.get("responseCode") == 1 else "unknown"
            return "verified" if r.status_code == 200 else "unverified" if r.status_code == 404 else "unknown"
        pmid = str(paper.pmid or "").strip()
        if not pmid and (aid := arxiv_id(paper.url)):
            r = await client.get("https://export.arxiv.org/api/query", params={"id_list": aid}, headers=HEADERS, timeout=10)
            if r.status_code != 200:
                return "unknown"
            if len(r.content) > 1_000_000:
                return "unknown"
            real = [e for e in ET.fromstring(r.text).iter(f"{ATOM}entry")
                    if "/api/errors" not in (e.findtext(f"{ATOM}id") or "")]
            if not real:
                return "unverified"  # zero entries, or only the API's error entry
            ids = {re.sub(r"v\d+$", "", (e.findtext(f"{ATOM}id") or "").rsplit("/abs/", 1)[-1]).lower() for e in real}
            return "verified" if aid.lower() in ids else "unknown"
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
    except (httpx.HTTPError, ValueError, AttributeError, ET.ParseError):
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
