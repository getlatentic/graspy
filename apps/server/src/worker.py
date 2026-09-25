"""The Cloudflare Worker's entry point and its Durable Objects.

Cloudflare runs this module's top-level imports once, at deploy, and starts
every instance from a snapshot of the result, so the app is imported here:
a new instance's first request does not spend 10 to 30 seconds importing it.
The snapshot has a size cap, and startup refuses randomness and slow disk
work; each is handled below.
"""

import importlib.util
import logging
import os
import sys
import time
from types import ModuleType

from js import Object
from pyodide.ffi import to_js
from workers import DurableObject, WorkerEntrypoint, asgi

from app.agent.memory import appended, folded
from app.learner.record import changed
from app.learner.time import now_ms
from app.lessons.making import FORGET_MS, Job, Making, making_now, started

# DSPy imports the openai SDK only to fine-tune. The Worker build leaves it
# out (pyproject.toml): it would take two thirds of the snapshot.
sys.modules.setdefault("openai", ModuleType("openai"))

# Parts of DSPy and its dependencies that graspy never runs, kept out of the
# snapshot: optimizers, evaluation, retrievers, datasets, unused programs and
# adapters, console output, and requests (model calls go through httpx). Each
# is a module that yields a permissive class for any name; DSPy only keeps
# them for isinstance checks and class lists, which a stub class answers. A
# trailing dot stubs a package's modules but runs its own __init__, which
# names what DSPy's `import *` of it takes.
UNUSED_PACKAGES = (
    "gepa",
    "rich",
    "tqdm",
    "cloudpickle",
    "requests",
    "dspy.teleprompt.",
    "dspy.retrievers.",
    "dspy.evaluate",
    "dspy.datasets",
    "dspy.propose",
    "dspy.predict.aggregation",
    "dspy.predict.avatar",
    "dspy.predict.best_of_n",
    "dspy.predict.code_act",
    "dspy.predict.flex",
    "dspy.predict.knn",
    "dspy.predict.multi_chain_comparison",
    "dspy.predict.parallel",
    "dspy.predict.program_of_thought",
    "dspy.predict.react_v2",
    "dspy.predict.refine",
    "dspy.predict.rlm",
    "dspy.primitives.local_interpreter",
    "dspy.primitives.local_interpreter_worker",
    "dspy.primitives.python_interpreter",
    "dspy.dsp.colbertv2",
    "dspy.adapters.xml_adapter",
    "dspy.adapters.two_step_adapter",
    "dspy.adapters.baml_adapter",
)


def _unused(name: str) -> bool:
    return any(
        name.startswith(p) if p.endswith(".") else name == p or name.startswith(p + ".")
        for p in UNUSED_PACKAGES
    )


def _stub_class(name: str) -> type:
    return type(
        name,
        (),
        {
            "__init__": lambda self, *args, **kwargs: None,
            "__getattr__": lambda self, attribute: lambda *args, **kwargs: None,
            "__call__": lambda self, *args, **kwargs: None,
            "__class_getitem__": classmethod(lambda cls, item: cls),
        },
    )


class _StubModule(ModuleType):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        # DSPy's lazy imports walk the stack, and inspect reads each module's
        # file.
        self.__file__ = f"<stub {name}>"
        # A package, so "from gepa.core.adapter import ..." reaches the finder.
        self.__path__: list[str] = []

    def __getattr__(self, attribute: str):
        if attribute.startswith("__") and attribute.endswith("__"):
            raise AttributeError(attribute)
        return _stub_class(attribute)


class _StubLoader:
    def create_module(self, spec):
        return _StubModule(spec.name)

    def exec_module(self, module) -> None:
        pass


class _StubFinder:
    def find_spec(self, name: str, path=None, target=None):
        if not _unused(name):
            return None
        return importlib.util.spec_from_loader(name, _StubLoader())


sys.meta_path.insert(0, _StubFinder())

# DSPy opens a disk cache as it loads, and disk work never settles during
# startup. A directory under /dev/null fails at once, and DSPy falls back to
# memory.
os.environ["DSPY_CACHEDIR"] = "/dev/null/dspy-cache"

