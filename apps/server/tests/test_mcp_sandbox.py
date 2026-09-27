"""The sandbox the app frames each MCP Apps view in: one per build of the
views, its proxy page, the page each view is written into, and its worker."""

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.factory import create_app
from app.mcp.sandbox import build_of, served_worker
from app.mcp.views import LocalViews
from app.settings import Settings

APP = "https://graspy.getlatentic.com"
PREVIEW = "https://a1b2c3d4.graspy.pages.dev"
API = "https://graspy-api.getlatentic.com"
HOSTS = f"{APP},https://*.graspy.pages.dev"
WORKER_SOURCE = Path(__file__).resolve().parents[1] / "ui/src/sandbox/ui-sandbox-sw.js"
# What the views' build writes into the worker.
FILES = {"/views/assets/lesson-abc.js": "digest-of-lesson"}
WORKER = WORKER_SOURCE.read_text(encoding="utf-8").replace(
    "__FILES__", json.dumps(FILES)
)
BUILD = build_of(WORKER)
SANDBOX = f"/ui-sandbox/{BUILD}/"


def app_with(tmp_path, worker: str | None = WORKER, hosts: str = HOSTS):
    (tmp_path / "views").mkdir(exist_ok=True)
    if worker is not None:
        (tmp_path / "views" / "ui-sandbox-sw.js").write_text(worker, encoding="utf-8")
    configured = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        cors_origins=hosts,
        public_base_url=API,
        _env_file=None,
    )
    return TestClient(create_app(configured, views=LocalViews(tmp_path)))


@pytest.fixture
def client(tmp_path):
    return app_with(tmp_path)


def directives(header: str) -> dict[str, str]:
    return dict(part.split(" ", 1) for part in header.split("; "))


@pytest.mark.parametrize("host", [APP, PREVIEW], ids=["listed", "preview"])
def test_only_the_app_may_frame_the_sandbox(client, host):
    response = client.get(SANDBOX, params={"host": host})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert (
        directives(response.headers["content-security-policy"])["frame-ancestors"]
        == host
    )
    assert "sandbox-proxy-ready" in response.text


@pytest.mark.parametrize(
    "host", ["https://evil.example", "", f"{APP} https://evil.example"]
)
@pytest.mark.parametrize("page", ["", "frame"])
def test_any_other_host_is_refused(client, host, page):
    response = client.get(f"{SANDBOX}{page}", params={"host": host})

    assert response.status_code == 400


def test_a_host_on_the_sandboxs_own_origin_is_refused(tmp_path):
    """MCP Apps requires the proxy on another origin than its host."""
    client = app_with(tmp_path, hosts=API)

    assert client.get(SANDBOX, params={"host": API}).status_code == 400


@pytest.mark.parametrize("build", ["not-a-build", "ABCDEF0123456789", "0" * 17])
def test_a_sandbox_that_names_no_build_is_not_found(client, build):
    response = client.get(f"/ui-sandbox/{build}/", params={"host": APP})

    assert response.status_code == 404


def test_the_proxy_runs_its_own_script_and_frames_only_its_view_page(client):
    csp = directives(
        client.get(SANDBOX, params={"host": APP}).headers["content-security-policy"]
    )

    assert csp["default-src"] == "'none'"
    assert csp["script-src"] == "'unsafe-inline'"
    assert csp["frame-src"] == f"{API}{SANDBOX}frame"
    assert csp["worker-src"] == "'self'"
    assert csp["base-uri"] == "'none'"
    assert "connect-src" not in csp


def test_an_earlier_builds_sandbox_is_the_same_page(client):
    """Its worker, not the server, serves it: a device only frames an earlier
    build's sandbox for a page it kept."""
    earlier = "0123456789abcdef"
    response = client.get(f"/ui-sandbox/{earlier}/", params={"host": APP})

    assert response.status_code == 200
    assert (
        directives(response.headers["content-security-policy"])["frame-src"]
        == f"{API}/ui-sandbox/{earlier}/frame"
    )


