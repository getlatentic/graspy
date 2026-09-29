"""The Worker's cron handler, called as the runtime calls it: `env` and `ctx` arrive as None and the
Worker's bindings are on `self.env`.

`worker.py` imports the Workers runtime (`js`, `workers`) and, as it loads, stubs parts of DSPy for
every later import, so it is loaded in a child process with stand-ins for the runtime."""

import subprocess
import sys
import textwrap
from pathlib import Path

SRC = Path(__file__).parents[1] / "src"

CHILD = textwrap.dedent(
    """
    import asyncio
    import sys
    from types import ModuleType, SimpleNamespace

    def module(name, **members):
        made = ModuleType(name)
        made.__dict__.update(members)
        sys.modules[name] = made
        return made

    class WorkerEntrypoint:
        pass

    module("js", Object=object())
    module("pyodide")
    module("pyodide.ffi", to_js=lambda value, **_: value)
    module(
        "workers",
        DurableObject=object,
        WorkerEntrypoint=WorkerEntrypoint,
        asgi=SimpleNamespace(),
    )

    import worker

    swept = []

    async def sweep(env):
        swept.append(env)

    worker.sweep_audio = sweep
    handler = worker.Default()
    handler.env = SimpleNamespace(name="the worker's bindings")
    asyncio.run(handler.scheduled(None, None, None))
    print(swept == [handler.env])
    """
)


def test_the_cron_handler_sweeps_with_the_workers_bindings_though_env_and_ctx_are_none():
    ran = subprocess.run(
        [sys.executable, "-c", CHILD],
        check=False,
        capture_output=True,
        text=True,
        env={"PYTHONPATH": str(SRC)},
        timeout=120,
    )

    assert ran.returncode == 0, ran.stderr[-2000:]
    assert ran.stdout.strip().splitlines()[-1] == "True"
