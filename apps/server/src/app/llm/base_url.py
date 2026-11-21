"""The model host's base URL when a deployment overrides the default.

The URL decides where the host's API key is sent, so only the host's own
hostnames, and where a host serves many tenants the deployment's own path, are
accepted; any other hostname must be named in LLM_BASE_URL_ALLOW."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from ..settings import Settings

logger = logging.getLogger(__name__)

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
HTTPS_PORT = 443
PLAIN_HOST = re.compile(r"[a-z0-9]([a-z0-9.-]*[a-z0-9])?")


@dataclass(frozen=True)
class OwnBase:
    """Hostnames the key may go to: those matching `hostname`, described by
    `label` in errors, and the path prefix ("" for any) that names this
    deployment on a host shared with others."""

    label: str
    hostname: re.Pattern[str]
    path: str = ""

    def accepts(self, host: str, path: str) -> bool:
        return bool(self.hostname.fullmatch(host)) and _under(path, self.path)


def exact_host(name: str, path: str = "") -> OwnBase:
    return OwnBase(name, re.compile(re.escape(name)), path)


def checked_base_url(settings: Settings, own: tuple[OwnBase, ...]) -> str | None:
    """The URL without a trailing slash, None when unset. RuntimeError when it
    is not https to one of `own` or the one host in LLM_BASE_URL_ALLOW (http to
    localhost is accepted unless deployed). Messages never carry the URL
    itself: it may hold credentials."""
    allowed = _allowed_host(settings.llm_base_url_allow)
    raw = settings.llm_base_url
    if raw is None or not raw.strip():
        return None
    url = raw.strip()
    try:
        parts = urlsplit(url)
        port = parts.port
        raw_host = parts.hostname
    except ValueError:
        raw_host = None
    if not raw_host or not parts.scheme:
        raise RuntimeError(
            "LLM_BASE_URL must be an absolute URL with a valid host and port."
        )
    if not raw_host.isascii():
        raise RuntimeError("LLM_BASE_URL must have an ASCII host name.")
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        raise RuntimeError("LLM_BASE_URL must not carry credentials.")
    if parts.query or parts.fragment or "?" in url or "#" in url:
        raise RuntimeError("LLM_BASE_URL must not carry a query or fragment.")
    if parts.scheme == "http" and raw_host in LOCAL_HOSTS and not settings.is_deployed:
        return url.rstrip("/")
    if parts.scheme != "https":
        raise RuntimeError(
            "LLM_BASE_URL must use https (http only to localhost, and not when deployed)."
        )
    if port not in (None, HTTPS_PORT):
        raise RuntimeError("LLM_BASE_URL must use the https port.")
    host = raw_host.lower().rstrip(".")
    if any(base.accepts(host, parts.path) for base in own):
        return url.rstrip("/")
    if allowed and host == allowed:
        logger.warning(
            "LLM_BASE_URL sends the API key to %s, allowed by LLM_BASE_URL_ALLOW.", host
        )
        return url.rstrip("/")
    raise RuntimeError(
        f"LLM_BASE_URL host {host} and path are not this deployment's own "
        f"({', '.join(base.label for base in own) or 'the host needs more settings'}); "
        "to send the key elsewhere, set LLM_BASE_URL_ALLOW to that exact host."
    )


def _under(path: str, prefix: str) -> bool:
    if not prefix:
        return True
    segments = path.split("/")
    if "%" in path or "." in segments or ".." in segments:
        return False
    return (path + "/").startswith(prefix)


def _allowed_host(value: str | None) -> str | None:
    """LLM_BASE_URL_ALLOW is one plain ASCII hostname: no scheme, port, path,
    list or wildcard."""
    if value is None or not value.strip():
        return None
    host = value.strip().lower().rstrip(".")
    if not PLAIN_HOST.fullmatch(host):
        raise RuntimeError("LLM_BASE_URL_ALLOW must be one plain ASCII host name.")
    return host
