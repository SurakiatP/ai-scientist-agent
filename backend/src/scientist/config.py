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
    # MinIO file store (self-hosted in the stack); empty endpoint = uploads off. *_file wins over the plain value (Docker secrets)
    minio_endpoint: str = ""
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_access_key_file: str = ""
    minio_secret_key_file: str = ""
    minio_bucket: str = "scientist-uploads"
    upload_max_bytes_csv: int = 100_000_000
    upload_max_bytes_parquet: int = 100_000_000
    upload_max_bytes_xlsx: int = 25_000_000
    upload_max_bytes_json: int = 50_000_000
    upload_max_bytes_pdf: int = 30_000_000
    upload_max_bytes_docx: int = 30_000_000
    upload_max_files: int = 10  # file parts accepted per request
    upload_max_total_bytes: int = 200_000_000  # request body cap
    # data-analysis sandbox (docker run limits; see sandbox/ and scientist/sandbox.py)
    sandbox_enabled: bool = True  # false where no Docker-capable runner exists (Compose deployment): analyze answers 503
    analyze_max_queue: int = 20  # analyses allowed to wait for a sandbox slot; more get 429
    sandbox_image: str = "scientist-sandbox:latest"
    sandbox_mem: str = "2g"  # also --memory-swap, so swap is off
    sandbox_cpus: float = 1.0
    sandbox_timeout_s: int = 60
    sandbox_pids: int = 128
    sandbox_max_rows: int = 2_000_000
    sandbox_max_concurrent: int = 3
    sandbox_output_max_bytes: int = 10_000_000
    analyze_max_tokens: int = 3000
    contact_email: str = ""  # sent as mailto in the citation-check User-Agent (Crossref/NCBI polite pool)


@lru_cache
def get_settings() -> Settings:
    return Settings()
