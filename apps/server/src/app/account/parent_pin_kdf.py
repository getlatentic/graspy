"""How a parent PIN is kept: a keyed digest of it, stretched with PBKDF2-HMAC-SHA256 under the
account's own random salt (docs/PARENT_PIN.md).

Two secrets stand between a copy of the table and the PIN. The salt is in the row. The pepper is
not: it is derived from the server's `SESSION_SECRET` for this one purpose and is never stored, so
a copy of the table cannot even test a guess, however few PINs there are. The pepper is applied
first, as a keyed digest over the account and the PIN, and its output is what PBKDF2 stretches.

In the Worker the stretching is WebCrypto's, which runs natively; in Python it is `hashlib`'s,
which does the same sum, so a row means the same on both."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import secrets
import sys
from itertools import pairwise

KDF = "pbkdf2-sha256"
# The most the Workers runtime's WebCrypto allows PBKDF2: a higher count fails there.
ITERATIONS = 100_000
# A stored count outside this is never hashed with: a row whose count was tampered with (or lowered
# by a bug) is refused, and the parent sets a new PIN.
MIN_ITERATIONS = 100_000
MAX_ITERATIONS = 100_000
KDF_VERSION = 1
SALT_BYTES = 16
HASH_BYTES = 32
PEPPER_LABEL = b"graspy parent pin pepper v1"

MIN_LENGTH = 6
MAX_LENGTH = 8
PIN_PATTERN = rf"^[0-9]{{{MIN_LENGTH},{MAX_LENGTH}}}$"


def new_salt() -> bytes:
    return secrets.token_bytes(SALT_BYTES)


def pepper_id(pepper: bytes) -> str:
    """Names the pepper a hash was made with without giving it away: a PIN made under a secret
    that has since been rotated is seen as no PIN, rather than being answered "wrong"."""
    return hmac.new(pepper, b"pepper id", "sha256").hexdigest()[:16]


def pepper_of(secret: str) -> bytes:
    """The key derived from the session secret for the PIN, so the secret itself is never the key
    of anything else."""
    return hmac.new(secret.encode(), PEPPER_LABEL, "sha256").digest()


def _keyed(pepper: bytes, uid: str, pin: str) -> bytes:
    return hmac.new(pepper, f"pin:{uid}:{pin}".encode(), "sha256").digest()


def _in_python(keyed: bytes, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", keyed, salt, iterations, HASH_BYTES)


async def _in_worker(keyed: bytes, salt: bytes, iterations: int) -> bytes:
    from js import Object, Uint8Array, crypto
    from pyodide.ffi import to_js

    def typed(data: bytes):
        view = Uint8Array.new(len(data))
        view.assign(data)
        return view

    key = await crypto.subtle.importKey(
        "raw", typed(keyed), "PBKDF2", False, to_js(["deriveBits"])
    )
    parameters = to_js(
        {
            "name": "PBKDF2",
            "hash": "SHA-256",
            "salt": typed(salt),
            "iterations": iterations,
        },
        dict_converter=Object.fromEntries,
    )
    bits = await crypto.subtle.deriveBits(parameters, key, HASH_BYTES * 8)
    return Uint8Array.new(bits).to_bytes()


async def stretched(keyed: bytes, salt: bytes, iterations: int) -> bytes:
    if sys.platform == "emscripten":
        return await _in_worker(keyed, salt, iterations)
    # Off the event loop: a hundred thousand rounds is tens of milliseconds of CPU.
    return await asyncio.to_thread(_in_python, keyed, salt, iterations)


async def hash_pin(
    pepper: bytes, uid: str, pin: str, salt: bytes, iterations: int = ITERATIONS
) -> str:
    return (await stretched(_keyed(pepper, uid, pin), salt, iterations)).hex()


def same_hash(kept: str, computed: str) -> bool:
    """In constant time, so how many leading characters agree is not learned from how long it took."""
    return hmac.compare_digest(kept.encode(), computed.encode())


def usable(kdf: str, kdf_version: int, iterations: int) -> bool:
    return (
        kdf == KDF
        and kdf_version == KDF_VERSION
        and MIN_ITERATIONS <= iterations <= MAX_ITERATIONS
    )


# What a person picks first. The rules below catch the families; this names the rest. Both the app
# and the server read `tests/fixtures/weak-pins.json`, so the lists cannot drift.
COMMON = frozenset(
    [
        "123456",
        "654321",
        "123123",
        "321321",
        "112233",
        "332211",
        "121212",
        "212121",
        "123321",
        "456456",
        "456123",
        "123654",
        "654123",
        "159753",
        "357159",
        "951753",
        "753951",
        "147258",
        "258369",
        "369258",
        "741852",
        "852963",
        "963852",
        "987654",
        "456789",
        "789456",
        "147369",
        "369147",
        "159357",
        "357951",
        "147852",
        "258741",
        "369741",
        "123789",
        "789123",
        "321654",
        "654987",
        "987321",
        "124578",
        "135246",
        "246810",
        "135790",
        "102030",
        "010203",
        "020406",
        "030507",
        "112358",
        "314159",
        "271828",
        "520520",
        "521521",
        "5201314",
        "1314520",
        "123000",
        "000123",
        "100200",
        "200100",
        "101010",
        "202020",
        "303030",
        "404040",
        "505050",
        "606060",
        "707070",
        "808080",
        "909090",
        "010101",
        "020202",
        "030303",
        "040404",
        "050505",
        "060606",
        "070707",
        "080808",
        "090909",
        "131313",
        "141414",
        "151515",
        "161616",
        "171717",
        "181818",
        "191919",
        "232323",
        "242424",
        "252525",
        "262626",
        "272727",
        "282828",
        "292929",
        "343434",
        "353535",
        "363636",
        "373737",
        "383838",
        "393939",
        "454545",
        "464646",
        "474747",
        "484848",
        "494949",
        "565656",
        "575757",
        "585858",
        "595959",
        "676767",
        "686868",
        "696969",
        "787878",
        "797979",
        "898989",
        "007007",
        "700700",
        "123123123",
        "1234567",
        "7654321",
        "12345678",
        "87654321",
        "11223344",
        "44332211",
        "12341234",
        "11112222",
        "22221111",
        "13572468",
        "24681357",
        "12344321",
        "11221122",
        "10203040",
        "01020304",
        "12121212",
        "21212121",
        "13131313",
        "20202020",
        "88888888",
        "66666666",
        "11111111",
        "00000000",
        "12312312",
        "99999999",
        "1234512",
        "5555555",
        "1122334",
        "0123456",
        "6543210",
        "0000000",
        "1111111",
        "2222222",
        "3333333",
    ]
)
_KEYPAD = (
    "147258369",
    "741852963",
    "369258147",
    "963852741",
    "159357",
    "357159",
    "951753",
    "753951",
    "2580",
    "0852",
    "1470",
    "0741",
    "3690",
    "0963",
    "1590",
    "0951",
    "3570",
    "0753",
    "14702580",
    "25808520",
    "1397",
    "7931",
    "1793",
    "3971",
    "13795",
    "97531",
    "24680",
    "08642",
    "135790",
    "097531",
    "246802",
    "208642",
)


def _runs(pin: str) -> bool:
    """Digits that all go up by one, or all down by one, wrapping past 9 and 0."""
    steps = {(int(b) - int(a)) % 10 for a, b in pairwise(pin)}
    return steps in ({1}, {9})


def _periodic(pin: str) -> bool:
    """One block of digits said over (121212, 123123, 1212) or each digit doubled (112233)."""
    n = len(pin)
    if any(pin == (pin[:p] * n)[:n] for p in range(1, n // 2 + 1)):
        return True
    return n % 2 == 0 and pin[0::2] == pin[1::2]


def _keypad(pin: str) -> bool:
    """A line, or a corner to corner path, drawn on a phone's keypad."""
    return any(pin in path or pin in path[::-1] for path in _KEYPAD)