# rpds (under jsonschema) seeds a hash map with one entropy call as it loads,
# and startup refuses randomness to packages the runtime does not know. Weak
# entropy is fine for a hash seed; the grant raises if the call never happens.
try:
    from _cloudflare.allow_entropy import allow_bad_entropy_calls
except ImportError:
    from contextlib import nullcontext

    def allow_bad_entropy_calls(_calls: int):
        return nullcontext()


with allow_bad_entropy_calls(1):
    import rpds  # noqa: F401

from app.cloudflare import build_lesson_runner, build_worker_app
from app.lessons.store import KEEP_DAYS

logging.basicConfig(format="%(levelname)s | %(name)s | %(message)s")

CONVERSATION_KEY = "exchanges"
LESSON_KEY = "lesson"
LEARNER_KEY = "record"
MAKING_KEY = "making"
JOB_KEY = "job"
KEEP_MS = KEEP_DAYS * 24 * 60 * 60 * 1000

_app = None
_lesson_runner = None


def _js_object(value: dict):
    return to_js(value, dict_converter=Object.fromEntries)


def _app_for(env):
    # Built on the first request: DSPy modules draw random ids as they are
    # built, which startup refuses.
    global _app
    if _app is None:
        _app = build_worker_app(env, _js_object)
    return _app


def _runner_for(env):
    global _lesson_runner
    if _lesson_runner is None:
        _lesson_runner = build_lesson_runner(env)
    return _lesson_runner


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await asgi.fetch(_app_for(self.env), request, self.env)


class Lesson(DurableObject):
    """One lesson, dropped KEEP_DAYS after it was kept."""

    async def keep(self, lesson_json: str) -> None:
        await self.ctx.storage.put(LESSON_KEY, lesson_json)
        await self.ctx.storage.setAlarm(int(time.time() * 1000) + KEEP_MS)

    async def find(self) -> str:
        return await self.ctx.storage.get(LESSON_KEY) or ""

    async def alarm(self) -> None:
        await self.ctx.storage.deleteAll()


class Conversation(DurableObject):
    """One tutor conversation. Input gates keep each read-modify-write safe
    against two turns at once."""

    async def load(self) -> str:
        return await self.ctx.storage.get(CONVERSATION_KEY) or "[]"

    async def append(self, exchange_json: str) -> None:
        stored = await self.ctx.storage.get(CONVERSATION_KEY)
        await self.ctx.storage.put(CONVERSATION_KEY, appended(stored, exchange_json))

    async def fold(self, summary: str, dropped: int) -> None:
        stored = await self.ctx.storage.get(CONVERSATION_KEY)
        await self.ctx.storage.put(CONVERSATION_KEY, folded(stored, summary, dropped))


class Learner(DurableObject):
    """One learner's record, changed under the same input gates."""

    async def load(self) -> str:
        return await self.ctx.storage.get(LEARNER_KEY) or ""

    async def change(self, change_json: str) -> None:
        stored = await self.ctx.storage.get(LEARNER_KEY)
        await self.ctx.storage.put(LEARNER_KEY, changed(stored, change_json))


class LessonMaker(DurableObject):
    """One lesson being made, in its alarm, so the making outlives the
    request; a later alarm forgets it."""

    async def start(self, job_json: str) -> str:
        now = now_ms()
        answer, run = started(await self.ctx.storage.get(MAKING_KEY), job_json, now)
        if run:
            await self.ctx.storage.put(MAKING_KEY, answer)
            await self.ctx.storage.put(JOB_KEY, job_json)
            await self.ctx.storage.setAlarm(now)
        return answer

    async def progress(self) -> str:
        return await self.ctx.storage.get(MAKING_KEY) or ""

    async def alarm(self) -> None:
        if not making_now(await self.ctx.storage.get(MAKING_KEY)):
            await self.ctx.storage.deleteAll()
            return
        job = Job.model_validate_json(await self.ctx.storage.get(JOB_KEY))

        async def save(making: Making) -> None:
            await self.ctx.storage.put(
                MAKING_KEY, making.model_dump_json(by_alias=True)
            )

        await _runner_for(self.env)(job, save)
        await self.ctx.storage.setAlarm(now_ms() + FORGET_MS)
