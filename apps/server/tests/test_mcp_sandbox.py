"""The sandbox proxy page the app frames each MCP Apps view in, and the page
the proxy writes the view into."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.factory import create_app
from app.mcp.sandbox import declared_csp, page, proxy_policy, view_policy
from app.mcp.views import LocalViews
from app.settings import Settings

APP = "https://graspy.getlatentic.com"
PREVIEW = "https://a1b2c3d4.graspy.pages.dev"
API = "https://graspy-api.getlatentic.com"


@pytest.fixture
def client():
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        cors_origins=f"{APP},https://*.graspy.pages.dev",
        public_base_url=API,
        _env_file=None,
    )
    return TestClient(create_app(settings))


PAGES = ["/ui-sandbox", "/ui-sandbox-frame"]


def directives(header: str) -> dict[str, str]:
    return dict(part.split(" ", 1) for part in header.split("; "))


def view_csp(client, **params) -> dict[str, str]:
    response = client.get("/ui-sandbox-frame", params={"host": APP, **params})
    return directives(response.headers["content-security-policy"])


@pytest.mark.parametrize("host", [APP, PREVIEW], ids=["listed", "preview"])
def test_only_the_app_may_frame_the_sandbox(client, host):
    response = client.get("/ui-sandbox", params={"host": host})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert (
        directives(response.headers["content-security-policy"])["frame-ancestors"]
        == host
    )
    assert "sandbox-proxy-ready" in response.text


@pytest.mark.parametrize("path", PAGES)
@pytest.mark.parametrize(
    "host", ["https://evil.example", "", f"{APP} https://evil.example"]
)
def test_any_other_host_is_refused(client, path, host):
    response = client.get(path, params={"host": host})

    assert response.status_code == 400


def test_the_proxy_runs_its_own_script_and_frames_only_the_views_page(client):
    """The view runs in the frame's page, under its own policy: the proxy's
    grants it nothing. The view shares the proxy's document, so the proxy may
    frame no other page of its origin, some of which carry no policy."""
    declared = {"resourceDomains": [API], "frameDomains": ["https://cdn.example"]}
    response = client.get(
        "/ui-sandbox", params={"host": APP, "csp": json.dumps(declared)}
    )

    assert directives(response.headers["content-security-policy"]) == {
        "default-src": "'none'",
        "script-src": "'unsafe-inline'",
        "style-src": "'unsafe-inline'",
        "frame-src": f"{API}/ui-sandbox-frame",
        "worker-src": "'self'",
        "base-uri": "'none'",
        "object-src": "'none'",
        "form-action": "'none'",
        "frame-ancestors": APP,
    }


def test_the_proxy_writes_the_view_into_a_page_of_its_origin(client):
    """So the view's frame is one the origin's service worker controls."""
    proxy = client.get("/ui-sandbox", params={"host": APP}).text

    assert "new URL(`/ui-sandbox-frame${location.search}`, own)" in proxy
    assert "inner.src = page;" in proxy
    assert "function load({ html, permissions })" in proxy
    assert 'VIEW_SANDBOX = "allow-scripts allow-same-origin allow-forms"' in proxy
    assert 'inner.setAttribute("sandbox", VIEW_SANDBOX)' in proxy


@pytest.mark.parametrize("host", [APP, PREVIEW], ids=["listed", "preview"])
def test_the_views_page_is_framed_only_by_the_proxy_in_the_app(client, host):
    response = client.get("/ui-sandbox-frame", params={"host": host})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.text.startswith("<!doctype html>")
    assert "<script" not in response.text
    assert response.headers["content-security-policy"] == view_policy(
        declared_csp(API), host
    )
    assert (
        directives(response.headers["content-security-policy"])["frame-ancestors"]
        == f"'self' {host}"
    )


@pytest.mark.parametrize("path", PAGES)
def test_a_host_on_the_sandboxs_own_origin_is_refused(path):
    """MCP Apps requires the proxy on another origin than its host."""
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        cors_origins=API,
        public_base_url=API,
        _env_file=None,
    )
    client = TestClient(create_app(settings))

    assert client.get(path, params={"host": API}).status_code == 400


def test_a_view_loads_only_from_this_server_and_reaches_nothing(client):
    csp = view_csp(client)

    assert csp["default-src"] == "'none'"
    assert csp["script-src"] == f"'unsafe-inline' {API}"
    assert csp["font-src"] == f"data: {API}"
    assert csp["base-uri"] == API
    assert csp["connect-src"] == "'none'"
    assert csp["frame-src"] == "'none'"
    assert csp["object-src"] == "'none'"
    assert "worker-src" not in csp


@pytest.mark.parametrize(
    "asked",
    [
        {"connectDomains": ["https://evil.example"]},
        {"resourceDomains": ["https://evil.example"], "frameDomains": ["*"]},
        "not json",
    ],
    ids=["connect", "resources-and-frames", "unreadable"],
)
def test_the_views_page_grants_nothing_a_request_asks_for(client, asked):
    """A view can frame this page itself, naming any policy in the query."""
    raw = asked if isinstance(asked, str) else json.dumps(asked)

    assert view_csp(client, csp=raw) == view_csp(client)


WORKER_SOURCE = Path(__file__).resolve().parents[1] / "ui/src/sandbox/ui-sandbox-sw.js"


def worker_client(tmp_path) -> TestClient:
    """The worker is built with the views, and read the way they are."""
    (tmp_path / "views").mkdir()
    (tmp_path / "views" / "ui-sandbox-sw.js").write_text(
        WORKER_SOURCE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        cors_origins=f"{APP},https://*.graspy.pages.dev",
        public_base_url=API,
        _env_file=None,
    )
    return TestClient(create_app(settings, views=LocalViews(tmp_path)))


def test_the_sandbox_registers_its_origins_service_worker(tmp_path):
    """So a view opens offline once it has opened online."""
    client = worker_client(tmp_path)
    page = client.get("/ui-sandbox", params={"host": APP})
    worker = client.get("/ui-sandbox-sw.js")

    assert directives(page.headers["content-security-policy"])["worker-src"] == "'self'"
    assert 'register("/ui-sandbox-sw.js", { scope: "/ui-sandbox" })' in page.text
    assert 'postMessage({ type: "precache" })' in page.text
    assert worker.status_code == 200
    assert worker.headers["content-type"].startswith("text/javascript")
    assert worker.headers["cache-control"] == "no-cache"
    assert (
        worker.headers["content-security-policy"]
        == "default-src 'none'; connect-src 'self'"
    )


def served_config(worker: str) -> dict:
    line = next(line for line in worker.splitlines() if "const SERVER = " in line)
    return json.loads(line.removeprefix("const SERVER = ").removesuffix(";"))


def test_the_worker_carries_the_pages_it_builds_offline(tmp_path):
    """In its script, which no page can write: a view can write the origin's
    caches, so the worker builds both pages from this alone."""
    config = served_config(worker_client(tmp_path).get("/ui-sandbox-sw.js").text)

    assert config == {
        "origin": API,
        "hosts": [APP, "https://*.graspy.pages.dev"],
        "hostMark": "{host}",
        "pages": {
            "/ui-sandbox": {"body": page(), "policy": proxy_policy("{host}", API)},
            "/ui-sandbox-frame": {
                "body": '<!doctype html><html><head><meta charset="utf-8" /></head></html>',
                "policy": view_policy(declared_csp(API), "{host}"),
            },
        },
    }


def test_the_worker_builds_the_pages_the_server_serves(tmp_path):
    client = worker_client(tmp_path)
    config = served_config(client.get("/ui-sandbox-sw.js").text)

    for path, built in config["pages"].items():
        served = client.get(path, params={"host": APP})
        assert served.text == built["body"]
        assert served.headers["content-security-policy"] == built["policy"].replace(
            "{host}", APP
        )


def test_a_worker_not_built_is_not_found(tmp_path):
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test", session_secret="s", _env_file=None
    )
    client = TestClient(create_app(settings, views=LocalViews(tmp_path)))

    assert client.get("/ui-sandbox-sw.js").status_code == 404
