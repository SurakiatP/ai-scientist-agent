"""Runs inside the locked-down container. Reads /in/data.<ext> (+ optional /in/script.py) and writes ONE JSON document to
stdout (figures as base64 PNG strings); nothing is written to the host. Without a script it only profiles the data.
The script sees `df`, pd, np, plt, table(name, df), finding(text) and a restricted set of builtins."""
import base64
import builtins
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


def main():
    t0 = time.monotonic()
    path = next(IN.glob("data.*"))
    df, truncated = load(path)
    result["timings"]["load_s"] = round(time.monotonic() - t0, 3)
    result["quality"] = quality(df, truncated)
    if df.memory_usage(deep=True).sum() > 0.7 * MEM_BYTES:
        raise MemoryError("dataframe exceeds 70% of the sandbox memory limit")
    script = IN / "script.py"
    if script.exists():
        t1 = time.monotonic()
        env = {"df": df, "pd": pd, "np": np, "plt": plt, "table": table, "finding": finding, "__name__": "__main__",
               "__builtins__": SCRIPT_BUILTINS}
        try:
            exec(compile(script.read_text(), "script.py", "exec"), env)
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
STDOUT.write(json.dumps(result, default=str))
STDOUT.flush()
sys.exit(code)
