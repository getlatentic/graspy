"""The tutor's tools, built per turn for the learner's situation. What a tool
does for the app travels in its Outcome; the model reads only its words."""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from dataclasses import dataclass, field

from ..learner.record import Where
from .cards import PASSAGE_UI, PRACTICE_UI, Card, placed
from .context import LearnerContext
from .passage import give_passage
from .practice import give_practice
from .reply import Action, Outcome
from .streaming import announce
from .tools import (
    add_topic_tool,
    calculate,
    change_subjects_tool,
    open_subject_tool,
    open_topic_tool,
    propose_path,
    rebuild_plan_tool,
)

Tool = Callable[..., "dict | Outcome"]


@dataclass(frozen=True)
class Turn:
    context: LearnerContext
    message: str

    def where(self) -> Where:
        return Where(
            plan_id=self.context.plan_id,
            subject_slug=self.context.subject_slug,
            topic=self.context.topic,
        )


@dataclass(frozen=True)
class ToolSpec:
    name: str
    build: Callable[[Turn], Tool]
    # The ui:// resource that shows the tool's result, in MCP Apps' terms.
    ui: str | None = None


def _as_is(tool: Tool) -> Callable[[Turn], Tool]:
    return lambda _turn: tool


def _for_context(build: Callable[[LearnerContext], Tool]) -> Callable[[Turn], Tool]:
    return lambda turn: build(turn.context)


TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec("calculate", _as_is(calculate)),
    ToolSpec("open_subject", _for_context(open_subject_tool)),
    ToolSpec("open_topic", lambda turn: open_topic_tool(turn.context, turn.message)),
    ToolSpec("add_topic", _for_context(add_topic_tool)),
    ToolSpec("propose_path", _as_is(propose_path)),
    ToolSpec("change_subjects", _for_context(change_subjects_tool)),
    ToolSpec("rebuild_plan", _for_context(rebuild_plan_tool)),
    ToolSpec("give_practice", _as_is(give_practice), ui=PRACTICE_UI),
    ToolSpec("give_passage", _as_is(give_passage), ui=PASSAGE_UI),
)


@dataclass
class TurnOutputs:
    actions: list[Action] = field(default_factory=list)
    cards: list[Card] = field(default_factory=list)


def _for_model(tool: Tool, outputs: TurnOutputs, where: Where) -> Callable[..., dict]:
    """The tool as the model sees it: announced as it starts, and returning
    only its words, with what it did for the app kept in ``outputs``."""

    def kept(result: dict | Outcome) -> dict:
        if not isinstance(result, Outcome):
            return result
        if result.action is not None:
            outputs.actions.append(result.action)
        if result.card is not None:
            outputs.cards.append(placed(result.card, where))
        return result.told

    if inspect.iscoroutinefunction(tool):

        @functools.wraps(tool)
        async def run_async(*args, **kwargs) -> dict:
            announce(tool.__name__)
            return kept(await tool(*args, **kwargs))

        return run_async

    @functools.wraps(tool)
    def run(*args, **kwargs) -> dict:
        announce(tool.__name__)
        return kept(tool(*args, **kwargs))

    return run


def tools_for(turn: Turn, outputs: TurnOutputs) -> list[Callable[..., dict]]:
    where = turn.where()
    return [_for_model(spec.build(turn), outputs, where) for spec in TOOLS]
