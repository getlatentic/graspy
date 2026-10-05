from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, StringConstraints
from sse_starlette.sse import EventSourceResponse

from ..account.directory import Learner, LearnerId, learner_key
from ..account.learners import opened
from ..caller import Caller
from ..config.generation import DEFAULT_GRADE_LEVEL
from ..domains.curriculum.coverage import coverage
from ..learner.record import Seen
from ..learner.time import now_ms
from ..security.firebase import (
    InvalidSignIn,
    SignedIn,
    SignInUnchecked,
    lookup_url,
    verified,
)
from ..security.guard import require_session
from ..security.session import issue
from .sse import sse_response

# Every string here reaches a model prompt, so its length bounds the bill.
# FastAPI ignores StringConstraints on a Query, so query parameters take these
# as Query(max_length=...).
MAX_SHORT_TEXT = 100
MAX_TOPIC_TEXT = 300
MAX_SUBJECTS_PER_REQUEST = 20

ShortText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_SHORT_TEXT),
]
Country = Annotated[str, Query(min_length=1, max_length=MAX_SHORT_TEXT)]
Language = Annotated[str, Query(min_length=1, max_length=MAX_SHORT_TEXT)]
Goal = Annotated[str, Query(min_length=1, max_length=MAX_TOPIC_TEXT)]
GradeLevel = Annotated[str | None, Query(alias="gradeLevel", max_length=MAX_SHORT_TEXT)]
# The learner's school system and class, as the education catalogue names them ("NG", "jss-1").
SchoolSystem = Annotated[
    str | None, Query(max_length=MAX_SHORT_TEXT, pattern=r"^[A-Za-z0-9-]+$")
]
SchoolLevel = Annotated[
    str | None, Query(max_length=MAX_SHORT_TEXT, pattern=r"^[A-Za-z0-9-]+$")
]
SubjectNames = Annotated[
    list[str] | None, Query(alias="subject", max_length=MAX_SHORT_TEXT)
]


class Asked(BaseModel):
    country: ShortText
    language: ShortText
    grade_level: ShortText | None = None
    # Each is "label|id", or a bare name used as both.
    subjects: list[ShortText] | None = Field(
        default=None, max_length=MAX_SUBJECTS_PER_REQUEST
    )

    def grade(self) -> str:
        return self.grade_level or DEFAULT_GRADE_LEVEL


class ErrorResponse(BaseModel):
    error: str


class HealthResponse(BaseModel):
    status: str
    details: dict[str, Any]


class LearningPathStep(BaseModel):
    title: str
    level: str


class LearningPathResponse(BaseModel):
    subject: str
    goal: str
    steps: list[LearningPathStep]


class SessionRequest(BaseModel):
    device_id: str | None = Field(
        default=None, alias="deviceId", pattern=r"^[A-Za-z0-9_-]{8,64}$"
    )
    # FingerprintJS's visitor id.
    fingerprint: str | None = Field(default=None, pattern=r"^[a-f0-9]{8,64}$")
    # Present when the learner signs in: the session then names their account.
    firebase_id_token: str | None = Field(
        default=None, alias="firebaseIdToken", max_length=4096
    )
    # The account's learner this device learns as, once one was chosen.
    learner_id: LearnerId | None = Field(default=None, alias="learnerId")


class SessionResponse(BaseModel):
    token: str
    expires_in: int = Field(serialization_alias="expiresIn")
    signed_in: bool = Field(default=False, serialization_alias="signedIn")
    # A signed-in session without one manages the account's learners only.
    learner: Learner | None = None


GENERATION_GUARD = [Depends(require_session)]

api_router = APIRouter()


@api_router.get("/health", response_model=HealthResponse, tags=["meta"])
async def health(request: Request) -> HealthResponse:
    return HealthResponse(
        status="ok", details={"environment": request.app.state.settings.app_env}
    )


