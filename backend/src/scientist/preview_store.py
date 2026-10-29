"""Rendered preview PDFs kept briefly so the browser can fetch what an SSE stream announced."""
import io
import secrets
import time
from collections import OrderedDict
from contextlib import suppress

from scientist.object_store import ObjectMissing

ID_RE = r"[0-9a-f]{32}"


PREFIX = "previews/"


async def put_preview(st, pdf: bytes) -> str | None:
    """Id of the stored PDF, or None over the size limit. With an object store every worker can serve it."""
    if st.store is None:
        return st.previews.put(pdf)
    if len(pdf) > st.previews.max_bytes:
        return None
    key = secrets.token_hex(16)
    await st.store.put(PREFIX + key, io.BytesIO(pdf), content_type="application/pdf",
                       metadata={"expires": str(time.time() + st.previews.ttl)})
    return key


async def get_preview(st, key: str) -> bytes | None:
    if st.store is None:
        return st.previews.get(key)
    try:
        data, meta = await st.store.get(PREFIX + key)
    except ObjectMissing:
        return None
    if float(meta.get("expires", 0)) < time.time():
        with suppress(Exception):
            await st.store.delete(PREFIX + key)
        return None
    return data


async def purge_previews(store) -> None:
    """Hourly: delete expired preview objects nobody fetched again."""
    for k in await store.list_keys(PREFIX):
        try:
            if float((await store.head(k)).get("expires", 0)) < time.time():
                await store.delete(k)
        except ObjectMissing:
            pass


class PreviewStore:
    # Fallback when there is no object store: an in-process dict, so a preview lives in the worker that rendered it.
    # With an object store (put_preview/get_preview above) every worker serves every preview.
    def __init__(self, max_entries: int, ttl: float, max_bytes: int = 5 << 20, clock=time.monotonic):
        self.max_entries, self.ttl, self.max_bytes, self.clock = max_entries, ttl, max_bytes, clock
        self._d: OrderedDict[str, tuple[float, bytes]] = OrderedDict()

    def _sweep(self) -> None:
        now = self.clock()
        for k in [k for k, (t, _) in self._d.items() if now - t > self.ttl]:
            del self._d[k]

    def put(self, data: bytes) -> str | None:
        """Id of the stored copy, or None when the document is over the per-entry limit."""
        if len(data) > self.max_bytes:
            return None
        self._sweep()
        key = secrets.token_hex(16)
        self._d[key] = (self.clock(), data)
        while len(self._d) > self.max_entries:
            self._d.popitem(last=False)  # least recently used first
        return key

    def get(self, key: str) -> bytes | None:
        self._sweep()
        if key not in self._d:
            return None
        self._d.move_to_end(key)
        return self._d[key][1]
