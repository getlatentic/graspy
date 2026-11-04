"""What src/worker.py does with the Worker's bindings, here where tests can
reach it: worker.py imports JavaScript modules and runs only on a Worker."""

from __future__ import annotations

import os
from collections.abc import Callable
from typing import Any

import dspy
from fastapi import FastAPI

from .agent.memory import ConversationStore, DurableObjectConversationStore
from .agent.tutor import Tutor
from .caller import Keeping
from .chatlog.conversations import LogConversationStore
from .chatlog.log import ChatLog
from .domains.lesson.service import LessonService
from .factory import create_app
from .learner.store import DurableObjectLearnerStore
from .learner.time import now_ms
from .lessons.makers import DurableObjectLessonMaking
from .lessons.run import LessonRunner
from .lessons.store import DurableObjectLessonStore
from .llm.client import build_lm, configure_cache
from .mcp.views import AssetViews
from .security.rate_limit import Budgets
from .settings import DEPLOYMENT_KEYS, get_settings
from .threads.store import ThreadStore
from .turns.alarm import ChatTurnAlarm
from .turns.durable import DurableTurns
from .turns.host import DurableObjectTurnHost, TutorTurnSource
from .turns.runner import Schedule, TurnRunner
from .voice.keeping import BoundVoice

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


def conversation_store(env: Any) -> ConversationStore:
    """Conversations are kept in a chat's log when CHAT_LOG is on (staging first), and read from the
    Durable Object that held them until each is first read."""
    held = DurableObjectConversationStore(env.CONVERSATIONS)
    if str(getattr(env, "CHAT_LOG", "")).lower() in {"on", "true", "1"}:
        return LogConversationStore(env.DB, held)
    return held


def build_worker_app(env: Any, js_object: JsObject) -> FastAPI:
    # Settings read the process environment, which a Worker leaves empty.
    os.environ.update(deployment_environment(env))
    return create_app(
        conversations=conversation_store(env),
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
        threads=ThreadStore(env.DB),
        turns=durable_turns(env),
    )


def durable_turns(env: Any) -> DurableTurns | None:
    """Turns outlive their requests when DURABLE_TURNS is "on" (staging first), which needs the
    chat log: the turn's events are kept there."""
    if str(getattr(env, "DURABLE_TURNS", "")).lower() not in {"on", "true", "1"}:
        return None
    if str(getattr(env, "CHAT_LOG", "")).lower() not in {"on", "true", "1"}:
        raise ValueError("DURABLE_TURNS needs CHAT_LOG")
    return DurableTurns(turn_host(env), ChatLog(env.DB))


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


def worker_keeping(env: Any, conversations: ConversationStore) -> Keeping:
    """What a turn run in a Durable Object's alarm reads and changes: the same stores the app is given."""
    return Keeping(
        learners=DurableObjectLearnerStore(env.LEARNERS),
        lessons=DurableObjectLessonStore(env.LESSONS),
        making=DurableObjectLessonMaking(env.LESSON_MAKERS),
        conversations=conversations,
        threads=ThreadStore(env.DB),
        voice=BoundVoice(env),
    )


def turn_host(env: Any) -> DurableObjectTurnHost:
    """Starts a turn: its first event is kept, then the chat's object is woken to run it."""
    return DurableObjectTurnHost(env.CHAT_TURNS, ChatLog(env.DB))


def build_turn_alarm(env: Any, storage: Any) -> ChatTurnAlarm:
    """A chat's turns run in its object's alarm, outside any request, so they bring their own model."""
    os.environ.update(deployment_environment(env))
    configure_cache()
    lm = build_lm(get_settings())
    log = ChatLog(env.DB)
    keeping = worker_keeping(env, conversation_store(env))
    source = TutorTurnSource(Tutor(keeping.conversations), keeping)

    def runner_for(schedule: Schedule) -> TurnRunner:
        return TurnRunner(log, source, now_ms, schedule)

    return ChatTurnAlarm(storage, runner_for, model=lambda: dspy.context(lm=lm))
