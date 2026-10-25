import asyncio
import sys
import time

from scientist.proc import kill_and_reap

FLOOD = "import sys\nwhile True:\n    sys.stdout.buffer.write(b'x' * 65536); sys.stdout.buffer.flush()\n"


async def test_kill_and_reap_returns_for_a_process_flooding_a_pipe_nobody_reads():
    """Regression: Process.wait() alone hung forever on Linux once the unread stdout pipe was paused."""
    proc = await asyncio.create_subprocess_exec(sys.executable, "-c", FLOOD, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE)
    await asyncio.sleep(0.3)  # let it fill the pipe and the StreamReader buffer; we never read
    t = time.monotonic()
    await kill_and_reap(proc)
    assert proc.returncode is not None and time.monotonic() - t < 4


async def test_kill_and_reap_on_a_finished_process_is_harmless():
    proc = await asyncio.create_subprocess_exec(sys.executable, "-c", "pass", stdout=asyncio.subprocess.PIPE)
    await proc.wait()
    await kill_and_reap(proc)
