"""The sandbox proxy's page and the page it writes each view into, and their
Content-Security-Policies. A view's policy is what graspy's views declare,
built here and never read from a request: a view shares the proxy's origin,
so it can frame the view's page itself, with any query it likes."""

from __future__ import annotations

from collections.abc import Mapping
from functools import cache
from pathlib import Path

WORKER_PATH = "/ui-sandbox-sw.js"
# Built with the views, and read as one of them.
WORKER_FILE = "ui-sandbox-sw.js"
WORKER_POLICY = "default-src 'none'; connect-src 'self'"

FRAME_PATH = "/ui-sandbox-frame"
# Loaded, then written over with the view, so that the view's frame is a page
# of this origin the worker controls: the worker then serves its files.
FRAME_PAGE = '<!doctype html><html><head><meta charset="utf-8" /></head></html>'


@cache
def page() -> str:
    return (Path(__file__).parent / "sandbox.html").read_text(encoding="utf-8")


def declared_csp(origin: str) -> dict[str, list[str]]:
    """What every graspy view declares: its files and base from this server,
    and nothing else."""
    return {"resourceDomains": [origin], "baseUriDomains": [origin]}


def proxy_policy(host: str, own: str) -> str:
    """The proxy runs its own script and frames only the view's page: never
    another page of its origin, some of which carry no policy."""
    return "; ".join(
        (
            "default-src 'none'",
            "script-src 'unsafe-inline'",
            "style-src 'unsafe-inline'",
            f"frame-src {own}{FRAME_PATH}",
            # The origin's service worker opens the view offline.
            "worker-src 'self'",
            "base-uri 'none'",
            "object-src 'none'",
            "form-action 'none'",
            f"frame-ancestors {host}",
        )
    )


def view_policy(csp: Mapping[str, list[str]], host: str) -> str:
    """Framed by the proxy, on this origin, in the host's frame."""

    def sources(kind: str, fallback: str = "'none'") -> str:
        return " ".join(csp.get(kind, [])) or fallback

    resources = " ".join(csp.get("resourceDomains", []))
    return "; ".join(
        directive.strip()
        for directive in (
            "default-src 'none'",
            f"script-src 'unsafe-inline' {resources}",
            f"style-src 'unsafe-inline' {resources}",
            f"img-src data: blob: {resources}",
            f"font-src data: {resources}",
            f"media-src data: blob: {resources}",
            f"connect-src {sources('connectDomains')}",
            f"frame-src {sources('frameDomains')}",
            f"base-uri {sources('baseUriDomains')}",
            "object-src 'none'",
            "form-action 'none'",
            f"frame-ancestors 'self' {host}",
        )
    )
