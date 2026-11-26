"""One decision at a time. A reply that asks the learner to tap an answer asks
only that: an offer to add a course, a button to open a lesson or a set of
questions waits until they have answered. Whichever tool call comes second, the
choice stays and the rest of the turn's offers are not shown; the call that
could not be shown is told, so the model asks again in its next turn."""

from __future__ import annotations

from .cards import ASKING, Card, DetailsCard
from .refusal import refusal
from .reply import Action, OpenSubject, OpenTopic, Outcome, ProposePath, RebuildPlan

# Actions that put something in front of the learner to decide on or press.
OFFERS = (ProposePath, OpenTopic, OpenSubject, RebuildPlan)

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
    """The refusal for an offer made after a question was asked. The form is the
    whole of its turn: not even a second question joins it."""
    if not (asks_choice(cards) and offers(result)):
        return None
    joins = isinstance(result.card, ASKING) and not _asks_form(cards)
    return None if joins else refusal(WAITING)


def withdraw_offers(
    actions: list[Action], cards: list[Card]
) -> tuple[bool, list[Card]]:
    """Takes the offers out of the turn's actions and cards, in place, once a
    question is asked. Returns whether any was taken, and the cards among them.
    A form takes the place of every other question too."""
    stay = DetailsCard if _asks_form(cards) else ASKING
    taken = [card for card in cards if not isinstance(card, stay)]
    kept = [action for action in actions if not isinstance(action, OFFERS)]
    withdrew = bool(taken) or len(kept) != len(actions)
    cards[:] = [card for card in cards if isinstance(card, stay)]
    actions[:] = kept
    return withdrew, taken
