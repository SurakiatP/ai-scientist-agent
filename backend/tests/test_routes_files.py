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
        return self.objs[key][1]

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
