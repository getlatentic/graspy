"""A wildcard origin widens the allowlist by exactly one subdomain label."""

import re

import pytest

from app.config.cors import build_origin_rules

CONFIGURED = [
    "https://graspy.tosinamuda.com",
    "https://graspy.pages.dev",
    "https://*.graspy.pages.dev",
]


def _allows(origin: str) -> bool:
    exact, pattern = build_origin_rules(CONFIGURED)
    # Mirrors Starlette: exact membership, then fullmatch on the regex.
    return origin in exact or bool(re.compile(pattern).fullmatch(origin))


@pytest.mark.parametrize(
    "origin",
    [
        "https://graspy.tosinamuda.com",
        "https://graspy.pages.dev",
        "https://a1b2c3d4.graspy.pages.dev",  # Pages preview hash
        "https://fix-login.graspy.pages.dev",  # Pages branch preview
    ],
)
def test_allows_listed_and_preview_origins(origin):
    assert _allows(origin)


@pytest.mark.parametrize(
    ("origin", "reason"),
    [
        ("https://evil.com", "unrelated origin"),
        ("https://graspyXpages.dev", "dots are literal, not any-char"),
        ("https://a.b.graspy.pages.dev", "wildcard spans one label only"),
        ("https://graspy.pages.dev.evil.com", "suffix must not match"),
        ("https://evil.com/x.graspy.pages.dev", "no partial match"),
        ("http://a1b2c3d4.graspy.pages.dev", "scheme is part of the origin"),
    ],
)
def test_rejects(origin, reason):
    assert not _allows(origin), reason


def test_no_wildcard_yields_no_pattern():
    exact, pattern = build_origin_rules(["https://graspy.pages.dev"])
    assert exact == ["https://graspy.pages.dev"]
    assert pattern is None


@pytest.mark.parametrize(
    "entry", ["*", "https://*", "*.graspy.pages.dev", "https://*.*"]
)
def test_rejects_wildcards_that_fail_open(entry):
    """A pattern this broad would admit hosts nobody named, so it must not
    reach the middleware as a working config."""
    with pytest.raises(ValueError) as refused:
        build_origin_rules([entry])

    assert str(refused.value) == (
        f"CORS origin {entry!r} is not a valid wildcard. Use the form "
        "https://*.example.com, which allows one subdomain label."
    )


def test_several_wildcards_each_admit_their_own_previews():
    exact, pattern = build_origin_rules(
        ["https://*.graspy.pages.dev", "https://*.graspy-staging.pages.dev"]
    )
    matches = re.compile(pattern).fullmatch

    assert exact == []
    assert matches("https://a1b2.graspy.pages.dev")
    assert matches("https://a1b2.graspy-staging.pages.dev")
    assert not matches("https://a1b2.graspy.pages.dev|https://x")
