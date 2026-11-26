"""Where Cloudflare's edge placed the learner's connection, put into the learner context of a turn.
The header is the edge's own, which it sets on every request it forwards, so it is read from the
request and never from the message an app sends."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ..account.tv_codes import country_of
from .context import METADATA_KEY

EDGE_COUNTRY_HEADER = "cf-ipcountry"
EDGE_COUNTRY_KEY = "edgeCountry"


def with_edge_country(
    metadata: Mapping[str, Any] | None, headers: Mapping[str, str]
) -> dict[str, Any]:
    """The message's metadata with the learner's ``edgeCountry`` set from the request's edge
    country, or taken out when the edge gave none: whatever the app sent under that name is
    never kept."""
    learner = (metadata or {}).get(METADATA_KEY)
    if not isinstance(learner, Mapping):
        learner = {}
    sent = {key: value for key, value in learner.items() if key != EDGE_COUNTRY_KEY}
    header = next(
        (
            value
            for name, value in headers.items()
            if name.lower() == EDGE_COUNTRY_HEADER
        ),
        None,
    )
    if code := country_of(header):
        sent[EDGE_COUNTRY_KEY] = code
    return {**(metadata or {}), METADATA_KEY: sent}
