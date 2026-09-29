"""Runs a script in a child Python that has loaded `worker.py` against stand-ins for the Workers
runtime. `worker.py` imports `js` and `workers`, and as it loads it stubs parts of DSPy for every
later import, so it cannot share a process with the other tests."""

import subprocess
import sys
import textwrap
from pathlib import Path

SRC = Path(__file__).parents[1] / "src"

PRELUDE = textwrap.dedent(
    """
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
    """
)


def run_after_worker_loads(script: str) -> list[str]:
    """The lines the script printed, once `worker` has been imported."""
    ran = subprocess.run(
        [sys.executable, "-c", PRELUDE + textwrap.dedent(script)],
        check=False,
        capture_output=True,
        text=True,
        env={"PYTHONPATH": str(SRC)},
        timeout=120,
    )
    assert ran.returncode == 0, ran.stderr[-2000:]
    return ran.stdout.strip().splitlines()
