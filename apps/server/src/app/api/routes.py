from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, StringConstraints
from sse_starlette.sse import EventSourceResponse

from ..caller import Caller
from ..config.generation import DEFAULT_GRADE_LEVEL
from ..learner.record import Seen
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


class SessionResponse(BaseModel):
    token: str
    expires_in: int = Field(serialization_alias="expiresIn")


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
    limit in front of every expensive one."""
    device = body.device_id if body else None
    issued = issue(request.app.state.session_secret, learner=device)
    if device and body.fingerprint:
        await Caller(device, request.app.state.keeping).change(
            Seen(fingerprint=body.fingerprint)
        )
    return SessionResponse(token=issued.token, expires_in=issued.expires_in)


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
) -> EventSourceResponse:
    asked = Asked(
        country=country, language=language, grade_level=grade_level, subjects=subjects
    )
    events = request.app.state.curriculum_service.generate_stream(
        country=asked.country,
        language=asked.language,
        grade_level=asked.grade(),
        subjects=asked.subjects,
    )
    return sse_response(events, "Curriculum stream failed")


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
