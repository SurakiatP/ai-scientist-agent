"""Run a model-written pandas script on an uploaded file in a throwaway locked-down Docker container.
Build the image from backend/sandbox. The container mounts only the input read-only and prints ONE JSON document on
stdout; the backend reads it with a hard byte cap and validates it before relaying. Containers carry a per-process
label (scientist.sandbox=<PROC>) so cleanup never touches another worker's live runs."""
import ast
import asyncio
import base64
import binascii
import json
import re
import tempfile
import uuid
from pathlib import Path

from pydantic import BaseModel

from scientist.config import Settings
from scientist.proc import kill_and_reap

ALLOWED_IMPORTS = {"pandas", "numpy", "matplotlib", "math", "statistics", "json", "datetime", "collections", "itertools",
                   "re"}
BANNED_NAMES = {"open", "exec", "eval", "compile", "__import__", "input", "breakpoint", "globals", "locals", "vars",
                "getattr", "setattr", "delattr", "dir", "type", "os", "sys", "subprocess", "socket", "builtins",
                "importlib", "pickle"}
# attribute names that read/write files, run strings as code or reach os-level modules. A denylist leaks by nature: the
# container (no network, read-only root, stdout-only output) is the wall, this just rejects the obvious early.
BANNED_ATTRS = BANNED_NAMES | {
    "ctypeslib", "ctypes", "load", "loads", "dump", "dumps", "fromfile", "tofile", "savefig", "imread", "imsave", "query",
    "pickle_compat", "compat", "testing", "npyio", "lib", "io", "common", "system", "popen", "format", "format_map",
    "loadtxt", "genfromtxt", "savetxt", "fromregex", "save", "savez", "memmap", "f2py", "distutils", "get_handle",
    "read", "write", "mkdir", "unlink", "remove", "rmdir", "Path", "environ"}
SAFE_TO = {"to_numeric", "to_datetime", "to_timedelta", "to_frame", "to_numpy", "to_list", "to_dict", "to_period",
           "to_timestamp", "to_series", "to_string", "to_records", "to_pydatetime", "tolist"}  # in-memory conversions only


def _bad_attr(a: str) -> bool:
    return (a.startswith("_") or a in BANNED_ATTRS or a.startswith("read_")
            or (a.startswith("to_") and a not in SAFE_TO))


