"""The A2A SDK is imported by the first A2A request, not when the app is built or by any other request.

The public card answers; the card under the A2A prefix asks for a session, as it did before."""

import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
from starlette.routing import Match

from app.agent.a2a import a2a_routes
from app.agent.lazy_a2a import LazyA2ARoutes
from app.settings import Settings

SRC = Path(__file__).parents[1] / "src"

CHILD = textwrap.dedent(
    """
    import sys
    from fastapi.testclient import TestClient
    from app.factory import create_app
    from app.settings import Settings

    app = create_app(Settings(aws_bearer_token_bedrock="b", session_secret="s", _env_file=None))
    client = TestClient(app)
    before = "a2a" in sys.modules
    health = client.get("/api/health").status_code
    after_health = "a2a" in sys.modules
    card = client.get("/.well-known/agent-card.json")
    prefixed = client.get("/a2a/.well-known/agent-card.json")
    print(before, after_health, health, "a2a" in sys.modules, card.status_code, card.json()["name"], prefixed.status_code)
    """
)


def test_the_a2a_sdk_waits_for_the_first_a2a_request():
    ran = subprocess.run(
        [sys.executable, "-c", CHILD],
        check=False,
        capture_output=True,
        text=True,
        env={"PYTHONPATH": str(SRC), "DSPY_CACHEDIR": "/dev/null/x"},
        timeout=120,
    )

    assert ran.returncode == 0, ran.stderr[-2000:]
    assert (
        ran.stdout.strip().splitlines()[-1]
        == "False False 200 True 200 graspy-tutor 401"
    )


def _scope(path: str, root_path: str = "") -> dict:
    return {
        "type": "http",
        "path": root_path + path,
        "root_path": root_path,
        "method": "GET",
    }


@pytest.mark.parametrize("root_path", ["", "/svc"])
def test_every_path_the_sdk_registers_is_one_the_matcher_hands_over(root_path):
    settings = Settings(
        aws_bearer_token_bedrock="b", session_secret="s", _env_file=None
    )
    lazy = LazyA2ARoutes(settings.a2a_path_prefix, list)
    registered = [route.path for route in a2a_routes(settings, object(), object())]

    assert registered
    for path in registered:
        assert lazy.matches(_scope(path, root_path))[0] is Match.FULL, path


def test_other_paths_are_not_taken():
    lazy = LazyA2ARoutes("/a2a", list)
    for path in ("/api/health", "/mcp", "/a2ab", "/"):
        assert lazy.matches(_scope(path))[0] is Match.NONE, path


@pytest.mark.parametrize("prefix", ["a2a", "", "/"])
def test_a_prefix_that_is_not_a_path_is_refused_when_the_app_is_built(prefix):
    with pytest.raises(ValueError, match="A2A path prefix"):
        LazyA2ARoutes(prefix, list)
