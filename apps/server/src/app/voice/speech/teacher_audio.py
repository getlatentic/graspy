"""The teacher's voice for a line the curriculum wrote.

A lesson step says the same words to every learner, so the first child to reach it pays for the
recording and every child after hears it from the store. Publishing ahead of time is a way to warm
that store, never a condition of the lesson working: a step whose words have not been spoken yet is
a step the teacher can speak now.
"""

from starlette.responses import JSONResponse, Response

from .spoken_line import synthesise
from .teacher_audio_contract import (
    audio_cache_key,
    audio_etag,
    audio_version,
    is_fresh,
    teacher_audio_route,
    teacher_utterance,
)

# A phone keeps each line and asks, once in a while, whether its words have changed; the answer to a
# phone that already holds the current recording is a bodiless 304.
_REVALIDATE = "private, no-cache"


def _problem(status: int, detail: str, headers=None):
    return JSONResponse({"detail": detail}, status_code=status, headers=headers)


def _audio_response(body: bytes, provider: str, content_type: str, version: str):
    return Response(
        body,
        headers={
            "Content-Type": content_type,
            "Cache-Control": _REVALIDATE,
            "ETag": audio_etag(version),
            "X-Content-Type-Options": "nosniff",
            "X-Graspy-Voice-Provider": provider,
        },
    )


async def stream_teacher_audio(
    env, utterance_id: str, language: str, if_none_match: str | None
):
    try:
        route = teacher_audio_route(teacher_utterance(utterance_id, language))
    except ValueError as error:
        return _problem(404, str(error))

    version = audio_version(route)
    if is_fresh(if_none_match, version):
        headers = {"ETag": audio_etag(version), "Cache-Control": _REVALIDATE}
        return Response(status_code=304, headers=headers)
    key = audio_cache_key(utterance_id, language, route)
    stored = await env.AUDIO.get(key)
    if stored is not None:
        # A line is a few seconds of Opus, so it is read whole rather than streamed.
        audio = bytes(await stored.bytes())
        return _audio_response(audio, route.provider, route.content_type, version)
    try:
        audio = await synthesise(route, str(getattr(env, "SPITCH_API_KEY", "")))
    except RuntimeError as error:
        return _problem(503, str(error), headers={"Retry-After": "30"})
    await env.AUDIO.put(key, audio, httpMetadata={"contentType": route.content_type})
    return _audio_response(audio, route.provider, route.content_type, version)
