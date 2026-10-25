"""Runs inside the locked-down container. Reads /in/data.<ext> (+ optional /in/script.py), writes /out/result.json and
/out/fig-N.png. Without a script it only profiles the data. The script sees `df`, pd, np, plt, table(name, df), finding(text)."""
import json
import os
import sys
import time
import traceback
from pathlib import Path

IN, OUT = Path(os.environ.get("SANDBOX_IN", "/in")), Path(os.environ.get("SANDBOX_OUT", "/out"))
MAX_ROWS = int(os.environ.get("SANDBOX_MAX_ROWS", "2000000"))
MEM_BYTES = int(os.environ.get("SANDBOX_MEM_BYTES", str(2 << 30)))
TABLE_ROWS = 200

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

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
        env = {"df": df, "pd": pd, "np": np, "plt": plt, "table": table, "finding": finding, "__name__": "__main__"}
        try:
            exec(compile(script.read_text(), "script.py", "exec"), env)
        finally:
            for i, n in enumerate(plt.get_fignums(), 1):
                plt.figure(n).savefig(OUT / f"fig-{i}.png", dpi=100)
                result["figures"].append(f"fig-{i}.png")
            plt.close("all")
            result["timings"]["script_s"] = round(time.monotonic() - t1, 3)
    result["timings"]["total_s"] = round(time.monotonic() - t0, 3)


code = 0
try:
    main()
except BaseException:
    traceback.print_exc()
    result["error"] = "script failed"
    code = 1
(OUT / "result.json").write_text(json.dumps(result, default=str))
sys.exit(code)
