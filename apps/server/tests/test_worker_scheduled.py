"""The Worker's cron handler, called as the runtime calls it: `env` and `ctx` arrive as None and the
Worker's bindings are on `self.env`."""

from worker_child import run_after_worker_loads


def test_the_cron_handler_sweeps_with_the_workers_bindings_though_env_and_ctx_are_none():
    lines = run_after_worker_loads(
        """
        import asyncio

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

    assert lines[-1] == "True"
