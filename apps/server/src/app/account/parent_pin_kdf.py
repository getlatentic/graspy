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
SALT_BYTES = 16
HASH_BYTES = 32
PEPPER_LABEL = b"graspy parent pin pepper v1"

MIN_LENGTH = 4
MAX_LENGTH = 8
PIN_PATTERN = rf"^[0-9]{{{MIN_LENGTH},{MAX_LENGTH}}}$"


def new_salt() -> bytes:
    return secrets.token_bytes(SALT_BYTES)


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


# Digits that repeat or run on are the first guesses of a person who is trying PINs.
def too_easy(pin: str) -> bool:
    if len(set(pin)) == 1:
        return True
    steps = {int(b) - int(a) for a, b in pairwise(pin)}
    return steps in ({1}, {-1})
