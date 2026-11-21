"""The model host's base URL when a deployment overrides the default."""

from __future__ import annotations

from urllib.parse import urlsplit

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})


def checked_base_url(raw: str | None) -> str | None:
    """The URL without a trailing slash, None when unset, RuntimeError when it
    is not a plain https URL (http only for a local host, which tests use)."""
    if raw is None or not raw.strip():
        return None
    url = raw.strip()
    try:
        parts = urlsplit(url)
        host = parts.hostname
    except ValueError:
        host = None
    if not host:
        raise RuntimeError(f"LLM_BASE_URL must be an absolute URL, got {url!r}.")
    local = host in LOCAL_HOSTS
    if parts.scheme != "https" and not (parts.scheme == "http" and local):
        raise RuntimeError("LLM_BASE_URL must use https (http only for localhost).")
    if parts.username is not None or parts.password is not None:
        raise RuntimeError("LLM_BASE_URL must not carry credentials.")
    if parts.query or parts.fragment or "?" in url or "#" in url:
        raise RuntimeError("LLM_BASE_URL must not carry a query or fragment.")
    return url.rstrip("/")
