"""Search branches run by the pinned Hermes agent: one bridge subprocess per branch, JSON lines over stdio.
See infra/hermes/setup.md for install, skills and the wire protocol."""
import asyncio
import json
import os
import re
import shutil
import subprocess
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ValidationError

from scientist.config import Settings
from scientist.events import BranchAnswer, Paper, paper_key

ROOT = Path(__file__).resolve().parents[3]
CACHE = Path.home() / ".cache/scientist"
SKILLS_SOURCE = CACHE / "upstream/scientific-agent-skills"
SKILLS_REVISION = "593377bb048752abb0152deab9fbb1083a6087df"
SANDBOX_IMAGE = ("ghcr.io/astral-sh/uv:0.11.6-python3.13-trixie"
                 "@sha256:b3c543b6c4f23a5f2df22866bd7857e5d304b67a564f4feab6ac22044dde719b")
OPENROUTER_URL = "https://openrouter.ai/api/v1"
SYSTEM = (Path(__file__).parent / "prompts/branch.md").read_text()
BRANCH_TIMEOUT_S = 300


class BranchFailed(BaseModel):
    term: str
    reason: str


class InvalidPaper(BaseModel):
    """A paper rejected for unusable metadata; counted, never silently dropped. key: see paper_key (None = unknown)."""
    term: str
    key: str | None
    reason: str


def _invalid(term: str, raw: object, reason: str) -> InvalidPaper:
    raw = raw if isinstance(raw, dict) else {}
    key = paper_key(raw.get("doi"), raw.get("pmid"), raw.get("title"), raw.get("url"))
    return InvalidPaper(term=term, key=key, reason=reason[:300])


BranchItem = Paper | InvalidPaper | BranchAnswer | BranchFailed


class BranchRunner(Protocol):
    def run(self, term: str, instructions: str) -> AsyncIterator[BranchItem]: ...

    async def close(self) -> None: ...


def _git(path: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(path), *args], capture_output=True, text=True, check=True,
                          timeout=30).stdout.strip()