def test_a_view_loads_only_from_this_server_whatever_is_asked(client):
    declared = {"resourceDomains": ["https://cdn.example"], "connectDomains": ["*"]}
    response = client.get(
        f"{SANDBOX}frame", params={"host": APP, "csp": json.dumps(declared)}
    )
    csp = directives(response.headers["content-security-policy"])

    assert response.status_code == 200
    assert csp["default-src"] == "'none'"
    assert csp["script-src"] == f"'unsafe-inline' {API}"
    assert csp["font-src"] == f"data: {API}"
    assert csp["base-uri"] == API
    assert csp["connect-src"] == "'none'"
    assert csp["frame-src"] == "'none'"
    assert csp["object-src"] == "'none'"
    assert csp["frame-ancestors"] == f"'self' {APP}"


def test_the_proxy_registers_its_builds_worker_and_frames_its_page():
    page = (Path(__file__).resolve().parents[1] / "src/app/mcp/sandbox.html").read_text(
        encoding="utf-8"
    )

    assert 'register("sw.js")' in page
    assert 'new URL("frame", location.href)' in page


def test_the_current_builds_worker_carries_the_servers_pages(client):
    worker = client.get(f"{SANDBOX}sw.js")

    assert worker.status_code == 200
    assert worker.headers["content-type"].startswith("text/javascript")
    assert worker.headers["cache-control"] == "no-cache"
    assert (
        worker.headers["content-security-policy"]
        == "default-src 'none'; connect-src 'self'"
    )
    server = json.loads(re.search(r"const SERVER = (\{.*\});", worker.text)[1])
    proxy = client.get(SANDBOX, params={"host": APP})
    frame = client.get(f"{SANDBOX}frame", params={"host": APP})
    assert server["origin"] == API
    assert server["hosts"] == HOSTS.split(",")
    assert server["scope"] == SANDBOX
    assert set(server["pages"]) == {SANDBOX, f"{SANDBOX}frame"}
    assert server["pages"][SANDBOX]["body"] == proxy.text
    assert server["pages"][f"{SANDBOX}frame"]["body"] == frame.text
    for path, served in ((SANDBOX, proxy), (f"{SANDBOX}frame", frame)):
        policy = server["pages"][path]["policy"].replace(server["hostMark"], APP)
        assert policy == served.headers["content-security-policy"]
    assert json.dumps(FILES) in worker.text


def test_an_earlier_builds_worker_is_gone(client):
    """So the browser keeps the one that build registered."""
    assert client.get("/ui-sandbox/0123456789abcdef/sw.js").status_code == 404


def test_a_worker_not_built_is_not_found(tmp_path):
    client = app_with(tmp_path, worker=None)

    assert client.get(f"{SANDBOX}sw.js").status_code == 404
    assert client.get("/ui-sandbox", params={"host": APP}).status_code == 404


def test_a_build_is_named_by_its_worker():
    changed = WORKER.replace("digest-of-lesson", "digest-of-another-lesson")

    assert re.fullmatch(r"[0-9a-f]{16}", BUILD)
    assert build_of(changed) != BUILD
    assert build_of(WORKER) == BUILD


def test_the_worker_is_written_once_with_the_server():
    served = served_worker(WORKER, API, [APP])

    assert "__SERVER__" not in served
    assert "__FILES__" not in served


def test_a_host_naming_no_build_is_sent_to_the_current_one(client):
    response = client.get(
        "/ui-sandbox",
        params={"host": APP, "csp": "{}"},
        follow_redirects=False,
    )

    assert response.status_code == 307
    assert (
        response.headers["location"]
        == f"{SANDBOX}?host=https%3A%2F%2Fgraspy.getlatentic.com"
    )


def test_the_sandbox_sets_its_own_policy_past_the_apis(client):
    """The API's own policy frames nothing; the sandbox's pages are framed."""
    response = client.get(SANDBOX, params={"host": APP})

    assert "frame-ancestors 'none'" not in response.headers["content-security-policy"]
