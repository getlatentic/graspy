"""The sandbox proxy's page and the page it writes each view into, their
Content-Security-Policies, and the service worker that serves them offline.
A view's policy is what graspy's views declare, built here and never read
from a request: a view shares the proxy's origin, so it can frame the view's
page itself, with any query it likes."""

from __future__ import annotations

import json
from collections.abc import Mapping
from functools import cache
from pathlib import Path

WORKER_PATH = "/ui-sandbox-sw.js"
# Built with the views, and read as one of them.
WORKER_FILE = "ui-sandbox-sw.js"
WORKER_POLICY = "default-src 'none'; connect-src 'self'"
# Where the server writes what the worker needs to build the pages itself.
WORKER_SERVER = "__SERVER__"
# Stands for the host in a policy the worker fills once it has checked one.
HOST_MARK = "{host}"

PROXY_PATH = "/ui-sandbox"
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


def served_worker(source: str, own: str, hosts: list[str]) -> str:
    """The worker with this server's pages, policies and framing hosts in its
    script, which no page can write: it builds the pages from them offline,
    never from a cache a view could have written."""
    server = {
        "origin": own,
        "hosts": hosts,
        "hostMark": HOST_MARK,
        "pages": {
            PROXY_PATH: {"body": page(), "policy": proxy_policy(HOST_MARK, own)},
            FRAME_PATH: {
                "body": FRAME_PAGE,
                "policy": view_policy(declared_csp(own), HOST_MARK),
            },
        },
    }
    return source.replace(WORKER_SERVER, json.dumps(server, sort_keys=True))
