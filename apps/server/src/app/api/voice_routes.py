"""Voice lessons for one learner: the teacher's next step and the lessons of
their class, the recordings they answer with, and the teacher's voice.

They run only on the Worker, over its D1 database, audio bucket, Workers AI
and the tutor Worker. Under uvicorn every route answers 503."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Body,
    Depends,
    Header,
    HTTPException,
    Path,
    Query,
    Request,
)
from starlette.responses import Response

from ..caller import Caller
from ..voice.samples import SAMPLE_ID, create_sample, media_type, upload_audio
from ..voice.speech.reply_audio import stream_reply_audio
from ..voice.speech.teacher_audio import stream_teacher_audio
from ..voice.speech.teacher_audio_contract import UTTERANCE_ID, AudioFormat
from ..voice.worker_evaluation import (
    evaluate_sample,
    lesson_catalogue,
    lesson_event_heard,
    lesson_move,
)
from .learner_routes import learner_caller

voice_router = APIRouter(prefix="/voice", tags=["voice"])


async def voice_env(request: Request) -> Any:
    env = request.app.state.voice
    if env is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Voice lessons run only on the Worker",
                "code": "voice_unavailable",
            },
        )
    return env


CallerDep = Annotated[Caller, Depends(learner_caller)]
EnvDep = Annotated[Any, Depends(voice_env)]
SampleId = Annotated[str, Path(pattern=f"^{SAMPLE_ID}$", max_length=80)]
LearnerClass = Annotated[str | None, Query(max_length=40)]
Format = Annotated[AudioFormat, Query(alias="format")]
Language = Annotated[str, Query(max_length=8)]


@voice_router.get("/lesson", response_model=None)
async def lesson(
    caller: CallerDep,
    env: EnvDep,
    learner_class: LearnerClass = None,
    language: Language = "en",
    plan: Annotated[str | None, Query(max_length=80)] = None,
) -> Response:
    return await lesson_move(env, caller.learner, learner_class, language, plan)


@voice_router.get("/catalogue", response_model=None)
async def catalogue(
    caller: CallerDep,
    env: EnvDep,
    learner_class: LearnerClass = None,
    language: Language = "en",
) -> Response:
    return await lesson_catalogue(env, caller.learner, learner_class, language)


@voice_router.post("/lesson/events", response_model=None)
async def event_heard(
    caller: CallerDep, env: EnvDep, payload: Annotated[dict[str, Any], Body()]
) -> Response:
    return await lesson_event_heard(env, caller.learner, payload)


@voice_router.get("/teacher-audio/{utterance_id}", response_model=None)
async def teacher_audio(
    caller: CallerDep,
    env: EnvDep,
    utterance_id: Annotated[str, Path(pattern=f"^{UTTERANCE_ID}$", max_length=120)],
    language: Language = "",
    audio_format: Format = "ogg",
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    return await stream_teacher_audio(
        env, utterance_id, language, if_none_match, audio_format
    )


@voice_router.post("/samples", response_model=None)
async def new_sample(
    caller: CallerDep,
    env: EnvDep,
    request: Request,
    idempotency_key: Annotated[str | None, Header(max_length=200)] = None,
) -> Response:
    return await create_sample(
        env, caller.learner, idempotency_key, await request.body()
    )


@voice_router.put("/samples/{sample_id}/audio", response_model=None)
async def sample_audio(
    caller: CallerDep, env: EnvDep, sample_id: SampleId, request: Request
) -> Response:
    return await upload_audio(
        env,
        caller.learner,
        sample_id,
        media_type(request.headers.get("content-type")),
        request.headers.get("content-length"),
        request.body,
    )


@voice_router.post("/samples/{sample_id}/evaluation", response_model=None)
async def evaluation(caller: CallerDep, env: EnvDep, sample_id: SampleId) -> Response:
    return await evaluate_sample(env, caller.learner, sample_id)


@voice_router.get("/samples/{sample_id}/reply-audio", response_model=None)
async def reply_audio(
    caller: CallerDep, env: EnvDep, sample_id: SampleId, audio_format: Format = "ogg"
) -> Response:
    return await stream_reply_audio(env, caller.learner, sample_id, audio_format)
