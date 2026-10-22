from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    openrouter_api_key: str = Field(min_length=1)
    model: str
    fallback_model: str
    max_branches: int = 5
    max_concurrent_runs: int = 4
    branch_token_cap: int = 4000
    branch_max_rounds: int = 8
    max_question_chars: int = 2000
    hermes_source_path: Path
    hermes_revision: str
    enabled_skills: list[str] = []
    cors_origins: list[str] = ["http://localhost:3000"]
    sse_ping_seconds: float = 15  # comment line while a run waits, so proxies keep the stream open
    max_papers_per_branch: int = 30  # papers past this per branch are ignored (counted in the final note)
    # max_tokens per call; reasoning models spend part of it thinking, so small values come back blank
    guardrail_max_tokens: int = 256
    strategy_max_tokens: int = 1500
    synthesis_max_tokens: int = 4000
    contact_email: str = ""  # sent as mailto in the citation-check User-Agent (Crossref/NCBI polite pool)


@lru_cache
def get_settings() -> Settings:
    return Settings()
