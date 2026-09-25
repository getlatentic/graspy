"""Anonymous session tokens, which anyone can mint. A token minted for a device
names it as `sub`: a claim the device makes, not proof.

Signed, not stored, so no state is shared between isolates; the cost is no
revocation but rotating the secret. Shaped like a JWT without the header: the
algorithm is fixed here, so `alg: none` and algorithm confusion cannot apply.
"""

from __future__ import annotations

import base64
import hmac
import json
import logging
import math
import secrets
import time
from dataclasses import dataclass
from hashlib import sha256

logger = logging.getLogger(__name__)

# Long enough that no learner re-handshakes mid-lesson, short enough that a
# leaked token is not a standing grant.
TOKEN_TTL_SECONDS = 12 * 60 * 60

_SIGNATURE_ALGORITHM = sha256


class InvalidSessionToken(Exception):
    """The message is sent to the client."""


@dataclass(frozen=True)
class IssuedToken:
    token: str
    expires_in: int


def _encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(payload: bytes, secret: str) -> str:
    return _encode(hmac.new(secret.encode(), payload, _SIGNATURE_ALGORITHM).digest())


def issue(
    secret: str, *, learner: str | None = None, now: float | None = None
) -> IssuedToken:
    issued_at = int(time.time() if now is None else now)
    claims: dict = {
        "jti": secrets.token_urlsafe(9),
        "exp": issued_at + TOKEN_TTL_SECONDS,
    }
    if learner:
        claims["sub"] = learner
    payload = json.dumps(claims, separators=(",", ":")).encode()

    return IssuedToken(
        token=f"{_encode(payload)}.{_signature(payload, secret)}",
        expires_in=TOKEN_TTL_SECONDS,
    )


def verify(token: str, secret: str, *, now: float | None = None) -> dict:
    # compare_digest raises on non-ASCII, and a header decoded as latin-1 can
    # carry any byte.
    if not token.isascii():
        raise InvalidSessionToken("The session token is malformed.")
    try:
        encoded_payload, signature = token.split(".", 1)
        payload = _decode(encoded_payload)
    except (ValueError, TypeError) as exc:
        raise InvalidSessionToken("The session token is malformed.") from exc

    # Before parsing, so unsigned bytes are never interpreted; in constant
    # time, so the signature cannot be recovered a byte at a time.
    if not hmac.compare_digest(signature, _signature(payload, secret)):
        raise InvalidSessionToken("The session token's signature does not match.")

    try:
        claims = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise InvalidSessionToken("The session token's payload is unreadable.") from exc

    expires_at = claims.get("exp") if isinstance(claims, dict) else None
    # json.loads accepts NaN, and a NaN expiry is never reached.
    if not isinstance(expires_at, (int, float)) or not math.isfinite(expires_at):
        raise InvalidSessionToken("The session token has no expiry.")

    if expires_at <= (time.time() if now is None else now):
        raise InvalidSessionToken("The session token has expired.")

    return claims


def learner_of(claims: dict) -> str | None:
    learner = claims.get("sub")
    return learner if isinstance(learner, str) and learner else None


def resolve_secret(settings) -> str:
    """Refuses to run unconfigured in production; development falls back to
    an ephemeral key, so a fresh clone runs with no setup."""
    if settings.session_secret:
        return settings.session_secret

    if settings.is_production:
        raise RuntimeError(
            "SESSION_SECRET is required in production: without it the session "
            "guard would sign with a key that changes on every restart."
        )

    logger.warning(
        "SESSION_SECRET is unset — signing with an ephemeral development key. "
        "Existing tokens stop working whenever the server restarts."
    )
    return secrets.token_urlsafe(32)
