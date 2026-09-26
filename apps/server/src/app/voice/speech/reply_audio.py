"""The teacher's own voice for what she said about one answer.

Every lesson line is published before a child ever opens the app, but her reply to this child's try
is written in the moment, so nobody could have recorded it. It is spoken once, kept under its own
words, and served from the store to every learner who is told the same thing afterwards.

The words come from the stored turn and never from the request, so a caller cannot make the teacher
say something she did not say.
"""

import json

from starlette.responses import JSONResponse, Response

from .spoken_line import speak

# The words of a marked turn never change, so a phone that holds the clip need never ask again.
_KEEP = "private, max-age=31536000, immutable"


async def _marked_turn(env, learner_key: str, sample_id: str):
    return (
        await env.DB.prepare(
            "SELECT turns.feedback, samples.metadata_json FROM tutoring_turns AS turns "
            "JOIN samples ON samples.id = turns.sample_id "
            "WHERE turns.sample_id = ?1 AND samples.owner_id = ?2 AND turns.state = 'complete'"
        )
        .bind(sample_id, learner_key)
        .first()
    )


async def stream_reply_audio(env, learner_key: str, sample_id: str):
    turn = await _marked_turn(env, learner_key, sample_id)
    if turn is None or not turn["feedback"]:
        return JSONResponse(
            {"detail": "this turn has no reply to play"}, status_code=404
        )
    language = json.loads(turn["metadata_json"]).get("lesson_language", "en")
    try:
        audio, content_type, source = await speak(
            env, turn["feedback"], language, str(getattr(env, "SPITCH_API_KEY", ""))
        )
    except (ValueError, RuntimeError) as error:
        return JSONResponse(
            {"detail": str(error)}, status_code=503, headers={"Retry-After": "5"}
        )
    return Response(
        audio,
        headers={
            "Content-Type": content_type,
            "Cache-Control": _KEEP,
            "X-Content-Type-Options": "nosniff",
            "X-Graspy-Voice": source,
        },
    )
