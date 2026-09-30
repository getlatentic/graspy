"""The A2A SDK is imported by the first A2A request, not when the app is built or by any other request.

The public card answers; the card under the A2A prefix asks for a session, as it did before."""

import subprocess
import sys
import textwrap
from pathlib import Path

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
