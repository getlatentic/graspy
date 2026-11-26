"""One decision at a time. A reply that asks the learner to tap an answer asks
only that: a path to choose topics of, a button to open a lesson or a set of
questions waits until they have answered. Whichever tool call comes second, the
choice stays and the rest of the turn's offers are not shown; the call that
could not be shown is told, so the model asks again in its next turn."""

from __future__ import annotations

from .cards import ASKING, Card, ChoiceCard, DetailsCard
from .refusal import refusal
from .reply import Action, OpenSubject, OpenTopic, Outcome, RebuildPlan

# Actions that put something in front of the learner to decide on or press.
OFFERS = (OpenTopic, OpenSubject, RebuildPlan)

WAITING = (
    "The learner is being asked a question below, and nothing else is shown until "
    "they answer it. Ask for this in your next message"
)
WITHDRAWN = (
    "The app is showing the learner this question and not what you offered earlier "
    "in this turn: it is not shown. Never say it is ready or below. Offer it in your "
    "next message, once they have answered"
)


def asks_choice(cards: list[Card]) -> bool:
    return any(isinstance(card, ASKING) for card in cards)


def _asks_form(cards: list[Card]) -> bool:
    return any(isinstance(card, DetailsCard) for card in cards)


def offers(result: Outcome) -> bool:
    """Whether the call puts a card or an offer in front of the learner."""
    return result.card is not None or any(
        isinstance(action, OFFERS) for action in result.actions
    )


def refused_beside_choice(cards: list[Card], result: Outcome) -> dict | None:
    """The refusal for an offer made after a question was asked. A choice or the form is itself a
    question and takes the place of the others; the form is the whole of its turn, so nothing
    joins it, and a path waits for the answer."""
    if not (asks_choice(cards) and offers(result)):
        return None
    joins = isinstance(result.card, ChoiceCard | DetailsCard) and not _asks_form(cards)
    return None if joins else refusal(WAITING)


def withdraw_offers(
    actions: list[Action], cards: list[Card]
) -> tuple[bool, list[Card]]:
    """Takes the offers out of the turn's actions and cards, in place, once a
    question is asked, the last card. Returns whether any was taken, and the cards among them.
    Only cards of the question's own kind stay with it, so a form takes the place of every other
    question too, and a choice takes the place of a path."""
    stay = type(cards[-1]) if cards else ASKING
    taken = [card for card in cards if not isinstance(card, stay)]
    kept = [action for action in actions if not isinstance(action, OFFERS)]
    withdrew = bool(taken) or len(kept) != len(actions)
    cards[:] = [card for card in cards if isinstance(card, stay)]
    actions[:] = kept
    return withdrew, taken
