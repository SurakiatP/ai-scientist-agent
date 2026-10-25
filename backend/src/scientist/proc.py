"""Subprocess helpers shared by the sandbox and the Hermes bridge."""
import asyncio
import contextlib


async def _drain(stream) -> None:
    while stream is not None and await stream.read(65536):
        pass


async def kill_and_reap(proc: asyncio.subprocess.Process, timeout: float = 5.0) -> None:
    """SIGKILL, then wait for the process to be fully gone.

    `Process.wait()` also waits for the pipes to close, and a pipe nobody reads any more (flow control paused it
    after a flood of output) never closes on Linux, so a bare `wait()` after `kill()` can hang forever. Drain both
    pipes while waiting, and give up after `timeout` (the child is already dead, the watcher reaps it)."""
    with contextlib.suppress(ProcessLookupError):
        proc.kill()
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(asyncio.gather(_drain(proc.stdout), _drain(proc.stderr), proc.wait()), timeout)
