"""The sandbox proxy page the app frames each MCP Apps view in."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.factory import create_app
from app.mcp.sandbox import policy, requested_csp
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
        _env_file=None,
    )
    return TestClient(create_app(settings))


def directives(header: str) -> dict[str, str]:
    return dict(part.split(" ", 1) for part in header.split("; "))


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


@pytest.mark.parametrize(
    "host", ["https://evil.example", "", f"{APP} https://evil.example"]
)
def test_any_other_host_is_refused(client, host):
    response = client.get("/ui-sandbox", params={"host": host})

    assert response.status_code == 400


def test_a_host_on_the_sandboxs_own_origin_is_refused():
    """MCP Apps requires the proxy on another origin than its host."""
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        cors_origins=API,
        public_base_url=API,
        _env_file=None,
    )
    client = TestClient(create_app(settings))

    assert client.get("/ui-sandbox", params={"host": API}).status_code == 400


def test_a_view_that_declares_nothing_may_load_and_reach_nothing(client):
    csp = directives(
        client.get("/ui-sandbox", params={"host": APP}).headers[
            "content-security-policy"
        ]
    )

    assert csp["default-src"] == "'none'"
    assert csp["script-src"] == "'unsafe-inline'"
    assert csp["connect-src"] == "'none'"
    assert csp["frame-src"] == "'none'"
    assert csp["base-uri"] == "'none'"
    assert csp["object-src"] == "'none'"


def test_a_view_loads_from_the_domains_it_declared(client):
    declared = {"resourceDomains": [API], "baseUriDomains": [API]}
    response = client.get(
        "/ui-sandbox", params={"host": APP, "csp": json.dumps(declared)}
    )
    csp = directives(response.headers["content-security-policy"])

    assert csp["script-src"] == f"'unsafe-inline' {API}"
    assert csp["font-src"] == f"data: {API}"
    assert csp["base-uri"] == API
    assert csp["connect-src"] == "'none'"


@pytest.mark.parametrize(
    "domain",
    [
        "https://cdn.example 'unsafe-eval'",
        "https://cdn.example; script-src *",
        "*",
        "javascript:alert(1)",
        "http://cdn.example",
    ],
)
def test_a_declared_domain_that_is_not_an_origin_is_dropped(domain):
    csp = requested_csp(json.dumps({"resourceDomains": [domain, API]}))

    assert csp["resourceDomains"] == [API]


def test_this_machine_may_serve_views_over_http_in_development():
    csp = requested_csp(json.dumps({"resourceDomains": ["http://localhost:8081"]}))

    assert csp["resourceDomains"] == ["http://localhost:8081"]


@pytest.mark.parametrize(
    "raw", [None, "", "not json", "[1]", '{"resourceDomains": "x"}']
)
def test_an_unreadable_declaration_declares_nothing(raw):
    assert policy(requested_csp(raw), APP) == policy({}, APP)


WORKER_SOURCE = Path(__file__).resolve().parents[1] / "ui/public/views/ui-sandbox-sw.js"


def test_the_sandbox_registers_its_origins_service_worker(tmp_path):
    """So a view opens offline once it has opened online. The worker is
    built with the views, and read the way they are."""
    (tmp_path / "views").mkdir()
    (tmp_path / "views" / "ui-sandbox-sw.js").write_text(
        WORKER_SOURCE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test",
        session_secret="s",
        cors_origins=APP,
        _env_file=None,
    )
    client = TestClient(create_app(settings, views=LocalViews(tmp_path)))
    page = client.get("/ui-sandbox", params={"host": APP})
    worker = client.get("/ui-sandbox-sw.js")

    assert directives(page.headers["content-security-policy"])["worker-src"] == "'self'"
    assert 'register("/ui-sandbox-sw.js", { scope: "/ui-sandbox" })' in page.text
    assert worker.status_code == 200
    assert worker.headers["content-type"].startswith("text/javascript")
    assert worker.headers["cache-control"] == "no-cache"
    assert (
        worker.headers["content-security-policy"]
        == "default-src 'none'; connect-src 'self'"
    )
    assert 'url.pathname === "/ui-sandbox"' in worker.text


def test_a_worker_not_built_is_not_found(tmp_path):
    settings = Settings(
        aws_bearer_token_bedrock="bedrock-test", session_secret="s", _env_file=None
    )
    client = TestClient(create_app(settings, views=LocalViews(tmp_path)))

    assert client.get("/ui-sandbox-sw.js").status_code == 404
