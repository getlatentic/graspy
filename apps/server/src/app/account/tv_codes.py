"""The secrets and labels of signing a TV in from a phone.

The device code is the TV's, long and random. The user code is short enough to type or to read off a
screen: eight letters and digits without the ones that look like each other. Both are kept only as
hashes; the short code's hash is keyed with the server's secret, as its 40 bits are not enough for a
bare hash to resist a stolen table."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets

# 24 letters (no I or O) and the digits 2 to 9 (no 0 or 1): 32 symbols, 5 bits each.
USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
USER_CODE_LENGTH = 8
_USER_CODE = re.compile(rf"[{USER_CODE_ALPHABET}]{{{USER_CODE_LENGTH}}}")
DEVICE_CODE_BYTES = 32
REFRESH_TOKEN_BYTES = 32


def new_device_code() -> str:
    return secrets.token_urlsafe(DEVICE_CODE_BYTES)


def new_refresh_token() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def new_user_code() -> str:
    return "".join(secrets.choice(USER_CODE_ALPHABET) for _ in range(USER_CODE_LENGTH))


def normalised_user_code(typed: str) -> str | None:
    """What a person typed, as a code: case, spaces and dashes are ignored. None when it cannot be one."""
    code = re.sub(r"[\s-]", "", typed).upper()
    return code if _USER_CODE.fullmatch(code) else None


def hash_secret(value: str) -> str:
    """For the device code and the refresh token, which are 256 random bits."""
    return hashlib.sha256(value.encode()).hexdigest()


def hash_user_code(code: str, secret: str) -> str:
    return hmac.new(
        secret.encode(), b"tv-user-code:" + code.encode(), "sha256"
    ).hexdigest()


def same(left: str, right: str) -> bool:
    """Constant time, for two hashes."""
    return hmac.compare_digest(left.encode(), right.encode())


# The first pattern that matches names the device; a browser comes last because a TV's own names
# contain "Chrome" or "Safari" too.
_DEVICES = (
    (re.compile(r"Tizen", re.IGNORECASE), "Samsung TV"),
    (re.compile(r"Web0S|WebOS|NetCast", re.IGNORECASE), "LG TV"),
    (re.compile(r"BRAVIA", re.IGNORECASE), "Sony TV"),
    (re.compile(r"VIDAA", re.IGNORECASE), "Hisense TV"),
    (re.compile(r"Roku", re.IGNORECASE), "Roku"),
    (re.compile(r"CrKey", re.IGNORECASE), "Chromecast"),
    (re.compile(r"(?-i:AFT[A-Z])|Fire ?TV", re.IGNORECASE), "Fire TV"),
    (
        re.compile(
            r"Android ?TV|Google ?TV|SmartTV|SMART-TV|HbbTV|Aquos|Viera", re.IGNORECASE
        ),
        "Smart TV",
    ),
    (re.compile(r"iPhone", re.IGNORECASE), "iPhone"),
    (re.compile(r"iPad", re.IGNORECASE), "iPad"),
    (re.compile(r"Android", re.IGNORECASE), "Android phone"),
    (re.compile(r"Edg/", re.IGNORECASE), "Edge browser"),
    (re.compile(r"Firefox/", re.IGNORECASE), "Firefox browser"),
    (re.compile(r"Chrome/|CriOS/", re.IGNORECASE), "Chrome browser"),
    (re.compile(r"Safari/", re.IGNORECASE), "Safari browser"),
)
UNKNOWN_DEVICE = "Unknown device"


def device_label(user_agent: str | None) -> str:
    """A name for the device a person is asked to approve, from what it calls itself. The user
    agent is the device's claim, so the label is a hint for the person, not proof."""
    for pattern, label in _DEVICES:
        if pattern.search(user_agent or ""):
            return label
    return UNKNOWN_DEVICE


def country_of(header: str | None) -> str | None:
    """Cloudflare's two-letter country for the connection; "XX" and "T1" mean it has none."""
    code = (header or "").strip().upper()
    if re.fullmatch(r"[A-Z]{2}", code) and code not in {"XX", "T1"}:
        return code
    return None


CONFIRM_LENGTH = 4


def successor_of(refresh_token: str, secret: str) -> str:
    """The credential that replaces `refresh_token`, the same every time it is asked for, so a
    renewal whose answer was lost is answered again with the credential already given, and two
    tabs renewing at once end with one. It needs the server's secret, so a copy of a credential
    does not tell what comes next."""
    digest = hmac.new(
        secret.encode(), b"tv-next:" + refresh_token.encode(), "sha256"
    ).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def masked_email(email: str | None) -> str | None:
    """ "t***@gmail.com": enough for a person to know whose account it is, not to know the address."""
    if not email or "@" not in email:
        return None
    local, _, domain = email.rpartition("@")
    return f"{local[:1]}***@{domain}" if local and domain else None


def hash_source(source: str, secret: str) -> str:
    """The network a request came from, keyed, so the address is not kept."""
    return hmac.new(
        secret.encode(), b"tv-source:" + source.encode(), "sha256"
    ).hexdigest()


def confirmation_matches(code: str, typed: str) -> bool:
    """The last four characters of the code, as typed by someone reading them off the TV screen.
    Case, spaces and dashes are ignored; in constant time."""
    wanted = code[-CONFIRM_LENGTH:]
    given = re.sub(r"[\s-]", "", typed).upper()
    return hmac.compare_digest(wanted.encode(), given.encode())
