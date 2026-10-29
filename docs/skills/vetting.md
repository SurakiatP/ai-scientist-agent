# Skill vetting record

Decision date: 2026-10-29. Pinned upstream: `K-Dense-AI/scientific-agent-skills` at git revision
`593377bb048752abb0152deab9fbb1083a6087df` (checked out read-only at
`~/.cache/scientist/upstream/scientific-agent-skills`; `git rev-parse HEAD` matched). Findings below come from listing
the directories and grepping them. Nothing was executed.

Runtime context: branch containers run behind the egress filter of the sandbox runner (`docs/deploy.md`, "Egress filter":
private, link-local, CGNAT and loopback ranges are dropped; public addresses stay reachable). The filter is by address
range, not by host name, so the host lists below are what the skills document, not a technical allowlist. The bridge
passes no API keys to the branch.

## paper-lookup (SKILL.md version 2.4, last-reviewed 2026-09-30, MIT)

- Files: `SKILL.md`, 18 files in `references/` (one per API), 5 files in `scripts/`: `_common.py`, `arxiv_atom.py`,
  `jats_to_text.py`, `openalex_abstract.py`, `paginate.py`. No other file types (no shell scripts, no package manifest).
- Scripts: Python 3.11+, standard-library imports only (grep of all `import`/`from` lines). `_common.py` reads bounded
  stdin or a file and writes JSON. `arxiv_atom.py`, `jats_to_text.py` and `openalex_abstract.py` parse XML/JSON given as
  input (they open no network connection). `paginate.py` is the only script that opens network connections
  (`urllib.request.urlopen`, serialized requests with a delay and a call cap). No `subprocess`, `os.system`, `eval` or
  `exec` found in the skill directory.
- Hosts named in the skill directory (grep of `http(s)://`): api.biorxiv.org, api.core.ac.uk, api.crossref.org,
  api.figshare.com, api.openalex.org, api.opencitations.net, api.ror.org, api.semanticscholar.org, api.unpaywall.org,
  arxiv.org, export.arxiv.org, doi.org, europepmc.org, www.ebi.ac.uk, eutils.ncbi.nlm.nih.gov, pmc.ncbi.nlm.nih.gov,
  www.ncbi.nlm.nih.gov, ftp.ncbi.nlm.nih.gov, zenodo.org, doaj.org, openalex.org, ror.org, plus documentation links
  (github.com, developers.zenodo.org, docs.figshare.com, ror.readme.io, community.crossref.org, help.openalex.org,
  info.arxiv.org, agentskills.io, www.w3.org, dash.harvard.edu). `a9.com` and `provenance.invalid` are an XML namespace
  and a placeholder used for URL redaction, not contacted.
- Install-time code: none found. No package manifest, `pip install`, `npm`, `setup.py`, `pyproject` or `postinstall`
  string in the directory.
- Credentials: environment variables read by code: `OPENALEX_API_KEY` and `CROSSREF_MAILTO` (`paginate.py`). Named in
  the SKILL.md text for the agent to use: `NCBI_API_KEY`, `S2_API_KEY`, `CORE_API_KEY`, `OPENALEX_API_KEY`. All optional
  (the skill states no credentials are required). SKILL.md tells the agent to read only those named variables from a
  `.env`, not the whole file. This deployment sets none of them in the branch.
- Decision: enabled (already was). Pinned at the revision above.

## database-lookup (SKILL.md version 1.8, last-reviewed 2026-09-30, MIT)

- Files: `SKILL.md` and 82 files in `references/` (one markdown file per database or API, plus a selection guide and a
  retrieval contract). No `scripts/` directory and no non-markdown file.
- Scripts and what they execute: none. The skill is instructions only (`allowed-tools: Read Bash`); the agent writes its
  own `curl`/HTTP calls from the endpoints documented in `references/`. Whatever runs is therefore decided by the model
  at run time, inside the branch container.
- Hosts named in the skill directory: 123 distinct hosts in `references/` and `SKILL.md`, covering scientific databases
  and also finance, economics, weather, patent and government-statistics services (alphavantage, fred, sec.gov, bls,
  census, ecb, worldbank, openweathermap, noaa, epa, usgs, uspto and others). This project accepts records only for the
  scientific databases listed in `backend/src/scientist/sources.py` and only on their official hosts; everything else is
  rejected and counted. The full host list is reproducible with
  `grep -rhoE "https?://[A-Za-z0-9.-]+" database-lookup | sort -u`.
- Install-time code: none found (no scripts, no manifest; grep for install and `subprocess`-style strings found nothing).
- Credentials: env vars named in the text: `NCBI_API_KEY`, `OPENFDA_API_KEY`, `NASA_API_KEY`, `MP_API_KEY`,
  `DRUGBANK_API_KEY`, `OMIM_API_KEY`, `DISGENET_API_KEY`, `BIOGRID_API_KEY`, `ADDGENE_API_KEY`, `CLUE_API_KEY`, and key
  variables for non-scientific services (`FRED_`, `BLS_`, `BEA_`, `CENSUS_`, `NOAA_`, `OPENWEATHERMAP_`, `ALPHAVANTAGE_`,
  `DATACOMMONS_`, `USPTO_ODP_`). SKILL.md tells the agent to check only the named key in `.env` and never display the
  file. This deployment passes no keys, so key-gated databases are skipped (the branch prompt says so; the bridge does not
  offer them: `needs_key` in `sources.py`).
- Decision: enabled for scientific databases only, with the controls above: records need a known database and an https
  URL on that database's official host; the agent is told to skip key-gated databases and keep calls bounded; branch
  containers run behind the egress filter.

## Not checked

- I did not run any script or any documented API call, and did not verify that the documented endpoints behave as
  described.
- I read SKILL.md headers and grepped the rest; I did not read every one of the 100 reference files line by line, so
  prose instructions inside them (for example an instruction aimed at the agent) are only covered by the greps above.
- The egress filter is an address-range filter; it does not stop a model from calling a public host that is not on a list
  above. Host names are checked on records only, not on the model's outgoing requests.
- Dependencies of the Python standard library and of `curl` in the branch image were not assessed.
