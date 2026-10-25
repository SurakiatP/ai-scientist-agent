from datetime import datetime, timezone

import httpx
import pytest

from scientist.config import get_settings
from scientist.main import create_app
from scientist.object_store import ObjectMissing
from test_config import ENV


class MemStore:
    def __init__(self):
        self.objs, self.up = {}, True

    async def ping(self):
        if not self.up:
            raise RuntimeError

    async def put(self, key, body, *, content_type="", metadata=None):
        if not self.up:
            raise RuntimeError
        self.objs[key] = (body.read(), {"content_type": content_type, **(metadata or {})})

    async def get(self, key):
        if key not in self.objs:
            raise ObjectMissing
        return self.objs[key]

    async def head(self, key):
        if key not in self.objs:
            raise ObjectMissing
        return {"size": len(self.objs[key][0]), "last_modified": datetime(2026, 10, 25, 1, 2, 3, tzinfo=timezone.utc), **self.objs[key][1]}

    async def read_head(self, key, n):
        if key not in self.objs:
            raise ObjectMissing
        return self.objs[key][0][:n]

    async def copy_meta(self, key, content_type, metadata):
        if key not in self.objs:
            raise ObjectMissing
        self.objs[key] = (self.objs[key][0], {"content_type": content_type, **metadata})

    async def delete(self, key):
        self.objs.pop(key)


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    for k, v in {**ENV, "UPLOAD_MAX_BYTES_CSV": "10", "MINIO_ENDPOINT": "http://x"}.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def store(env):
    return MemStore()


@pytest.fixture
async def c(store):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(store=store)), base_url="http://t") as c:
        yield c


def up(c, name, data, ctype="text/plain"):
    return c.post("/v1/files", files={"file": (name, data, ctype)})


async def test_roundtrip(c, store):
    r = await up(c, "../../a b.csv", b"a,b\n1,2")
    assert r.status_code == 201
    j = r.json()
    assert len(j["id"]) == 32 and j["name"] == "a b.csv" and j["size"] == 7
    g = await c.get(f"/v1/files/{j['id']}")
    assert g.content == b"a,b\n1,2" and "a%20b.csv" in g.headers["content-disposition"]
    assert (await c.delete(f"/v1/files/{j['id']}")).status_code == 204
    assert (await c.get(f"/v1/files/{j['id']}")).status_code == 404
    assert (await c.delete(f"/v1/files/{j['id']}")).status_code == 404


async def test_limit_plus_one_is_413_and_limit_ok(c):
    assert (await up(c, "a.csv", b"x" * 10)).status_code == 201
    assert (await up(c, "a.csv", b"x" * 11)).status_code == 413


async def test_type_and_magic_415(c):
    assert (await up(c, "a.exe", b"MZ")).status_code == 415
    assert (await up(c, "a.pdf", b"nope")).status_code == 415
    assert (await up(c, "a.parquet", b"PAR1xx")).status_code == 201
    assert (await up(c, "a.pdf", b"%PDF-1")).status_code == 201


async def test_bad_ids_404(c):
    for i in ("..", "ABC", "x" * 32, "a" * 31):
        assert (await c.get(f"/v1/files/{i}")).status_code == 404
    assert (await c.delete("/v1/files/%2e%2e")).status_code == 404


async def test_store_down_503(c, store):
    store.up = False
    assert (await up(c, "a.csv", b"1")).status_code == 503
    assert (await c.get("/v1/health")).json() == {"status": "ok", "files": "unavailable"}


async def test_health_ok_and_no_endpoint_503(c, monkeypatch):
    assert (await c.get("/v1/health")).json() == {"status": "ok", "files": "ok"}
    monkeypatch.setenv("MINIO_ENDPOINT", "")
    get_settings.cache_clear()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url="http://t") as c2:
        assert (await up(c2, "a.csv", b"1")).status_code == 503
        assert (await c2.get("/v1/health")).status_code == 200


async def test_malformed_content_length_is_400(c):
    r = await c.post("/v1/files", content=b"x", headers={"content-length": "abc"})
    assert r.status_code in (400, 422)  # server may reject the header itself; never 500


async def test_enospc_while_spooling_is_413(c, monkeypatch):
    import errno

    from starlette.requests import Request

    async def boom(self, **kw):
        raise OSError(errno.ENOSPC, "No space left on device")
    monkeypatch.setattr(Request, "form", boom)
    assert (await up(c, "a.csv", b"x")).status_code == 413


async def _id(c, name, data, ctype="text/plain"):
    return (await up(c, name, data, ctype)).json()["id"]


