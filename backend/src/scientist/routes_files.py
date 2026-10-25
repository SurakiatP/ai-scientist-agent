"""POST/GET/DELETE /v1/files: uploads proxied into MinIO under opaque ids (no presigned URLs)."""
import csv
import errno
import io
import json
import re
import uuid
from pathlib import PurePosixPath
from urllib.parse import quote, unquote

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from starlette.datastructures import UploadFile

from scientist.routes_store import require_json
from scientist.object_store import ObjectMissing, presign_policy

router = APIRouter()
ID = re.compile(r"^[0-9a-f]{32}$")
# extension -> leading magic bytes (csv/json have none)
MAGIC = {"csv": b"", "json": b"", "parquet": b"PAR1", "xlsx": b"PK\x03\x04", "docx": b"PK\x03\x04", "pdf": b"%PDF"}
CHUNK = 1 << 20


def _store(request: Request):
    if (s := request.app.state.store) is None:
        raise HTTPException(503, "file storage unavailable")
    return s


def _key(file_id: str) -> str:
    if not ID.fullmatch(file_id):
        raise HTTPException(404, "file not found")
    return file_id


@router.post("/v1/files", status_code=201)
async def upload(request: Request):
    st, s = _store(request), request.app.state.settings
    try:
        length = int(request.headers.get("content-length") or 0)
    except ValueError:
        raise HTTPException(400, "invalid content-length")
    if length < 0:
        raise HTTPException(400, "invalid content-length")
    if length > s.upload_max_total_bytes:
        raise HTTPException(413, "request too large")
    try:
        form = await request.form(max_files=s.upload_max_files, max_fields=20)
    except OSError as e:  # spool dir (tmpfs) full
        if e.errno == errno.ENOSPC:
            raise HTTPException(413, "upload too large for server scratch space")
        raise
    files = [v for v in form.values() if isinstance(v, UploadFile)]
    if len(files) != 1:
        raise HTTPException(422, "send exactly one file per request")
    f = files[0]
    name = PurePosixPath(f.filename.replace("\\", "/")).name or "file"  # basename only, drops any path
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in MAGIC:
        raise HTTPException(415, f"unsupported file type; allowed: {', '.join(sorted(MAGIC))}")
    limit, size = getattr(s, f"upload_max_bytes_{ext}"), 0
    head = await f.read(8)
    if not head.startswith(MAGIC[ext]) or (ext in ("csv", "json") and b"\0" in head):
        raise HTTPException(415, f"content is not a valid .{ext} file")
    size = len(head)
    while chunk := await f.read(CHUNK):  # count as it streams; stop at limit+1
        size += len(chunk)
        if size > limit:
            raise HTTPException(413, f".{ext} files are limited to {limit} bytes")
    if size > limit:
        raise HTTPException(413, f".{ext} files are limited to {limit} bytes")
    await f.seek(0)
    fid = uuid.uuid4().hex
    try:
        await st.put(fid, f.file, content_type=f.content_type or "application/octet-stream",
                     metadata={"name": quote(name)})
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    return {"id": fid, "name": name, "size": size, "content_type": f.content_type}


@router.get("/v1/files/{file_id}")
async def download(file_id: str, request: Request):
    st, key = _store(request), _key(file_id)
    try:
        data, meta = await st.get(key)
    except ObjectMissing:
        raise HTTPException(404, "file not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    name = unquote(meta.get("name", "file"))
    return Response(data, media_type=meta["content_type"],
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
                             "X-Content-Type-Options": "nosniff"})


@router.delete("/v1/files/{file_id}", status_code=204)
async def remove(file_id: str, request: Request):
    st = _store(request)
    key = _key(file_id)
    try:
        await st.head(key)
        await st.delete(key)
    except ObjectMissing:
        raise HTTPException(404, "file not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")


PREVIEW_BYTES, MAX_COLS, MAX_CELL, MAX_ROWS = 1 << 20, 30, 200, 20


class Rename(BaseModel):
    name: str


