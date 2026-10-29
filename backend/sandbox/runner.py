"""Runs inside the locked-down container. Reads /in/data.<ext> (+ optional /in/script.py) and writes ONE JSON document to
stdout (figures as base64 PNG strings); nothing is written to the host. Without a script it only profiles the data.
The script sees `df`, pd, np, plt, table(name, df), finding(text) and a restricted set of builtins."""
import base64
import builtins
import importlib
import io
import json
import os
import signal
import sys
import time
import traceback
from pathlib import Path

STDOUT = sys.stdout  # the real stdout carries the result document only; script prints go to stderr
sys.stdout = sys.stderr
IN = Path(os.environ.get("SANDBOX_IN", "/in"))
MAX_FIGS = 20
ALLOWED = {"pandas", "numpy", "matplotlib", "math", "statistics", "json", "datetime", "collections", "itertools", "re"}
BASE_ALLOWED = set(ALLOWED)
ALLOWED |= {x for x in os.environ.get("SANDBOX_EXTRA_IMPORTS", "").split(",") if x}  # set by the backend for a pack's libraries
SAFE = ("abs all any bool dict divmod enumerate filter float int isinstance len list map max min pow print range reversed "
        "round set slice sorted str sum tuple zip iter next chr ord repr Exception ValueError KeyError TypeError "
        "IndexError ZeroDivisionError ArithmeticError").split()
MAX_ROWS = int(os.environ.get("SANDBOX_MAX_ROWS", "2000000"))
MEM_BYTES = int(os.environ.get("SANDBOX_MEM_BYTES", str(2 << 30)))
TABLE_ROWS = 200

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

BLOCKED_EVENTS = frozenset({"os.system", "os.exec", "os.posix_spawn", "os.spawn", "subprocess.Popen", "socket.connect",
                            "socket.bind"})  # matched by prefix
BLOCKED_SYMBOLS = frozenset({"system", "popen", "execl", "execle", "execlp", "execv", "execve", "execvp", "execvpe", "fexecve",
                             "posix_spawn", "posix_spawnp", "fork", "vfork", "clone", "spawnv", "spawnve", "syscall",
                             "__libc_system", "execveat", "_Fork", "pidfd_spawn", "pidfd_spawnp"})  # libc names via ctypes


def audit_block(event, args, _events=BLOCKED_EVENTS, _symbols=BLOCKED_SYMBOLS, _deny=PermissionError):
    """Installed just before the model script runs: libraries the script may import (pandas, sklearn, rdkit, ...) cannot be used
    to start processes, open sockets or look up libc's exec/fork/system. Imports, file opens and ctypes.dlopen stay allowed
    (threadpoolctl, numpy, rdkit need them). PermissionError is an OSError, so library fallbacks (`except OSError`) degrade.
    Ceiling, stated honestly: this is a name-based check. Audit events do not cover every way to start a process, so
    block_fork_exec() also stubs the C-level fork_exec; dlsym name matching can still be defeated (address arithmetic,
    string-eval inside a library), as can the static denylist in sandbox.py. None of this is the wall: the container flags
    (no network, read-only root, uid 65534, no caps, pids/memory limits) are."""
    if event.startswith(tuple(_events)):
        raise _deny(f"blocked by sandbox policy: {event}")
    if event.startswith("ctypes.dlsym") and len(args) > 1 and args[1] in _symbols:
        raise _deny(f"blocked by sandbox policy: {event} {args[1]}")


def block_fork_exec():
    """fork_exec starts a process without an audit event (multiprocessing.util.spawnv_passfds reaches it): replace it."""
    import _posixsubprocess
    import subprocess

    def fork_exec(*_a, **_k):
        raise PermissionError("blocked by sandbox policy: fork_exec")
    _posixsubprocess.fork_exec = fork_exec
    if hasattr(subprocess, "_fork_exec"):
        subprocess._fork_exec = fork_exec


def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level or name.split(".")[0] not in ALLOWED:
        raise ImportError(f"import of {name!r} is not allowed")
    return builtins.__import__(name, globals, locals, fromlist, level)


SCRIPT_BUILTINS = {k: getattr(builtins, k) for k in SAFE} | {"__import__": guarded_import}
result = {"quality": None, "tables": [], "findings": [], "figures": [], "timings": {}, "error": None}


def records(frame, n):
    if not isinstance(frame.index, pd.RangeIndex):
        frame = frame.reset_index()
    return json.loads(frame.head(n).to_json(orient="records", date_format="iso", default_handler=str))


