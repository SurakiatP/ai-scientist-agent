"""POST/GET/DELETE /v1/files: uploads proxied into MinIO under opaque ids (no presigned URLs)."""
import errno
import re
import uuid
from pathlib import PurePosixPath
from urllib.parse import quote, unquote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from starlette.datastructures import UploadFile

from scientist.object_store import ObjectMissing

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
