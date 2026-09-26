import io
import wave

import pytest

from app.voice.speech.sahara_protocol import buffer_bytes, chunks, pcm16_from_wav


def wav_bytes(pcm: bytes, *, channels=1, sample_width=2, sample_rate=16_000):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(sample_width)
        audio.setframerate(sample_rate)
        audio.writeframes(pcm)
    return output.getvalue()


def test_extracts_mono_16khz_pcm16_from_wav():
    pcm = b"\x01\x02" * 900
    assert pcm16_from_wav(wav_bytes(pcm)) == pcm


def test_rejects_audio_outside_the_mobile_recording_contract():
    with pytest.raises(ValueError, match="16 kHz mono PCM16"):
        pcm16_from_wav(wav_bytes(b"\x00" * 2048, channels=2))


def test_pads_only_the_final_short_sahara_chunk():
    parts = chunks(b"1" * 9000)
    assert len(parts[0]) == 8192
    assert len(parts[1]) == 1024
    assert parts[1].startswith(b"1" * 808)


def test_converts_a_worker_memoryview_without_js_proxy_methods():
    assert buffer_bytes(memoryview(b"RIFFaudio")) == b"RIFFaudio"
