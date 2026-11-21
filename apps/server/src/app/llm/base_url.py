"""The model host's base URL when a deployment overrides the default.

The URL decides where the host's API key is sent, so only the host's own
hostnames are accepted; any other hostname must be named in LLM_BASE_URL_ALLOW."""

from __future__ import annotations

import logging
from urllib.parse import urlsplit

from ..settings import Settings

logger = logging.getLogger(__name__)

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def checked_base_url(settings: Settings, own_hosts: tuple[str, ...]) -> str | None:
    """The URL without a trailing slash, None when unset. RuntimeError when it
    is not https to one of `own_hosts` or the one host in LLM_BASE_URL_ALLOW
    (http to localhost is accepted unless deployed). Messages never carry the
    URL itself: it may hold credentials."""
    raw = settings.llm_base_url
    if raw is None or not raw.strip():
        return None
    url = raw.strip()
    try:
        parts = urlsplit(url)
        parts.port  # noqa: B018 - reading it validates the port
        raw_host = parts.hostname
    except ValueError:
        raw_host = None
    if not raw_host or not parts.scheme:
        raise RuntimeError(
            "LLM_BASE_URL must be an absolute URL with a valid host and port."
        )
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
    host = _ascii_host(raw_host)
    if host in own_hosts:
        return url.rstrip("/")
    allowed = settings.llm_base_url_allow
    if allowed and allowed.strip() and host == _ascii_host(allowed):
        logger.warning(
            "LLM_BASE_URL sends the API key to %s, allowed by LLM_BASE_URL_ALLOW.", host
        )
        return url.rstrip("/")
    raise RuntimeError(
        f"LLM_BASE_URL host {host} is not one of {', '.join(own_hosts)}; "
        "to send the key elsewhere, set LLM_BASE_URL_ALLOW to that exact host."
    )


def _ascii_host(host: str) -> str:
    """Lower-case punycode without a trailing dot, so a lookalike never equals
    the real name."""
    host = host.strip().lower().rstrip(".")
    try:
        return host.encode("idna").decode("ascii")
    except UnicodeError:
        raise RuntimeError(
            "LLM_BASE_URL has a host that is not a valid name."
        ) from None
