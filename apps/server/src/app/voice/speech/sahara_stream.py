"""Sahara streaming ASR over the Worker WebSocket bridge, one committed transcript per turn."""

import asyncio
import base64
import json
import time
from urllib.parse import urlencode

from .sahara_protocol import ERROR_FRAMES, buffer_bytes, chunks, pcm16_from_wav

__all__ = ["buffer_bytes", "transcribe_sahara"]


async def transcribe_sahara(
    audio: bytes, language_pair: str, api_key: str
) -> tuple[str, int]:
    from pyodide.ffi import create_proxy
    from workers import fetch

    if not api_key:
        raise RuntimeError("INTRON_API_KEY is not configured")
    language = {"yo-en": "yo", "pcm-en": "pcm"}.get(language_pair)
    if language is None:
        raise RuntimeError(f"Sahara is not configured for {language_pair}")
    query = urlencode(
        {
            "sample_rate": 16_000,
            "bit_rate": 16,
            "num_channels": 1,
            "use_language_asr_input": language,
        }
    )
    started = time.perf_counter()
    response = await fetch(
        f"https://infer.voice.intron.io/stt/v1/stream?{query}",
        headers={"Upgrade": "websocket", "Authorization": f"Bearer {api_key}"},
    )
    socket = response.js_response.webSocket
    if socket is None:
        raise RuntimeError(f"Sahara WebSocket handshake failed ({response.status})")
    socket.accept()
    loop = asyncio.get_running_loop()
    completed = loop.create_future()
    latest = ""

    def finish(value=None, error=None):
        if completed.done():
            return
        if error is not None:
            completed.set_exception(RuntimeError(error))
        elif value and value.strip():
            completed.set_result(value.strip())
        else:
            completed.set_exception(RuntimeError("Sahara returned an empty transcript"))

    def on_message(event):
        nonlocal latest
        try:
            frame = json.loads(str(event.data))
            kind = frame.get("message_type")
            if kind == "PARTIAL_TRANSCRIPT" and frame.get("transcript"):
                latest = frame["transcript"]
            elif kind == "COMMITTED_TRANSCRIPT":
                finish(frame.get("transcript_text") or latest)
            elif kind in ERROR_FRAMES:
                finish(error=f"{kind}: {frame.get('message', '')}".strip())
        except (TypeError, json.JSONDecodeError) as error:
            finish(error=f"Sahara returned an invalid frame: {error}")

    message_proxy = create_proxy(on_message)
    error_proxy = create_proxy(
        lambda _event: finish(error="Sahara WebSocket transport failed")
    )
    close_proxy = create_proxy(
        lambda _event: finish(
            latest,
            "Sahara closed without a transcript" if not latest else None,
        )
    )
    socket.addEventListener("message", message_proxy)
    socket.addEventListener("error", error_proxy)
    socket.addEventListener("close", close_proxy)
    try:
        for ack_id, part in enumerate(chunks(pcm16_from_wav(audio)), start=1):
            socket.send(
                json.dumps(
                    {
                        "message_type": "INPUT_AUDIO_CHUNK",
                        "audio_base_64": base64.b64encode(part).decode(),
                        "ack_id": ack_id,
                    }
                )
            )
        socket.send(json.dumps({"message_type": "COMMIT"}))
        transcript = await asyncio.wait_for(completed, timeout=15)
        return transcript, round((time.perf_counter() - started) * 1000)
    finally:
        socket.close(1000, "turn complete")
        message_proxy.destroy()
        error_proxy.destroy()
        close_proxy.destroy()
