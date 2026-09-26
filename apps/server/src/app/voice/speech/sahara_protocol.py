import io
import wave

CHUNK_BYTES = 8192
MIN_CHUNK_BYTES = 1024
ERROR_FRAMES = frozenset(
    {
        "ERROR",
        "INPUT_ERROR",
        "AUTHENTICATION_ERROR",
        "RESOURCE_EXHAUSTED",
        "QUOTA_EXCEEDED",
        "CHUNCK_SIZE_TOO_SMALL",
        "CHUNK_SIZE_TOO_LARGE",
        "INSUFFICIENT_AUDIO_ACTIVITY",
        "SESSION_TIME_LIMIT_EXCEEDED",
        "CHUNK_ID_MISMATCH_WITH_TOTAL",
    }
)


def buffer_bytes(buffer) -> bytes:
    """Normalize the Python Worker ArrayBuffer bridge without assuming a JS proxy."""
    return bytes(buffer)


def pcm16_from_wav(content: bytes) -> bytes:
    try:
        with wave.open(io.BytesIO(content), "rb") as audio:
            if (
                audio.getnchannels() != 1
                or audio.getsampwidth() != 2
                or audio.getframerate() != 16_000
            ):
                raise ValueError("recording must be 16 kHz mono PCM16 WAV")
            return audio.readframes(audio.getnframes())
    except (EOFError, wave.Error) as error:
        raise ValueError("recording is not a readable WAV") from error


def chunks(pcm16: bytes) -> list[bytes]:
    if not pcm16:
        raise ValueError("recording contains no audio frames")
    parts = [
        pcm16[offset : offset + CHUNK_BYTES]
        for offset in range(0, len(pcm16), CHUNK_BYTES)
    ]
    if len(parts[-1]) < MIN_CHUNK_BYTES:
        parts[-1] += b"\x00" * (MIN_CHUNK_BYTES - len(parts[-1]))
    return parts
