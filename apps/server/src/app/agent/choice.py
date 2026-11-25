"""A question with a few answers to tap, as a card: the learner picks one
instead of typing, or takes the card's way back to typing."""

from __future__ import annotations

import uuid

from .cards import Choice, ChoiceCard, ChoiceResult, ResultMeta, TextContent
from .choices import clean
from .refusal import refusal
from .reply import Outcome

MIN_CHOICES = 2
MAX_CHOICES = 4
MAX_QUESTION = 160
MAX_OPTION = 40


def give_choice(question: str, options: list[str]) -> dict | Outcome:
    """Ask the learner a short question with two to four answers they tap, in
    their language. Use it for a confirmation or a choice between a few clear
    alternatives, such as which of two courses they mean. Never for a question
    with an open answer, such as what they want to learn: ask that in words.
    The card always lets them type another answer instead, so never list
    "other". Their tap arrives as their next message.

    Args:
        question: One short question, e.g. "Which class are you in?".
        options: Two to four different answers, each a word or a few words.
    """
    asked = clean(question, MAX_QUESTION)
    cleaned = (clean(option, MAX_OPTION) for option in options)
    shown = list(dict.fromkeys(option for option in cleaned if option))
    if not asked:
        return refusal("The choice needs a question.")
    if not MIN_CHOICES <= len(shown) <= MAX_CHOICES:
        return refusal(
            f"A choice needs {MIN_CHOICES} to {MAX_CHOICES} different answers, "
            f"and this has {len(shown)}. Ask in words instead when there are more."
        )
    return shown_card(asked, shown)


def shown_card(question: str, options: list[str]) -> Outcome:
    """The card for a question and any number of answers."""
    content = Choice(question=question, options=options)
    return Outcome(
        told={
            "done": "The app shows the learner this question as a card below your "
            "answer, with the answers to tap. Write only a short lead-in, never the "
            "question or its answers again, and wait for their reply."
        },
        card=ChoiceCard(
            tool_input={"question": question, "options": options},
            tool_result=ChoiceResult(
                content=[TextContent(text=content.describe())],
                structured_content=content,
                meta=ResultMeta(view_uuid=uuid.uuid4().hex),
            ),
        ),
    )
