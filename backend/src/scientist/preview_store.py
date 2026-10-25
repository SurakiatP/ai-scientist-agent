"""Rendered preview PDFs kept briefly so the browser can fetch what an SSE stream announced."""
import secrets
import time
from collections import OrderedDict

ID_RE = r"[0-9a-f]{32}"


class PreviewStore:
    # ponytail: in-process dict, so previews live in one worker only (the app already runs a single worker, see
    # create_app). Ceiling: several workers/replicas; then keep previews in Redis/MinIO with the same TTL.
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
