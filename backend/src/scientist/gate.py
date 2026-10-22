"""Global cap on simultaneous runs with a FIFO queue whose position the caller can show."""
import asyncio
from collections.abc import AsyncIterator


class RunGate:
    def __init__(self, limit: int):
        self.free = limit
        self.queue: list[object] = []
        self._changed = asyncio.Event()

    def _notify(self) -> None:
        self._changed.set()
        self._changed = asyncio.Event()

    async def acquire(self) -> AsyncIterator[int]:
        """Yields the 1-based queue position whenever it changes; when the iteration ends the caller
        holds a slot and must call release(). Closing or cancelling it early takes no slot."""
        me = object()
        self.queue.append(me)
        try:
            last = 0
            while not (self.free and self.queue[0] is me):
                if (pos := self.queue.index(me) + 1) != last:
                    last = pos
                    yield pos
                    continue  # the caller awaited: state may have moved, check again
                await self._changed.wait()
            self.free -= 1
        finally:
            self.queue.remove(me)
            self._notify()  # everyone behind moves up

    def release(self) -> None:
        self.free += 1
        self._notify()