async def _meta(st, key: str) -> dict:
    try:
        h = await st.head(key)
    except ObjectMissing:
        raise HTTPException(404, "file not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    name = unquote(h.get("name", "file"))
    return {"id": key, "name": name, "size": h["size"], "content_type": h["content_type"],
            "kind": name.rsplit(".", 1)[-1].lower() if "." in name else "",
            "created_at": h["last_modified"].isoformat()}


@router.get("/v1/files/{file_id}/meta")
async def meta(file_id: str, request: Request):
    return await _meta(_store(request), _key(file_id))


@router.patch("/v1/files/{file_id}")
async def rename(file_id: str, body: Rename, request: Request):
    require_json(request)
    st, key = _store(request), _key(file_id)
    old = await _meta(st, key)
    name = PurePosixPath(body.name.replace("\\", "/")).name.strip()
    if not 1 <= len(name) <= 120 or any(ord(ch) < 32 or ord(ch) == 127 for ch in name):
        raise HTTPException(422, "name must be 1-120 characters without control characters")
    if name.rsplit(".", 1)[-1].lower() != old["kind"] or "." not in name:
        raise HTTPException(422, f"file extension must stay .{old['kind']}")
    try:
        await st.copy_meta(key, old["content_type"], {"name": quote(name)})
    except ObjectMissing:
        raise HTTPException(404, "file not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    return {**old, "name": name}


def _cell(v) -> str:
    s = "" if v is None else v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s[:MAX_CELL]


@router.get("/v1/files/{file_id}/preview")
async def preview(request: Request, file_id: str, rows: int = Query(MAX_ROWS, ge=1, le=MAX_ROWS)):
    st, key = _store(request), _key(file_id)
    m = await _meta(st, key)
    if m["kind"] not in ("csv", "json"):
        raise HTTPException(415, "preview not available for this file type")
    try:
        raw = await st.read_head(key, PREVIEW_BYTES)
    except ObjectMissing:
        raise HTTPException(404, "file not found")
    except Exception:
        raise HTTPException(503, "file storage unavailable")
    cut = m["size"] > len(raw)  # only the first 1 MB was read
    text = raw.decode("utf-8-sig", errors="replace")
    if m["kind"] == "csv":
        if cut:
            text = text[: text.rfind("\n") + 1]  # drop the partial last line
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        try:
            all_rows = list(csv.reader(io.StringIO(text), dialect))
        except csv.Error:
            raise HTTPException(422, "could not parse csv")
        header, data = (all_rows[0] if all_rows else []), all_rows[1:]
        cols = [_cell(c) for c in header[:MAX_COLS]]
        out = [[_cell(c) for c in r[:MAX_COLS]] for r in data[:rows]]
        total = None if cut else len(data)
        return {"columns": cols, "rows": out, "truncated": cut or len(data) > rows, "total_rows": total}
    if cut:
        raise HTTPException(413, "json file too large to preview")
    try:
        data = json.loads(text)
    except (ValueError, RecursionError):
        raise HTTPException(422, "could not parse json")
    if not isinstance(data, list) or not data or not all(isinstance(r, dict) for r in data):
        raise HTTPException(422, "preview needs a JSON array of objects")
    shown = data[:rows]
    cols = list(dict.fromkeys(k for r in shown for k in r))[:MAX_COLS]
    return {"columns": [c[:MAX_CELL] for c in cols], "rows": [[_cell(r.get(c)) for c in cols] for r in shown],
            "truncated": len(data) > rows, "total_rows": len(data)}


@router.post("/v1/files/{file_id}/presign")
async def presign(file_id: str, request: Request, response: Response):
    """Short-lived direct-to-MinIO GET link. POST so caches and prefetchers never touch it."""
    require_json(request)
    response.headers["Cache-Control"] = "no-store"
    s = request.app.state.settings
    if not s.presign_enabled:
        raise HTTPException(501, "presign disabled")  # frontend falls back to the proxy preview
    st, key = _store(request), _key(file_id)
    h = await _meta(st, key)
    ctype, inline = presign_policy(h["name"])
    url = st.presign_get(key, filename=h["name"], content_type=ctype, inline=inline, ttl=s.presign_ttl_seconds)
    return {"url": url, "expires_in": s.presign_ttl_seconds, "kind": h["kind"], "inline": inline, "name": h["name"]}
