"""The app's model as the default for each request."""

import dspy
from dspy.utils.dummies import DummyLM

from app.llm.context import ModelContextMiddleware

APP_MODEL = DummyLM([{"answer": "app"}])


async def model_seen_by_a_request() -> dspy.LM:
    seen = []

    async def app(scope, receive, send):
        seen.append(dspy.settings.lm)

    await ModelContextMiddleware(app, lm=APP_MODEL)({"type": "http"}, None, None)
    return seen[0]


async def test_a_request_runs_on_the_apps_model():
    assert await model_seen_by_a_request() is APP_MODEL


async def test_a_model_already_in_context_wins():
    stand_in = DummyLM([{"answer": "test"}])

    with dspy.context(lm=stand_in):
        assert await model_seen_by_a_request() is stand_in


async def test_the_model_does_not_outlive_the_request():
    await model_seen_by_a_request()

    assert dspy.settings.lm is None
