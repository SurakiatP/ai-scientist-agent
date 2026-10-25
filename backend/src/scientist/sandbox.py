"""Run a model-written pandas script on an uploaded file in a throwaway locked-down Docker container.
Build the image from backend/sandbox. Containers carry the scientist.branch=1 label, so hermes.sweep_containers
also removes any left behind by a crashed backend."""
import ast
import asyncio
import json
import re
import tempfile
import uuid
from pathlib import Path

from pydantic import BaseModel

from scientist.config import Settings

ALLOWED_IMPORTS = {"pandas", "numpy", "matplotlib", "math", "statistics", "datetime", "collections", "itertools"}
BANNED_NAMES = {"open", "exec", "eval", "compile", "__import__", "input", "breakpoint", "globals", "locals", "vars",
                "getattr", "setattr", "delattr", "os", "sys", "subprocess", "socket", "builtins", "importlib"}


def check_script(code: str) -> str | None:
    """None if the script passes the static policy, else the reason. Defence in depth: the container is the real wall."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"syntax error: {e.msg} (line {e.lineno})"
    for n in ast.walk(tree):
        if isinstance(n, ast.Import):
            mods = [a.name for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            mods = [n.module or ""] if n.level == 0 else ["."]
        else:
            mods = []
        for m in mods:
            if m.split(".")[0] not in ALLOWED_IMPORTS:
                return f"import of {m!r} is not allowed"
        if isinstance(n, ast.Name) and n.id in BANNED_NAMES:
            return f"use of {n.id!r} is not allowed"
        if isinstance(n, ast.Attribute) and (n.attr.startswith("__") or n.attr in BANNED_NAMES
                                                 or n.attr.startswith("read_")):  # no file reads: data is `df`
            return f"attribute {n.attr!r} is not allowed"
    return None


class AnalysisResult(BaseModel):
    ok: bool
    result: dict = {}
    figures: dict[str, bytes] = {}  # fig-N.png -> bytes
    stderr_tail: str = ""  # last 20 stderr lines, for the repair prompt
    error: str | None = None  # timeout / output_too_large / docker_unavailable / script_error / ...


WORK = Path.home() / ".cache/scientist/sandbox"  # under $HOME: Docker Desktop/colima share it, not always the system tmp
_sems: dict[int, asyncio.Semaphore] = {}  # per event loop (tests run one loop per test)


def _sem(limit: int) -> asyncio.Semaphore:
    key = id(asyncio.get_running_loop())
    return _sems.setdefault(key, asyncio.Semaphore(limit))


def mem_bytes(v: str) -> int:
    m = re.fullmatch(r"(\d+)([kmg]?)b?", v.strip().lower())
    if not m:
        raise ValueError(f"bad SANDBOX_MEM {v!r}")
    return int(m[1]) * {"": 1, "k": 1 << 10, "m": 1 << 20, "g": 1 << 30}[m[2]]


async def _docker(*args: str) -> None:
    p = await asyncio.create_subprocess_exec("docker", *args, stdout=asyncio.subprocess.DEVNULL,
                                             stderr=asyncio.subprocess.DEVNULL)
    await p.wait()


async def run_analysis(script: str | None, data: bytes, ext: str, settings: Settings) -> AnalysisResult:
    """script None = profile only (no model code runs). Never shell=True; no secrets are passed in."""
    s, name = settings, f"scientist-sandbox-{uuid.uuid4().hex[:12]}"
    async with _sem(s.sandbox_max_concurrent):
        WORK.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="run-", dir=WORK) as tmp:
            Path(tmp).chmod(0o755)  # mkdtemp is 0700; the container user (65534) must traverse it
            inp, out = Path(tmp, "in"), Path(tmp, "out")
            inp.mkdir(mode=0o755)
            out.mkdir(mode=0o777)
            out.chmod(0o777)
            (inp / f"data.{ext}").write_bytes(data)
            if script is not None:
                (inp / "script.py").write_text(script)
            for f in inp.iterdir():
                f.chmod(0o644)
            cmd = ["docker", "run", "--rm", "--name", name, "--label", "scientist.branch=1", "--network", "none",
                   "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                   "--memory", s.sandbox_mem, "--memory-swap", s.sandbox_mem, "--cpus", str(s.sandbox_cpus),
                   "--pids-limit", str(s.sandbox_pids), "--user", "65534", "--tmpfs", "/tmp",
                   "-v", f"{inp}:/in:ro", "-v", f"{out}:/out",
                   "-e", f"SANDBOX_MAX_ROWS={s.sandbox_max_rows}", "-e", f"SANDBOX_MEM_BYTES={mem_bytes(s.sandbox_mem)}",
                   s.sandbox_image]
            try:
                proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.DEVNULL,
                                                            stderr=asyncio.subprocess.PIPE)
            except OSError:
                return AnalysisResult(ok=False, error="docker_unavailable")
            try:
                _, err = await asyncio.wait_for(proc.communicate(), s.sandbox_timeout_s)
            except TimeoutError:
                await _docker("kill", name)  # killing the docker client alone would leave the container running
                proc.kill()
                await proc.wait()
                return AnalysisResult(ok=False, error="timeout")
            except BaseException:  # cancelled (client gone): same cleanup, then propagate
                await asyncio.shield(_docker("rm", "-f", name))
                proc.kill()
                raise
            tail = "\n".join(err.decode(errors="replace").splitlines()[-20:])
            files = [f for f in out.iterdir() if f.is_file()]
            if sum(f.stat().st_size for f in files) > s.sandbox_output_max_bytes:
                return AnalysisResult(ok=False, error="output_too_large", stderr_tail=tail)
            try:
                result = json.loads((out / "result.json").read_text())
            except (OSError, ValueError):  # OOM-killed or crashed before writing
                return AnalysisResult(ok=False, error="oom_or_crash" if proc.returncode in (125, 137) else "no_result",
                                      stderr_tail=tail)
            figs = {f.name: f.read_bytes() for f in sorted(files) if re.fullmatch(r"fig-\d+\.png", f.name)}
            ok = proc.returncode == 0 and not result.get("error")
            return AnalysisResult(ok=ok, result=result, figures=figs, stderr_tail=tail,
                                  error=None if ok else "script_error")