def check_script(code: str) -> str | None:
    """None if the script passes the static policy, else the reason. Defence in depth: the container is the real wall."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"syntax error: {e.msg} (line {e.lineno})"
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            if isinstance(n, ast.ImportFrom) and n.level:
                return "relative imports are not allowed"
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) else [n.module or ""]
            for m in mods:
                if m.split(".")[0] not in ALLOWED_IMPORTS or any(_bad_attr(p) for p in m.split(".")):
                    return f"import of {m!r} is not allowed"
            if isinstance(n, ast.ImportFrom):
                for a in n.names:
                    if _bad_attr(a.name):
                        return f"import of {a.name!r} is not allowed"
        if isinstance(n, ast.Name) and (n.id in BANNED_NAMES or n.id.startswith("_")):
            return f"use of {n.id!r} is not allowed"
        if isinstance(n, ast.Attribute) and _bad_attr(n.attr):
            return f"attribute {n.attr!r} is not allowed"
    return None


class AnalysisResult(BaseModel):
    ok: bool
    result: dict = {}
    figures: dict[str, bytes] = {}  # fig-N.png -> bytes
    stderr_tail: str = ""  # last 4 KB of stderr, for the repair prompt
    error: str | None = None  # timeout / output_too_large / docker_unavailable / script_error / ...


WORK = Path.home() / ".cache/scientist/sandbox"  # under $HOME: Docker Desktop/colima share it, not always the system tmp
PROC = uuid.uuid4().hex[:12]  # per-process label value
STDERR_KEEP = 4096
MAX_TABLES, MAX_ROWS, MAX_COLS, MAX_FINDINGS, MAX_FIGS = 20, 200, 200, 20, 20
PNG = b"\x89PNG\r\n\x1a\n"


def mem_bytes(v: str) -> int:
    m = re.fullmatch(r"(\d+)([kmg]?)b?", v.strip().lower())
    if not m:
        raise ValueError(f"bad SANDBOX_MEM {v!r}")
    return int(m[1]) * {"": 1, "k": 1 << 10, "m": 1 << 20, "g": 1 << 30}[m[2]]


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _list(v, cap: int) -> list:
    if not isinstance(v, list) or len(v) > cap:
        raise ValueError("bad list")
    return v


def _cell(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    raise ValueError("bad cell")


def validate_output(raw: bytes, max_fig_bytes: int) -> tuple[dict, dict[str, bytes]]:
    """Check the runner's stdout document before anything is relayed. Returns (result without figures, {fig-N.png: png}).
    Raises ValueError on any shape violation."""
    try:
        d = json.loads(raw)
        if not isinstance(d, dict):
            raise ValueError("not an object")
        q = d.get("quality")
        if q is not None:
            if not (isinstance(q, dict) and isinstance(q["rows"], int) and isinstance(q["columns"], int)
                    and isinstance(q["truncated"], bool)):
                raise ValueError("quality")
            q = {"rows": q["rows"], "columns": q["columns"], "truncated": q["truncated"],
                 "columns_info": [{"name": str(_s(c["name"])), "dtype": _s(c["dtype"]), "null_pct": _f(c["null_pct"])}
                                  for c in _list(q["columns_info"], 10_000)],
                 "head": [{_s(k): _cell(v) for k, v in r.items()} for r in _list(q["head"], 5)]}
        tables = []
        for t in _list(d.get("tables", []), MAX_TABLES):
            cols = [_s(c) for c in _list(t["columns"], MAX_COLS)]
            rows = [[_cell(x) for x in _list(r, MAX_COLS)] for r in _list(t["rows"], MAX_ROWS)]
            if any(len(r) != len(cols) for r in rows):
                raise ValueError("row width")
            tables.append({"name": _s(t["name"])[:80], "columns": cols, "rows": rows,
                           "truncated": t.get("truncated") is True})
        findings = [_s(x)[:500] for x in _list(d.get("findings", []), MAX_FINDINGS)]
        tm = d.get("timings", {})
        if not isinstance(tm, dict):
            raise ValueError("timings")
        timings = {k: tm[k] for k in ("load_s", "script_s", "total_s") if k in tm and _num(tm[k])}
        err = d.get("error")
        if err is not None and not isinstance(err, str):
            raise ValueError("error")
        figs = {}
        for i, b in enumerate(_list(d.get("figures", []), MAX_FIGS), 1):
            png = base64.b64decode(_s(b), validate=True)
            if not png.startswith(PNG) or len(png) > max_fig_bytes:
                raise ValueError("figure")
            figs[f"fig-{i}.png"] = png
    except (KeyError, TypeError, AttributeError, binascii.Error) as e:
        raise ValueError("bad output shape") from e
    return {"quality": q, "tables": tables, "findings": findings, "timings": timings, "error": err}, figs


def _s(v) -> str:
    if not isinstance(v, str):
        raise ValueError("not a string")
    return v


def _f(v) -> float:
    if not _num(v):
        raise ValueError("not a number")
    return v


class _TooBig(Exception):
    pass


async def _read_capped(stream, cap: int) -> bytes:
    buf = bytearray()
    while chunk := await stream.read(65536):
        buf += chunk
        if len(buf) > cap:
            raise _TooBig
    return bytes(buf)


async def _read_tail(stream, keep: int) -> bytes:
    tail = b""
    while chunk := await stream.read(65536):
        tail = (tail + chunk)[-keep:]
    return tail


async def _docker(*args: str) -> None:
    try:
        p = await asyncio.create_subprocess_exec("docker", *args, stdout=asyncio.subprocess.DEVNULL,
                                                 stderr=asyncio.subprocess.DEVNULL)
    except OSError:
        return
    try:
        await asyncio.wait_for(p.wait(), 10)  # a hung dockerd must not hang the request
    except TimeoutError:
        p.kill()


def sweep_sandboxes() -> None:
    """Remove this process's leftover sandbox containers (shutdown). Other workers' labels are never touched."""
    import subprocess
    try:
        ids = subprocess.run(["docker", "ps", "-aq", "--filter", f"label=scientist.sandbox={PROC}"],
                             capture_output=True, text=True, timeout=30).stdout.split()
        if ids:
            subprocess.run(["docker", "rm", "-f", *ids], capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        pass


async def run_analysis(script: str | None, data: bytes, ext: str, settings: Settings) -> AnalysisResult:
    """script None = profile only (no model code runs). Never shell=True; no secrets are passed in. Concurrency is
    limited by the caller (routes_analyze's gate)."""
    s, name = settings, f"scientist-sandbox-{uuid.uuid4().hex[:12]}"
    WORK.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="run-", dir=WORK) as tmp:  # only the backend writes here: cleanup always works
        Path(tmp).chmod(0o711)  # mkdtemp is 0700; the container user (65534) must traverse it, not list it
        inp = Path(tmp, "in")
        inp.mkdir(mode=0o755)
        (inp / f"data.{ext}").write_bytes(data)
        if script is not None:
            (inp / "script.py").write_text(script)
        for f in inp.iterdir():
            f.chmod(0o644)
        cmd = ["docker", "run", "--rm", "--name", name, "--label", f"scientist.sandbox={PROC}", "--network", "none",
               "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "--memory", s.sandbox_mem, "--memory-swap", s.sandbox_mem, "--cpus", str(s.sandbox_cpus),
               "--pids-limit", str(s.sandbox_pids), "--ulimit", "nofile=256", "--user", "65534",
               "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "-v", f"{inp}:/in:ro",
               "-e", f"SANDBOX_MAX_ROWS={s.sandbox_max_rows}", "-e", f"SANDBOX_MEM_BYTES={mem_bytes(s.sandbox_mem)}",
               "-e", f"SANDBOX_TIMEOUT_S={s.sandbox_timeout_s}", s.sandbox_image]
        try:
            proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE,
                                                        stderr=asyncio.subprocess.PIPE)
        except OSError:
            return AnalysisResult(ok=False, error="docker_unavailable")
        out_t = asyncio.ensure_future(_read_capped(proc.stdout, s.sandbox_output_max_bytes))
        err_t = asyncio.ensure_future(_read_tail(proc.stderr, STDERR_KEEP))

        async def finish():
            out = await out_t
            await proc.wait()
            return out, await err_t

        try:
            out, err = await asyncio.wait_for(finish(), s.sandbox_timeout_s)
        except (TimeoutError, _TooBig) as e:
            await _docker("rm", "-f", name)  # killing the docker client alone would leave the container running
            for t in (out_t, err_t):  # stop our readers first: kill_and_reap drains the pipes itself
                t.cancel()
            await asyncio.gather(out_t, err_t, return_exceptions=True)
            await kill_and_reap(proc)
            return AnalysisResult(ok=False, error="timeout" if isinstance(e, TimeoutError) else "output_too_large")
        except BaseException:  # cancelled (client gone): same cleanup, then propagate
            await asyncio.shield(_docker("rm", "-f", name))
            proc.kill()
            raise
        finally:
            out_t.cancel()
            err_t.cancel()
        tail = err.decode(errors="replace")
        if not out:  # OOM-killed or crashed before printing
            return AnalysisResult(ok=False, error="oom_or_crash" if proc.returncode in (125, 137) else "no_result",
                                  stderr_tail=tail)
        try:
            result, figs = validate_output(out, s.sandbox_output_max_bytes)
        except ValueError:
            return AnalysisResult(ok=False, error="bad_output", stderr_tail=tail)
        ok = proc.returncode == 0 and not result.get("error")
        return AnalysisResult(ok=ok, result=result, figures=figs, stderr_tail=tail, error=None if ok else "script_error")
