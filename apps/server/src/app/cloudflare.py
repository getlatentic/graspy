"""What src/worker.py does with the Worker's bindings, here where tests can
reach it: worker.py imports JavaScript modules and runs only on a Worker."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI

from .agent.memory import DurableObjectConversationStore
from .domains.lesson.service import LessonService
from .factory import create_app
from .learner.store import DurableObjectLearnerStore
from .lessons.makers import DurableObjectLessonMaking
from .lessons.run import LessonRunner
from .lessons.store import DurableObjectLessonStore
from .llm.client import build_lm, configure_cache
from .mcp.views import AssetViews
from .security.rate_limit import Budgets
from .settings import DEPLOYMENT_KEYS, get_settings

# Converts a Python dict into the JavaScript object a binding method expects.
JsObject = Callable[[dict], Any]


class BindingLimiter:
    def __init__(self, binding: Any, js_object: JsObject) -> None:
        self._binding = binding
        self._js_object = js_object

    async def allow(self, key: str) -> bool:
        outcome = await self._binding.limit(self._js_object({"key": key}))
        return bool(outcome.success)


def deployment_environment(env: Any) -> dict[str, str]:
    """The configuration among the bindings: everything else on ``env`` is a
    binding."""
    values = {key: getattr(env, key, None) for key in DEPLOYMENT_KEYS}
    return {key: str(value) for key, value in values.items() if value is not None}


def build_worker_app(env: Any, js_object: JsObject) -> FastAPI:
    # Settings read the process environment, which a Worker leaves empty.
    os.environ.update(deployment_environment(env))
    return create_app(
        conversations=DurableObjectConversationStore(env.CONVERSATIONS),
        lessons=DurableObjectLessonStore(env.LESSONS),
        learners=DurableObjectLearnerStore(env.LEARNERS),
        making=DurableObjectLessonMaking(env.LESSON_MAKERS),
        views=AssetViews(env.ASSETS),
        budgets=Budgets(
            session=BindingLimiter(env.SESSION_LIMITER, js_object),
            generate=BindingLimiter(env.GENERATE_LIMITER, js_object),
            agent=BindingLimiter(env.AGENT_LIMITER, js_object),
            api=BindingLimiter(env.API_LIMITER, js_object),
        ),
        voice=env,
    )


def build_lesson_runner(env: Any) -> LessonRunner:
    """A lesson maker's alarm runs outside any request, so it brings its own
    model."""
    os.environ.update(deployment_environment(env))
    configure_cache()
    return LessonRunner(
        service=LessonService(),
        lessons=DurableObjectLessonStore(env.LESSONS),
        learners=DurableObjectLearnerStore(env.LEARNERS),
        lm=build_lm(get_settings()),
    )
