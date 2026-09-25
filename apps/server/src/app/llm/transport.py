"""lm15's transport over httpx: lm15's own client uses raw sockets with
Python-side TLS, which Workers lack, while httpx goes through `fetch` there."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

# Not re-exported by dspy.lm15. DSPy is pinned exactly, and
# tests/test_llm_transport.py fails if this path moves.
from dspy._vendor.lm15.transports._types import (
    AsyncTransportResponse,
    TransportRequest,
)

CONNECT_TIMEOUT = 30.0
# Long enough for the slowest single call: one lesson slide.
READ_TIMEOUT = 300.0
WRITE_TIMEOUT = 60.0

# httpx decodes the body, so these do not describe the bytes handed on.
_FRAMING_HEADERS = frozenset(
    {"content-encoding", "content-length", "transfer-encoding"}
)


class HttpxTransport:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient()

    @asynccontextmanager
    async def stream(
        self, request: TransportRequest
    ) -> AsyncIterator[AsyncTransportResponse]:
        response = await self._client.send(
            self._client.build_request(
                request.method,
                request.url,
                headers=request.headers,
                content=request.body,
                timeout=_timeout_for(request),
            ),
            stream=True,
        )

        async def release(_body_consumed: bool) -> None:
            await response.aclose()

        try:
            yield AsyncTransportResponse(
                status=response.status_code,
                reason=response.reason_phrase,
                headers=[
                    (name, value)
                    for name, value in response.headers.multi_items()
                    if name.lower() not in _FRAMING_HEADERS
                ],
                http_version=response.http_version,
                chunks=response.aiter_bytes(),
                release=release,
            )
        finally:
            await response.aclose()


def _timeout_for(request: TransportRequest) -> httpx.Timeout:
    def chosen(value: float | None, default: float) -> float:
        return default if value is None else value

    connect = chosen(request.connect_timeout, CONNECT_TIMEOUT)
    # Waiting for a pooled connection is part of connecting.
    return httpx.Timeout(
        connect=connect,
        read=chosen(request.read_timeout, READ_TIMEOUT),
        write=chosen(request.write_timeout, WRITE_TIMEOUT),
        pool=connect,
    )
