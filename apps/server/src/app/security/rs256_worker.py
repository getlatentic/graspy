"""RSASSA-PKCS1-v1_5 with SHA-256, signed by the Worker runtime's WebCrypto: the Worker bundles
no crypto library that could sign."""

from __future__ import annotations

import base64

PEM_MARKERS = ("-----BEGIN PRIVATE KEY-----", "-----END PRIVATE KEY-----")


def pkcs8_der(pem: str) -> bytes:
    """The key's bytes: a Google service account key is PKCS#8 PEM."""
    body = pem.strip()
    for marker in PEM_MARKERS:
        body = body.replace(marker, "")
    return base64.b64decode("".join(body.split()))


async def rs256_in_worker(pem: str, message: bytes) -> bytes:
    from js import Object, Uint8Array, crypto
    from pyodide.ffi import to_js

    algorithm = to_js(
        {"name": "RSASSA-PKCS1-v1_5", "hash": "SHA-256"},
        dict_converter=Object.fromEntries,
    )
    bytes_of_key = pkcs8_der(pem)
    der = Uint8Array.new(len(bytes_of_key))
    der.assign(bytes_of_key)
    key = await crypto.subtle.importKey("pkcs8", der, algorithm, False, to_js(["sign"]))
    data = Uint8Array.new(len(message))
    data.assign(message)
    signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data)
    return bytes(Uint8Array.new(signature).to_py())
