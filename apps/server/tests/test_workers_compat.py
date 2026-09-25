"""What a Worker requires of the app, which local runs cannot show."""

import asyncio
import inspect

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.factory import create_app
from app.settings import Settings


def app():
    return create_app(
        Settings(
            aws_bearer_token_bedrock="bedrock-test", session_secret="s", _env_file=None
        )
    )


def api_routes(routes):
    """Every APIRoute, including those behind an included router, which this
    FastAPI keeps as a wrapper rather than copying into ``app.routes``. Their
    paths are relative to the router's prefix."""
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        inner = getattr(route, "original_router", None)
        if inner is not None:
            yield from api_routes(inner.routes)


def synchronous_callables(route):
    def walk(dependant):
        for dependency in dependant.dependencies:
            call = dependency.call
            if call and not (
                inspect.iscoroutinefunction(call) or inspect.isasyncgenfunction(call)
            ):
                yield f"dependency {call.__module__}.{call.__qualname__}"
            yield from walk(dependency)

    if not inspect.iscoroutinefunction(route.endpoint):
        yield f"handler {route.endpoint.__module__}.{route.endpoint.__qualname__}"
    yield from walk(route.dependant)


def test_the_scan_reaches_the_api_routes():
    """Guards the test below: a scan that finds nothing passes vacuously."""
    paths = {route.path for route in api_routes(app().routes)}

    assert {
        "/health",
        "/session",
        "/learner",
        "/subjects/generate-stream",
    } <= paths


def test_nothing_in_the_request_path_is_synchronous():
    """FastAPI runs a synchronous handler or dependency on a worker thread, and
    a Worker cannot start threads: every request that reached one failed with
    "can't start new thread"."""
    offenders = sorted(
        {
            name
            for route in api_routes(app().routes)
            for name in synchronous_callables(route)
        }
    )

    assert offenders == []


def test_serving_requests_leaves_the_routes_unchanged():
    """The Workers ASGI adapter runs lifespan once per request, so anything a
    lifespan hook attached would be attached again on every request."""
    application = app()
    before = [
        getattr(route, "path", type(route).__name__) for route in application.routes
    ]

    for _ in range(3):
        with TestClient(application) as client:
            client.get("/api/health")

    after = [
        getattr(route, "path", type(route).__name__) for route in application.routes
    ]
    assert after == before


async def test_the_app_can_be_built_again_from_another_request():
    """A Worker builds the app inside the first request, and retries in a later
    one if that build fails. DSPy lets only the async task that first called
    dspy.configure call it again, so a build that configured DSPy globally
    would fail every retry on that rule instead of on the original cause."""

    async def build():
        app()

    await asyncio.create_task(build())
    await asyncio.create_task(build())
