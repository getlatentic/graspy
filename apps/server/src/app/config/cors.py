"""Which browser origins may call this API. Every Pages preview has its own
hostname, so an origin may name one wildcard subdomain, which becomes a
pattern Starlette matches with re.fullmatch."""

from __future__ import annotations

import re
from collections.abc import Callable

# A wildcard stands in for exactly one subdomain label, and only after a
# scheme: anything looser ("*", "https://*") would allow hosts nobody named.
_WILDCARD_ENTRY = re.compile(r"^https?://\*\.[A-Za-z0-9.-]+$")

_LABEL = "[^.]+"


def _to_pattern(origin: str) -> str:
    # re.escape escapes the "*" too, so the placeholder is matched escaped.
    return re.escape(origin).replace(re.escape("*"), _LABEL)


def build_origin_rules(origins: list[str]) -> tuple[list[str], str | None]:
    """Exact matches and one regex. A wildcard wider than one subdomain label
    is refused: a too-broad allowlist fails open."""
    exact: list[str] = []
    patterns: list[str] = []

    for origin in origins:
        if "*" not in origin:
            exact.append(origin)
            continue
        if not _WILDCARD_ENTRY.match(origin):
            raise ValueError(
                f"CORS origin {origin!r} is not a valid wildcard. Use the form "
                "https://*.example.com, which allows one subdomain label."
            )
        patterns.append(_to_pattern(origin))

    if not patterns:
        return exact, None

    return exact, "|".join(f"(?:{pattern})" for pattern in patterns)


def origin_matcher(origins: list[str]) -> Callable[[str], bool]:
    """Whether an origin is allowed, by the same rules CORS applies."""
    exact, pattern = build_origin_rules(origins)
    compiled = re.compile(pattern) if pattern else None
    return lambda origin: (
        origin in exact or bool(compiled and compiled.fullmatch(origin))
    )
