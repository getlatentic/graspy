"""Spending one of the request budgets (security/rate_limit.py) for a key a route names."""

from __future__ import annotations

from fastapi import HTTPException

from ..security.rate_limit import RETRY_AFTER_SECONDS, Limiter


def too_many() -> HTTPException:
    return HTTPException(
        status_code=429,
        detail={"error": "Too many requests", "code": "rate_limited"},
        headers={"Retry-After": str(RETRY_AFTER_SECONDS)},
    )


async def spend(limiter: Limiter | None, key: str) -> None:
    """One of the budget, kept per key. Where no budget is bound (local runs) nothing is counted."""
    if limiter is not None and not await limiter.allow(key):
        raise too_many()
