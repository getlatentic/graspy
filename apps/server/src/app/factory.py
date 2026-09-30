"""Builds the app: the REST API, the tutor over A2A and the MCP server.

Everything is wired here, not in a lifespan hook: the Workers ASGI adapter
runs lifespan once per request.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlsplit

import dspy
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .agent.lazy_a2a import LazyA2ARoutes
from .agent.memory import ConversationStore, InMemoryConversationStore
from .agent.tutor import Tutor
from .api.account_routes import account_router
from .api.account_voice_routes import account_voice_router
from .api.education_routes import education_router
from .api.learner_routes import learner_router
from .api.routes import api_router
from .api.thread_routes import thread_router
from .api.voice_routes import voice_router
from .caller import Keeping
from .config.cors import build_origin_rules, origin_matcher
from .domains.curriculum.service import CurriculumService
from .domains.lesson.service import LessonService
from .domains.path.service import LearningPathService
from .domains.subjects.service import SubjectService
from .learner.store import InMemoryLearnerStore, LearnerStore
from .lessons.makers import LessonMaking, TaskLessonMaking
from .lessons.run import LessonRunner
from .lessons.store import InMemoryLessonStore, LessonStore
from .llm.client import build_lm, configure_cache
from .llm.context import ModelContextMiddleware
from .mcp.protocol import Server
from .mcp.routes import MCP_PATH, mcp_routes
from .mcp.views import LocalViews, Views
from .security.guard import SessionMiddleware
from .security.headers import SecurityHeadersMiddleware
from .security.rate_limit import Budgets, RateLimitMiddleware
from .security.session import resolve_secret
from .settings import Settings, get_settings
from .threads.store import ThreadStore
from .voice.keeping import NO_VOICE, BoundVoice

logger = logging.getLogger(__name__)

DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]


def create_app(
    settings: Settings | None = None,
    *,
    conversations: ConversationStore | None = None,
    lessons: LessonStore | None = None,
    learners: LearnerStore | None = None,
    making: LessonMaking | None = None,
    views: Views | None = None,
    budgets: Budgets | None = None,
    voice: Any | None = None,
    threads: ThreadStore | None = None,
) -> FastAPI:
    """The keyword arguments are the Worker's bindings; without them
    everything is kept in memory, no request budget applies and voice lessons
    are unavailable. ``voice`` is the Worker's env, which the voice modules
    read their bindings from."""
    settings = settings or get_settings()
    lm = build_lm(settings)
    logger.info("Serving with model: %s", lm.model)
    configure_cache()

    app = _bare_app(settings)
    session_secret = resolve_secret(settings)
    origins = _origins(settings)
    _add_middleware(app, settings, origins, session_secret, budgets, lm)
    _add_exception_handlers(app)
    keeping = _keeping(
        lessons, learners, making, conversations, lm, voice, threads or _local_threads()
    )
    _add_state(app, settings, session_secret, origins, keeping, views)
    app.state.voice = voice

    app.include_router(api_router, prefix="/api")
    app.include_router(learner_router, prefix="/api")
    app.include_router(thread_router, prefix="/api")
    app.include_router(account_router, prefix="/api")
    app.include_router(account_voice_router, prefix="/api")
    app.include_router(education_router, prefix="/api")
    app.include_router(voice_router, prefix="/api")
    tutor = Tutor(keeping.conversations)
    app.routes.append(
        LazyA2ARoutes(
            settings.a2a_path_prefix, lambda: _a2a_routes(settings, tutor, keeping)
        )
    )
    app.routes.extend(mcp_routes())
    return app


def _a2a_routes(settings: Settings, tutor: Tutor, keeping: Keeping) -> list:
    """The A2A routes, built, and the SDK imported, by the first A2A request."""
    from .agent.a2a import a2a_routes

    return a2a_routes(settings, tutor, keeping)


def _bare_app(settings: Settings) -> FastAPI:
    expose_docs = not settings.is_deployed
    return FastAPI(
        title="graspy API",
        version="0.1.0",
        docs_url="/api/docs" if expose_docs else None,
        redoc_url="/api/redoc" if expose_docs else None,
        openapi_url="/api/openapi.json" if expose_docs else None,
        swagger_ui_oauth2_redirect_url=None,
    )


def _keeping(
    lessons: LessonStore | None,
    learners: LearnerStore | None,
    making: LessonMaking | None,
    conversations: ConversationStore | None,
    lm: dspy.LM,
    voice: Any | None,
    threads: ThreadStore,
) -> Keeping:
    lessons = lessons or InMemoryLessonStore()
    learners = learners or InMemoryLearnerStore()
    making = making or TaskLessonMaking(
        LessonRunner(LessonService(), lessons, learners, lm)
    )
    return Keeping(
        learners=learners,
        lessons=lessons,
        making=making,
        conversations=conversations or InMemoryConversationStore(),
        threads=threads,
        voice=NO_VOICE if voice is None else BoundVoice(voice),
    )


def _local_threads() -> ThreadStore:
    """Imported only here: a Worker keeps threads in D1 and has no SQLite."""
    from .local_d1 import LocalD1

    return ThreadStore(LocalD1())


def _add_state(
    app: FastAPI,
    settings: Settings,
    session_secret: str,
    origins: list[str],
    keeping: Keeping,
    views: Views | None,
) -> None:
    app.state.settings = settings
    app.state.session_secret = session_secret
    app.state.curriculum_service = CurriculumService()
    app.state.subject_service = SubjectService()
    app.state.path_service = LearningPathService()
    app.state.keeping = keeping
    app.state.origin_allowed = origin_matcher(origins)
    app.state.framing_hosts = origins
    public = urlsplit(settings.public_base_url)
    app.state.mcp = Server(
        views=views or LocalViews(),
        origin=f"{public.scheme}://{public.netloc}",
        keeping=keeping,
    )


def _origins(settings: Settings) -> list[str]:
    origins = settings.cors_origins or DEV_ORIGINS
    if "*" in origins:
        raise ValueError(
            'CORS_ORIGINS cannot be "*": the A2A client sends credentialed '
            "requests, which require an explicit origin allowlist."
        )
    return origins


def _add_middleware(
    app: FastAPI,
    settings: Settings,
    origins: list[str],
    session_secret: str,
    budgets: Budgets | None,
    lm: dspy.LM,
) -> None:
    """Added innermost first; the last added is outermost. CORS wraps every
    rejection below it, or a 401 or 429 reaches the browser as an opaque
    network error."""
    app.add_middleware(ModelContextMiddleware, lm=lm)
    app.add_middleware(
        SessionMiddleware,
        prefixes=(settings.a2a_path_prefix, MCP_PATH),
        secret=session_secret,
    )
    if budgets is not None:
        app.add_middleware(
            RateLimitMiddleware,
            budgets=budgets,
            agent_prefix=settings.a2a_path_prefix,
            mcp_path=MCP_PATH,
        )
    exact_origins, origin_regex = build_origin_rules(origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=exact_origins,
        allow_origin_regex=origin_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        # Starlette echoes the requested headers rather than "*", which stays
        # valid with credentials; the A2A client's headers vary by version.
        allow_headers=["*"],
    )
    app.add_middleware(SecurityHeadersMiddleware)


def _add_exception_handlers(app: FastAPI) -> None:
    def rejection(path: str, errors: list) -> JSONResponse:
        # Without the rejected value: echoing it reflects attacker bytes and
        # turns an oversized parameter into an oversized response.
        detail = [
            {key: value for key, value in error.items() if key != "input"}
            for error in errors
        ]
        logger.warning("Rejected request to %s: %d problem(s)", path, len(detail))
        return JSONResponse(
            status_code=422,
            content={"error": "Invalid request", "detail": jsonable_encoder(detail)},
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_parameters(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return rejection(request.url.path, exc.errors())

    # A handler building a model from parameters the parser accepted.
    @app.exception_handler(ValidationError)
    async def invalid_request(request: Request, exc: ValidationError) -> JSONResponse:
        return rejection(
            request.url.path, exc.errors(include_url=False, include_input=False)
        )