def _is_day_month(first: int, second: int) -> bool:
    return (1 <= first <= 31 and 1 <= second <= 12) or (
        1 <= second <= 31 and 1 <= first <= 12
    )


def _is_date(pin: str) -> bool:
    """A day, month and year in any order, with a two or four digit year (1900 to 2035), or a
    month and year: the dates a person has to hand."""
    n = len(pin)

    def year(text: str) -> bool:
        return len(text) == 2 or 1900 <= int(text) <= 2035

    if n == 6:
        a, b, c = int(pin[:2]), int(pin[2:4]), int(pin[4:])
        return (
            _is_day_month(a, b)
            or _is_day_month(b, c)
            or (1 <= a <= 12 and year(pin[2:]))
            or (year(pin[:4]) and 1 <= c <= 12)
        )
    if n == 8:
        return (_is_day_month(int(pin[:2]), int(pin[2:4])) and year(pin[4:])) or (
            year(pin[:4]) and _is_day_month(int(pin[4:6]), int(pin[6:]))
        )
    if n == 7:
        return (
            (year(pin[3:]) and _is_day_month(int(pin[0]), int(pin[1:3])))
            or (year(pin[3:]) and _is_day_month(int(pin[:2]), int(pin[2])))
            or (year(pin[:4]) and _is_day_month(int(pin[4]), int(pin[5:])))
        )
    return False


def too_easy(pin: str) -> bool:
    """A PIN a person is likely to try first: a repeat, a run, a pattern on the keypad, a date, or
    one of the common ones. The 10,000 PINs of four digits fall to a child in days; six digits is
    the least, and these are not offered."""
    return (
        len(set(pin)) == 1
        or pin in COMMON
        or pin[::-1] in COMMON
        or _runs(pin)
        or _periodic(pin)
        or _keypad(pin)
        or _is_date(pin)
    )