async def test_meta(c):
    fid = await _id(c, "a b.CSV", b"a,b\n1,2")
    j = (await c.get(f"/v1/files/{fid}/meta")).json()
    assert j == {"id": fid, "name": "a b.CSV", "size": 7, "content_type": "text/plain", "kind": "csv",
                 "created_at": "2026-10-25T01:02:03+00:00"}
    assert (await c.get("/v1/files/" + "a" * 32 + "/meta")).status_code == 404
    assert (await c.get("/v1/files/BAD/meta")).status_code == 404


async def test_rename(c):
    fid = await _id(c, "a.csv", b"a,b\n1,2")
    r = await c.patch(f"/v1/files/{fid}", json={"name": "../x/new name.csv"})
    assert r.status_code == 200 and r.json()["name"] == "new name.csv" and r.json()["content_type"] == "text/plain"
    assert "new%20name.csv" in (await c.get(f"/v1/files/{fid}")).headers["content-disposition"]
    assert (await c.patch(f"/v1/files/{fid}", json={"name": "NEW.CSV"})).status_code == 200


async def test_rename_422_404(c):
    fid = await _id(c, "a.csv", b"a,b\n1,2")
    for bad in ("", "   ", "a.json", "noext", "x" * 118 + ".csv", "a\x00b.csv", "a\nb.csv", "dir/", None, 5):
        assert (await c.patch(f"/v1/files/{fid}", json={"name": bad})).status_code == 422, bad
    assert (await c.patch(f"/v1/files/{fid}", json={})).status_code == 422
    assert (await c.patch("/v1/files/" + "a" * 32, json={"name": "a.csv"})).status_code == 404
    assert (await c.patch("/v1/files/BAD", json={"name": "a.csv"})).status_code == 404


async def test_preview_csv(c, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_max_bytes_csv", 10**6)
    body = "a;b;c\n" + "".join(f"{i};{'y' * 300};z\n" for i in range(30))
    fid = await _id(c, "a.csv", body.encode())
    j = (await c.get(f"/v1/files/{fid}/preview")).json()
    assert j["columns"] == ["a", "b", "c"] and len(j["rows"]) == 20 and j["truncated"] is True and j["total_rows"] == 30
    assert j["rows"][0] == ["0", "y" * 200, "z"]
    j = (await c.get(f"/v1/files/{fid}/preview?rows=2")).json()
    assert len(j["rows"]) == 2
    fid = await _id(c, "b.csv", b"a,b\n1,2\n")
    j = (await c.get(f"/v1/files/{fid}/preview")).json()
    assert j == {"columns": ["a", "b"], "rows": [["1", "2"]], "truncated": False, "total_rows": 1}


async def test_preview_csv_caps_columns_and_big_file(c, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_max_bytes_csv", 10**8)
    fid = await _id(c, "w.csv", (",".join(f"c{i}" for i in range(40)) + "\n" + ",".join("1" * 40) + "\n").encode())
    j = (await c.get(f"/v1/files/{fid}/preview")).json()
    assert len(j["columns"]) == 30 and len(j["rows"][0]) == 30
    # not read beyond 1 MB: total_rows unknown when file larger
    big = "a,b\n" + "1,2\n" * 400_000
    fid = await _id(c, "big.csv", big.encode())
    j = (await c.get(f"/v1/files/{fid}/preview")).json()
    assert j["truncated"] is True and j["total_rows"] is None and len(j["rows"]) == 20


async def test_preview_json(c, monkeypatch):
    import json
    rows = [{"a": i, "b": {"k": 1}, "c": None} for i in range(25)]
    monkeypatch.setattr(get_settings(), "upload_max_bytes_json", 10**6)
    fid = await _id(c, "a.json", json.dumps(rows).encode())
    j = (await c.get(f"/v1/files/{fid}/preview")).json()
    assert j["columns"] == ["a", "b", "c"] and len(j["rows"]) == 20 and j["total_rows"] == 25 and j["truncated"] is True
    assert j["rows"][1] == ["1", '{"k": 1}', ""]
    for bad in (b"{}", b"[1,2]", b"not json"):
        fid = await _id(c, "b.json", bad)
        assert (await c.get(f"/v1/files/{fid}/preview")).status_code == 422


async def test_preview_415_404(c):
    fid = await _id(c, "a.pdf", b"%PDF-1")
    r = await c.get(f"/v1/files/{fid}/preview")
    assert r.status_code == 415 and "preview not available" in r.json()["detail"]
    fid = await _id(c, "a.parquet", b"PAR1xx")
    assert (await c.get(f"/v1/files/{fid}/preview")).status_code == 415
    assert (await c.get("/v1/files/" + "a" * 32 + "/preview")).status_code == 404
    assert (await c.get("/v1/files/BAD/preview")).status_code == 404
