"""lm15's transport contract, carried by httpx."""

import httpx
import pytest

# The transport depends on this private path; DSPy is pinned exactly, and this
# import fails first if an upgrade moves it.
from dspy._vendor.lm15.transports._types import AsyncTransportResponse, TransportRequest

from app.llm.transport import (
    CONNECT_TIMEOUT,
    READ_TIMEOUT,
    WRITE_TIMEOUT,
    HttpxTransport,
)


def transport_for(handler) -> HttpxTransport:
    return HttpxTransport(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def request(**overrides) -> TransportRequest:
    return TransportRequest(
        method="POST",
        url="https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions",
        headers=[("authorization", "Bearer k"), ("content-type", "application/json")],
        body=b'{"model":"m"}',
        **overrides,
    )


async def read_all(response: AsyncTransportResponse) -> bytes:
    return b"".join([chunk async for chunk in response])


async def test_the_request_is_sent_as_lm15_built_it():
    seen = {}

    def handler(sent: httpx.Request) -> httpx.Response:
        seen.update(
            method=sent.method,
            url=str(sent.url),
            auth=sent.headers["authorization"],
            body=sent.content,
        )
        return httpx.Response(200, json={})

    async with transport_for(handler).stream(request()):
        pass

    assert seen == {
        "method": "POST",
        "url": "https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions",
        "auth": "Bearer k",
        "body": b'{"model":"m"}',
    }


async def test_the_response_reaches_lm15_intact():
    handler = lambda _: httpx.Response(
        201, headers={"x-request-id": "r1"}, content=b"hello"
    )

    async with transport_for(handler).stream(request()) as response:
        assert isinstance(response, AsyncTransportResponse)
        assert response.status == 201
        assert response.header("x-request-id") == "r1"
        assert await read_all(response) == b"hello"


async def test_framing_headers_are_dropped_because_the_body_is_already_decoded():
    """httpx decompresses the body; a surviving content-encoding header would
    tell lm15 to decompress it a second time."""
    import gzip

    handler = lambda _: httpx.Response(
        200, headers={"content-encoding": "gzip"}, content=gzip.compress(b'{"ok":true}')
    )

    async with transport_for(handler).stream(request()) as response:
        assert response.header("content-encoding") is None
        assert response.header("content-length") is None
        assert await read_all(response) == b'{"ok":true}'


async def test_an_error_status_is_returned_not_raised():
    """lm15 decides what a 429 or a 500 means; the transport only carries it."""
    handler = lambda _: httpx.Response(429, json={"error": "slow down"})

    async with transport_for(handler).stream(request()) as response:
        assert response.status == 429


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({}, (CONNECT_TIMEOUT, READ_TIMEOUT, WRITE_TIMEOUT)),
        (
            {"connect_timeout": 1.0, "read_timeout": 2.0, "write_timeout": 3.0},
            (1.0, 2.0, 3.0),
        ),
        ({"read_timeout": 0.0}, (CONNECT_TIMEOUT, 0.0, WRITE_TIMEOUT)),
    ],
    ids=["defaults", "per-request", "zero-is-a-value"],
)
async def test_timeouts_come_from_the_request_or_the_defaults(overrides, expected):
    seen = {}

    def handler(sent: httpx.Request) -> httpx.Response:
        timeout = sent.extensions["timeout"]
        seen["timeouts"] = (timeout["connect"], timeout["read"], timeout["write"])
        seen["pool"] = timeout["pool"]
        return httpx.Response(200)

    async with transport_for(handler).stream(request(**overrides)):
        pass

    assert seen["timeouts"] == expected
    assert seen["pool"] == expected[0]


async def test_release_closes_the_response():
    closed = []

    class Tracking(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b"x"

        async def aclose(self):
            closed.append(True)

    handler = lambda _: httpx.Response(200, stream=Tracking())

    async with transport_for(handler).stream(request()) as response:
        await response.aclose()

    assert closed