def load(path):
    ext = path.suffix.lstrip(".")
    if ext == "csv":
        df = pd.read_csv(path, nrows=MAX_ROWS + 1)
    elif ext == "parquet":
        import pyarrow.parquet as pq
        pf = pq.ParquetFile(path)  # footer only: row count known before any data is read
        batches, n = [], 0
        for b in pf.iter_batches(batch_size=100_000):
            batches.append(b.to_pandas())
            n += len(batches[-1])
            if n > MAX_ROWS:
                break
        df = pd.concat(batches, ignore_index=True) if batches else pf.schema_arrow.empty_table().to_pandas()
    elif ext == "xlsx":
        df = pd.read_excel(path, nrows=MAX_ROWS + 1)  # openpyxl read_only mode
    elif ext == "json":
        df = pd.read_json(path)
    else:
        raise ValueError(f"unsupported extension {ext}")
    truncated = len(df) > MAX_ROWS
    return df.head(MAX_ROWS), truncated


def quality(df, truncated):
    return {"rows": len(df), "columns": df.shape[1], "truncated": truncated,
            "columns_info": [{"name": str(c), "dtype": str(df[c].dtype),
                              "null_pct": round(float(df[c].isna().mean() * 100), 2) if len(df) else 0.0}
                             for c in df.columns],
            "head": records(df, 5)}


def table(name, frame):
    if not isinstance(frame, pd.DataFrame):
        frame = pd.DataFrame(frame)
    if not isinstance(frame.index, pd.RangeIndex):
        frame = frame.reset_index()
    recs = records(frame, TABLE_ROWS)
    result["tables"].append({"name": str(name)[:80], "columns": [str(c) for c in frame.columns],
                             "rows": [list(r.values()) for r in recs], "truncated": len(frame) > TABLE_ROWS})


def finding(text):
    result["findings"].append(str(text)[:500])


MAX_PAGES, MAX_CHARS = 300, 2_000_000  # keep equal to MAX_PAGES / MAX_CHARS in src/scientist/sandbox.py (the backend re-checks them)


def encode_result(res):
    """UTF-8 JSON, not \\uXXXX escapes: 2,000,000 Thai characters are 6 MB, not 12 MB, and stay under sandbox_output_max_bytes."""
    return json.dumps(res, default=str, ensure_ascii=False).encode("utf-8", "replace")


def extract(path):
    """PDF text mode (/in/data.pdf): no model code runs. Same audit hook and fork_exec stub as for a script, installed before
    the untrusted file is parsed; pypdf is imported first (imports may start helpers). Limits: 300 pages, 2,000,000 characters."""
    import pypdf
    block_fork_exec()
    sys.addaudithook(audit_block)
    result.clear()
    try:
        reader = pypdf.PdfReader(str(path))
        # owner-password-only files open with the empty user password (pypdf tries it); a user password raises on the first page -> unreadable
        pages, total, truncated = [], 0, False
        for n, page in enumerate(reader.pages, 1):
            if n > MAX_PAGES:
                truncated = True
                break
            text = page.extract_text() or ""
            if total + len(text) > MAX_CHARS:
                text, truncated = text[:MAX_CHARS - total], True
            pages.append({"page": n, "text": text})
            total += len(text)
            if truncated:
                break
        result.update(pages=pages, truncated=truncated)
    except Exception:
        traceback.print_exc()
        result.clear()
        result["error"] = "unreadable"


def main():
    t0 = time.monotonic()
    path = next(IN.glob("data.*"))
    if path.suffix == ".pdf":
        return extract(path)
    df, truncated = load(path)
    result["timings"]["load_s"] = round(time.monotonic() - t0, 3)
    result["quality"] = quality(df, truncated)
    if df.memory_usage(deep=True).sum() > 0.7 * MEM_BYTES:
        raise MemoryError("dataframe exceeds 70% of the sandbox memory limit")
    script = IN / "script.py"
    if script.exists():
        for lib in sorted(ALLOWED - BASE_ALLOWED):  # a pack's libraries start helper processes while importing (platform.processor,
            importlib.import_module(lib)  # a C++ compiler probe): import them now, before the audit hook, not in the script
        t1 = time.monotonic()
        env = {"df": df, "pd": pd, "np": np, "plt": plt, "table": table, "finding": finding, "__name__": "__main__",
               "__builtins__": SCRIPT_BUILTINS}
        code = compile(script.read_text(), "script.py", "exec")
        block_fork_exec()
        sys.addaudithook(audit_block)  # after the runner's own setup; cannot be removed by the script
        try:
            exec(code, env)
        finally:
            for n in plt.get_fignums()[:MAX_FIGS]:
                buf = io.BytesIO()
                plt.figure(n).savefig(buf, format="png", dpi=100)
                result["figures"].append(base64.b64encode(buf.getvalue()).decode())
            plt.close("all")
            result["timings"]["script_s"] = round(time.monotonic() - t1, 3)
    result["timings"]["total_s"] = round(time.monotonic() - t0, 3)


code = 0
signal.alarm(int(os.environ.get("SANDBOX_TIMEOUT_S", "60")) + 5)  # backstop: a container orphaned by a dead backend still ends
try:
    main()
except BaseException:
    traceback.print_exc()
    result["error"] = "script failed"
    code = 1
STDOUT.buffer.write(encode_result(result))
STDOUT.flush()
sys.exit(code)