def _check_pinned(path: Path, revision: str) -> None:
    if _git(path, "rev-parse", "HEAD") != revision or _git(path, "status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError(f"{path} is not a clean checkout of {revision} (see infra/hermes/setup.md)")


def sweep_containers() -> None:
    """Remove branch sandbox containers (label set in _prepare) left by a crashed or killed backend.
    Run at startup and shutdown; assumes one backend process per Docker host. No Docker: nothing to do."""
    try:
        ids = subprocess.run(["docker", "ps", "-aq", "--filter", "label=scientist.branch=1"], capture_output=True,
                             text=True, timeout=30).stdout.split()
        if ids:
            subprocess.run(["docker", "rm", "-f", *ids], capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        pass


class HermesRuntime(BranchRunner):
    """`command` replaces the real bridge (tests pass fake_bridge.py); then no Hermes setup is done."""

    def __init__(self, settings: Settings, *, command: list[str] | None = None):
        self.settings = settings
        self.command = command or [str(CACHE / "hermes-env/bin/python"), "-u", str(ROOT / "infra/hermes/native_bridge.py")]
        self.env = None if command else self._prepare()
        self.procs: set[asyncio.subprocess.Process] = set()

    def _prepare(self) -> dict[str, str]:
        source = self.settings.hermes_source_path.expanduser()
        _check_pinned(source, self.settings.hermes_revision)
        _check_pinned(SKILLS_SOURCE, SKILLS_REVISION)
        home = CACHE / "hermes-home"  # rebuilt per runtime: one HermesRuntime per machine (single backend process)
        shutil.rmtree(home, ignore_errors=True)
        (home / "skills").mkdir(parents=True)
        (home / "process-home").mkdir()
        # off: Hermes would otherwise hide report_paper behind its tool_search bridge
        (home / "config.yaml").write_text('tools:\n  tool_search:\n    enabled: "off"\n')
        for name in self.settings.enabled_skills:
            if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name) or not (SKILLS_SOURCE / "skills" / name / "SKILL.md").is_file():
                raise RuntimeError(f"unknown skill: {name!r}")
            shutil.copytree(SKILLS_SOURCE / "skills" / name, home / "skills" / name)
        return {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": str(home / "process-home"), "HERMES_HOME": str(home),
            "DOCKER_CONFIG": os.environ.get("DOCKER_CONFIG", str(Path.home() / ".docker")),
            **({"DOCKER_HOST": os.environ["DOCKER_HOST"]} if "DOCKER_HOST" in os.environ else {}),
            "PYTHONPATH": str(source), "PYTHONDONTWRITEBYTECODE": "1",
            "TERMINAL_ENV": "docker", "TERMINAL_DOCKER_IMAGE": SANDBOX_IMAGE, "TERMINAL_DOCKER_IMAGE_PINNED": "1",
            "TERMINAL_CONTAINER_PERSISTENT": "false", "TERMINAL_DOCKER_PERSIST_ACROSS_PROCESSES": "false",
            "TERMINAL_CONTAINER_CPU": "1", "TERMINAL_CONTAINER_MEMORY": "512",
            "TERMINAL_DOCKER_EXTRA_ARGS": json.dumps(["--cap-drop=ALL", "--security-opt=no-new-privileges",
                                                      "--pids-limit=128", "--label", "scientist.branch=1"]),
        }

    async def run(self, term: str, instructions: str) -> AsyncIterator[BranchItem]:
        s = self.settings
        request = {"term": term, "instructions": instructions, "system": SYSTEM, "model": s.model,
                   "api_key": s.openrouter_api_key, "base_url": OPENROUTER_URL,
                   "max_iterations": s.branch_max_rounds, "max_tokens": s.branch_token_cap,
                   "budget_seconds": BRANCH_TIMEOUT_S - 30}
        proc = await asyncio.create_subprocess_exec(
            *self.command, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, env=self.env, limit=1024 * 1024)
        self.procs.add(proc)
        deadline = time.monotonic() + BRANCH_TIMEOUT_S
        try:
            proc.stdin.write((json.dumps(request) + "\n").encode())
            await proc.stdin.drain()
            proc.stdin.close()
            while line := await asyncio.wait_for(proc.stdout.readline(), deadline - time.monotonic()):
                try:
                    msg = json.loads(line)
                    event = msg["event"]
                    if event == "paper":
                        try:
                            item = Paper.model_validate(msg.get("paper"))
                        except ValidationError as e:
                            err = e.errors()[0]
                            item = _invalid(term, msg.get("paper"), f"{'.'.join(map(str, err['loc'])) or 'paper'}: {err['msg']}")
                    elif event == "rejected":  # bridge refused a report_paper call; the model may retry
                        item = _invalid(term, msg.get("paper"), str(msg.get("reason") or "rejected"))
                    elif event == "answer":
                        item = BranchAnswer(term=term, content=str(msg["content"]))
                    elif event == "failed":
                        item = BranchFailed(term=term, reason=str(msg.get("code") or "failed"))
                    else:
                        continue
                except (ValueError, KeyError, TypeError, ValidationError):
                    continue  # garbage or malformed line from the bridge: skip it
                yield item
                if isinstance(item, (BranchAnswer, BranchFailed)):
                    return
            yield BranchFailed(term=term, reason="bridge_exited")
        except (TimeoutError, ValueError, OSError) as e:  # ValueError: line over the 1 MB limit
            yield BranchFailed(term=term, reason=type(e).__name__)
        finally:
            await self._stop(proc)

    async def _stop(self, proc: asyncio.subprocess.Process) -> None:
        if proc.returncode is None:
            proc.terminate()  # bridge removes its sandbox container on SIGTERM
            try:
                await asyncio.wait_for(proc.wait(), 15)
            except TimeoutError:
                proc.kill()
                await proc.wait()
        self.procs.discard(proc)

    async def close(self) -> None:
        await asyncio.gather(*(self._stop(p) for p in list(self.procs)))