@api_router.post("/session", response_model=SessionResponse, tags=["meta"])
async def create_session(
    request: Request, body: SessionRequest | None = None
) -> SessionResponse:
    """An anonymous token: not authentication, but one cheap endpoint to rate
    limit in front of every expensive one. With a Firebase ID token it names
    the account, and the learner the device learns as when it names one the
    account still holds."""
    body = body or SessionRequest()
    if body.firebase_id_token:
        return await _account_session(request, body)
    learner = body.device_id
    if learner and body.fingerprint:
        await Caller(learner, request.app.state.keeping).change(
            Seen(fingerprint=body.fingerprint)
        )
    issued = issue(request.app.state.session_secret, learner=learner)
    return SessionResponse(token=issued.token, expires_in=issued.expires_in)


async def _account_session(request: Request, body: SessionRequest) -> SessionResponse:
    signed = await verified_sign_in(request, body.firebase_id_token)
    directory = await opened(
        request.app.state.keeping, signed.uid, signed.name, now_ms()
    )
    learner = directory.find(body.learner_id) if body.learner_id else None
    return learner_session(request, signed.uid, learner)


def learner_session(
    request: Request, uid: str, learner: Learner | None
) -> SessionResponse:
    issued = issue(
        request.app.state.session_secret,
        learner=learner_key(uid, learner.id) if learner else None,
        account=uid,
    )
    return SessionResponse(
        token=issued.token,
        expires_in=issued.expires_in,
        signed_in=True,
        learner=learner,
    )


async def verified_sign_in(request: Request, id_token: str) -> SignedIn:
    settings = request.app.state.settings
    api_key = settings.firebase_api_key
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail={"error": "Sign-in is not available.", "code": "sign_in_off"},
        )
    try:
        return await verified(
            id_token, api_key, url=lookup_url(settings.firebase_auth_emulator_host)
        )
    except InvalidSignIn as refused:
        raise HTTPException(
            status_code=401, detail={"error": str(refused), "code": "sign_in_invalid"}
        ) from refused
    except SignInUnchecked as unchecked:
        raise HTTPException(
            status_code=503,
            detail={"error": str(unchecked), "code": "sign_in_unchecked"},
        ) from unchecked


@api_router.get(
    "/curriculum/generate-stream",
    dependencies=GENERATION_GUARD,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    tags=["curriculum"],
)
async def generate_curriculum_stream(
    request: Request,
    country: Country,
    language: Language,
    grade_level: GradeLevel = None,
    subjects: SubjectNames = None,
    system: SchoolSystem = None,
    level: SchoolLevel = None,
) -> EventSourceResponse:
    asked = Asked(
        country=country, language=language, grade_level=grade_level, subjects=subjects
    )
    events = request.app.state.curriculum_service.generate_stream(
        country=asked.country,
        language=asked.language,
        grade_level=asked.grade(),
        subjects=asked.subjects,
        system=system,
        level=level,
    )
    return sse_response(events, "Curriculum stream failed")


@api_router.get("/curriculum/coverage", tags=["curriculum"])
async def curriculum_coverage() -> list[dict]:
    """Each class and subject graspy holds a curriculum or voice lessons for, and how well grounded they are."""
    return coverage()


@api_router.get(
    "/curriculum/path",
    dependencies=GENERATION_GUARD,
    response_model=LearningPathResponse,
    responses={500: {"model": ErrorResponse}},
    tags=["curriculum"],
)
async def plan_learning_path(
    request: Request,
    country: Country,
    language: Language,
    goal: Goal,
    grade_level: GradeLevel = None,
) -> LearningPathResponse:
    planned = await request.app.state.path_service.plan_path(
        country, language, grade_level or DEFAULT_GRADE_LEVEL, goal
    )
    return LearningPathResponse.model_validate(planned)


@api_router.get(
    "/subjects/generate-stream",
    dependencies=GENERATION_GUARD,
    tags=["subjects"],
)
async def generate_subjects_stream(
    request: Request,
    country: Country,
    language: Language,
    grade_level: GradeLevel = None,
) -> EventSourceResponse:
    asked = Asked(country=country, language=language, grade_level=grade_level)
    events = request.app.state.subject_service.generate_stream(
        country=asked.country, language=asked.language, grade_level=asked.grade()
    )
    return sse_response(events, "Subject stream failed")
