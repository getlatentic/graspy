"""The sandbox proxy's page, and the Content-Security-Policy a view runs under
in it: built from the domains the view's resource declared, and nothing
else."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from functools import cache
from pathlib import Path
from typing import Any

# An origin, optionally with one wildcard subdomain; plain http only for this
# machine. A quote or a space could smuggle a keyword into the policy.
_ORIGIN = re.compile(
    r"^((https|wss)://(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*"
    r"|http://(localhost|127\.0\.0\.1))(:\d{1,5})?$"
)
DOMAIN_KINDS = ("connectDomains", "resourceDomains", "frameDomains", "baseUriDomains")


WORKER_PATH = "/ui-sandbox-sw.js"
# Built with the views, and read as one of them.
WORKER_FILE = "ui-sandbox-sw.js"
WORKER_POLICY = "default-src 'none'; connect-src 'self'"


@cache
def page() -> str:
    return (Path(__file__).parent / "sandbox.html").read_text(encoding="utf-8")


def requested_csp(raw: str | None) -> dict[str, list[str]]:
    """What cannot be read declares none."""
    try:
        declared = json.loads(raw) if raw else {}
    except ValueError:
        return {}
    if not isinstance(declared, Mapping):
        return {}
    return {kind: _origins(declared.get(kind)) for kind in DOMAIN_KINDS}


def _origins(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and _ORIGIN.match(item)]


def policy(csp: Mapping[str, list[str]], host: str) -> str:
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
            # The origin's service worker opens the view offline.
            "worker-src 'self'",
            "object-src 'none'",
            "form-action 'none'",
            f"frame-ancestors {host}",
        )
    )
