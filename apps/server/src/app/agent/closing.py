"""What a turn owes the learner at its end, and what it is told of what they did: the form or the
lesson the model left out, the app's word of the learner's taps and choices, and what it can make."""

from __future__ import annotations

from dataclasses import dataclass

import dspy

from ..caller import Caller
from ..learner.answers import PracticeAnswer
from .about_you import DEFAULT_LINE, form_card, lacks_class
from .answer_gate import verdicts_in
from .app_tools import AppCall, describe_calls
from .cards import Card, placed
from .decision import withdraw_offers
from .lesson_start import NOT_MADE, lacks_start, owed_start
from .memory import Exchange
from .path_answer import describe_added
from .reply import AddPaths
from .toolkit import Turn, TurnOutputs
from .workshop import GenerationBudget, PathPlanner, Workshop

NO_APP_CALLS = "None: the learner did nothing in the app with this message."


@dataclass(frozen=True)
class Answered:
    prediction: dspy.Prediction
    outputs: TurnOutputs
    answer: str
    # Ended by the safety check, which nothing else of the turn is added to.
    stopped: bool = False


async def owed(answered: Answered, turn: Turn) -> tuple[str, list[Card]]:
    """The turn's answer and its one card, the last of the turn's (of two cards in one turn the
    last counts), with the card the learner is owed when the model left it out: the form for a
    learner whose class is not known, the lesson for the topics they just added."""
    context, answer = turn.context, answered.answer
    cards = answered.outputs.cards[-1:]
    actions = answered.outputs.actions
    if answered.stopped:
        return answer, cards
    if context.forms_due and lacks_class(context, cards, actions):
        # The form is the whole of its turn: whatever else was accepted is withdrawn.
        cards = [form_card(context)]
        withdraw_offers(actions, cards)
        return answer.strip() or DEFAULT_LINE, cards
    if turn.added and lacks_start(turn.added, cards):
        started = await owed_start(turn.context, turn.added, turn.workshop)
        if started is None:
            return NOT_MADE, cards
        return answer, [placed(started, turn.where())]
    return answer, cards


def verdicts_of(
    calls: list[AppCall] | None, earlier: tuple[Exchange, ...]
) -> tuple[bool, ...]:
    """A tap marked in this turn; or the last one, when the learner asks about it next."""
    return tuple(
        call.arguments.correct
        for call in calls or []
        if isinstance(call.arguments, PracticeAnswer)
    ) or verdicts_in(earlier[-1].get("app", "") if earlier else "")


def workshop_for(
    paths: PathPlanner, caller: Caller | None, budget: GenerationBudget | None
) -> Workshop | None:
    """What the turn can plan and make, for the learner it is for; none for a turn with no one."""
    if caller is None:
        return None
    return Workshop(paths, caller, budget or GenerationBudget(None, ""))


def app_told(calls: list[AppCall] | None, added: AddPaths | None) -> str:
    """What the learner did in the app with their message: the cards' taps, and a path card's answer."""
    told = [describe_calls(calls)] if calls else []
    if added:
        told.append(describe_added(added))
    return "\n\n".join(told) or NO_APP_CALLS
