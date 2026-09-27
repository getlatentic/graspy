"""The learner's route as an MCP app tool: whether they learn by voice alone,
which both apps ask rather than keep a rule of their own."""

from __future__ import annotations

from ..app_tool import AppTool
from ..caller import Caller
from ..education.route import ClassAsk, voice_only
from .plan import Plan


async def _stored_class(caller: Caller) -> ClassAsk | None:
    stored = await caller.plan()
    if not stored:
        return None
    plan = Plan.model_validate_json(stored)
    extra = plan.model_extra or {}
    return ClassAsk(
        system=extra.get("system"),
        level=extra.get("level"),
        grade_level=plan.grade_level,
    )


async def learner_route(ask: ClassAsk, caller: Caller) -> dict:
    """The class the app's plan names; failing that, the plan the learner's
    devices share. A class the catalogue cannot place learns by slides and
    voice."""
    found = voice_only(ask)
    if found is None:
        stored = await _stored_class(caller)
        found = voice_only(stored) if stored else None
    alone = bool(found)
    told = "by voice alone" if alone else "by slides and voice"
    return {
        "content": [{"type": "text", "text": f"The learner learns {told}."}],
        "structuredContent": {"voiceOnly": alone},
    }


LEARNER_TOOLS: tuple[AppTool, ...] = (
    AppTool(
        "learner_route",
        "Whether the learner learns by voice alone, with no slide subjects, "
        "or by slides and voice.",
        ClassAsk,
        learner_route,
    ),
)
