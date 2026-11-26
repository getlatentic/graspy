"""The tutor's tools, built per turn for the learner's situation. What a tool
does for the app travels in its Outcome; the model reads only its words."""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from dataclasses import dataclass, field

from ..learner.record import Where
from .about_you import ask_about_you_tool
from .cards import (
    ASKING,
    CHOICE_UI,
    DETAILS_UI,
    PASSAGE_UI,
    PRACTICE_UI,
    Card,
    placed,
)
from .choice import give_choice
from .context import LearnerContext
from .courses import propose_path_tool
from .decision import (
    WITHDRAWN,
    refused_beside_choice,
    withdraw_offers,
)
from .details import class_first, set_details_tool
from .passage import give_passage
from .practice import give_practice
from .reply import MAX_PATH_GOALS, Action, Outcome
from .skills.load import load_skill_for_turn
from .streaming import announce, announce_done
from .tools import (
    MAX_CHOSEN_SUBJECTS,
    add_topic_tool,
    calculate,
    change_subjects_tool,
    open_subject_tool,
    open_topic_tool,
    rebuild_plan_tool,
)
from .turn_policy import admit

Tool = Callable[..., "dict | Outcome"]


@dataclass(frozen=True)
class Turn:
    context: LearnerContext
    message: str
    # Skills already in effect: loading one again is told to use what it has.
    active_skills: tuple[str, ...] = ()

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
    # Whether an MCP host is offered the tool. One that needs the learner's situation is not: a
    # host has none to give it.
    listed: bool = True
    # What the tool offers once the learner's class is known, for tools that need it.
    after_class: str | None = None


def _as_is(tool: Tool) -> Callable[[Turn], Tool]:
    return lambda _turn: tool


def _for_context(build: Callable[[LearnerContext], Tool]) -> Callable[[Turn], Tool]:
    return lambda turn: build(turn.context)


TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec("calculate", _as_is(calculate)),
    ToolSpec("open_subject", _for_context(open_subject_tool)),
    ToolSpec("open_topic", lambda turn: open_topic_tool(turn.context, turn.message)),
    ToolSpec("add_topic", _for_context(add_topic_tool)),
    ToolSpec(
        "propose_path",
        _for_context(propose_path_tool),
        after_class="propose the course",
    ),
    ToolSpec(
        "change_subjects",
        _for_context(change_subjects_tool),
        after_class="add the subject",
    ),
    ToolSpec("rebuild_plan", _for_context(rebuild_plan_tool)),
    ToolSpec("give_practice", _as_is(give_practice), ui=PRACTICE_UI),
    ToolSpec("give_passage", _as_is(give_passage), ui=PASSAGE_UI),
    ToolSpec("give_choice", _as_is(give_choice), ui=CHOICE_UI),
    ToolSpec(
        "ask_about_you",
        _for_context(ask_about_you_tool),
        ui=DETAILS_UI,
        listed=False,
    ),
    ToolSpec("set_details", _for_context(set_details_tool)),
    ToolSpec("load_skill", lambda turn: load_skill_for_turn(turn.active_skills)),
)


@dataclass
class TurnOutputs:
    actions: list[Action] = field(default_factory=list)
    cards: list[Card] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    # Cards a question took the place of: never shown, but their answers stay unsaid.
    withheld: list[Card] = field(default_factory=list)


def _keep(outputs: TurnOutputs, result: Outcome, where: Where, room: int) -> dict:
    """Puts what the call did for the app among the turn's, and returns what the
    model reads. A question the learner must answer takes the place of every
    other offer in the turn, whichever call came first."""
    if waiting := refused_beside_choice(outputs.cards, result):
        if result.card is not None:
            outputs.withheld.append(result.card)
        return waiting
    told = admit(outputs.actions, result, room)
    if result.card is not None:
        outputs.cards.append(placed(result.card, where))
    if isinstance(result.card, ASKING):
        withdrew, taken = withdraw_offers(outputs.actions, outputs.cards)
        outputs.withheld.extend(taken)
        if withdrew:
            told = {**told, "withdrawn": WITHDRAWN}
    if result.skill is not None and result.skill not in outputs.skills:
        outputs.skills.append(result.skill)
    return told


def _for_model(
    tool: Tool,
    outputs: TurnOutputs,
    where: Where,
    room: int,
    refused: Callable[[], dict | None],
) -> Callable[..., dict]:
    """The tool as the model sees it: announced as it starts, and returning
    only its words, with what it did for the app kept in ``outputs``.
    ``refused`` is the reason the call is not made now, if there is one."""

    def kept(result: dict | Outcome) -> dict:
        return (
            _keep(outputs, result, where, room)
            if isinstance(result, Outcome)
            else result
        )

    if inspect.iscoroutinefunction(tool):

        @functools.wraps(tool)
        async def run_async(*args, **kwargs) -> dict:
            announce(tool.__name__)
            try:
                return refused() or kept(await tool(*args, **kwargs))
            finally:
                announce_done(tool.__name__)

        return run_async

    @functools.wraps(tool)
    def run(*args, **kwargs) -> dict:
        announce(tool.__name__)
        try:
            return refused() or kept(tool(*args, **kwargs))
        finally:
            announce_done(tool.__name__)

    return run


def tools_for(turn: Turn, outputs: TurnOutputs) -> list[Callable[..., dict]]:
    where = turn.where()
    # With the list not sent the room is not known: the app keeps to the most itself.
    room = (
        MAX_CHOSEN_SUBJECTS - len(turn.context.held_subjects())
        if turn.context.subjects
        else MAX_PATH_GOALS
    )
    return [
        _for_model(
            spec.build(turn), outputs, where, room, _class_gate(turn, outputs, spec)
        )
        for spec in TOOLS
    ]


def _class_gate(
    turn: Turn, outputs: TurnOutputs, spec: ToolSpec
) -> Callable[[], dict | None]:
    then = spec.after_class
    if then is None:
        return lambda: None
    return lambda: class_first(turn.context, outputs.actions, then)
