"""Where Cloudflare's edge placed the learner's connection. The header is the edge's own, which it
sets on every request it forwards, so it is read from the request and never from the message an
app sends: the context never takes it from metadata (LearnerContext.from_metadata drops it), and a
turn carries it beside its metadata."""

from __future__ import annotations

from collections.abc import Mapping

from ..account.tv_codes import country_of

EDGE_COUNTRY_HEADER = "cf-ipcountry"


def edge_country_of(headers: Mapping[str, str]) -> str | None:
    """The two-letter country of the request, whatever the case its headers came in; None for the
    edge's "XX" and "T1", and for a header that is missing or malformed."""
    header = next(
        (v for name, v in headers.items() if name.lower() == EDGE_COUNTRY_HEADER), None
    )
    return country_of(header)
