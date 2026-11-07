"""The answer as the learner reads it: each sentence is judged by
answer_rules before it is sent, and one that breaks a rule is dropped. What is
sent is the answer the turn returns and remembers."""

from __future__ import annotations

import re

from .answer_rules import Breach, Facts, breach_in
from .toolkit import TurnOutputs

# What the learner reads when every sentence of the answer was dropped.
CARD_INTRO = "Your questions are below."
STILL_UNMARKED = "The app marks answers, not me: try it in a practice question."
MARKED_RIGHT = "That is right."
MARKED_WRONG = "That is not right yet."
NOTHING_CHANGED = "Nothing has been changed."

_END = re.compile(r"(?<=[.!?])\s+|\n+")


def _fallback(breach: Breach, verdicts: tuple[bool, ...]) -> str:
    if breach is Breach.CARD:
        return CARD_INTRO
    if breach is Breach.CLAIM:
        return NOTHING_CHANGED
    if not verdicts:
        return STILL_UNMARKED
    return MARKED_RIGHT if all(verdicts) else MARKED_WRONG


class AnswerGate:
    """Chunks go in; whole sentences that keep the rules come out. The turn's
    outputs are read when a sentence is judged, after its tools have run."""

    def __init__(self, outputs: TurnOutputs, verdicts: tuple[bool, ...]) -> None:
        self._outputs = outputs
        self._verdicts = verdicts
        self._pending = ""
        self._sent: list[str] = []
        self._first_breach: Breach | None = None
        self.fed = False
        # What the model wrote, and the rules its sentences broke, for the log and for measuring.
        self.raw = ""
        self.breaches: list[Breach] = []

    def feed(self, chunk: str) -> str:
        """The sentences the chunk completed, as far as they keep the rules."""
        self.fed = True
        self.raw += chunk
        self._pending += chunk
        sent, start = [], 0
        for end in _END.finditer(self._pending):
            sent.append(self._judged(self._pending[start : end.end()]))
            start = end.end()
        self._pending = self._pending[start:]
        return self._keep("".join(sent))

    def finish(self) -> str:
        """The last sentence, which no space followed; and, when every sentence
        was dropped, the line that stands in for the answer."""
        rest, self._pending = self._pending, ""
        tail = self._keep(self._judged(rest)) if rest else ""
        if self._first_breach is None or self.answer():
            return tail
        return tail + self._keep(_fallback(self._first_breach, self._verdicts))

    def answer(self) -> str:
        return "".join(self._sent).strip()

    def _judged(self, sentence: str) -> str:
        breach = breach_in(sentence, self._facts())
        if breach is None:
            return sentence
        self._first_breach = self._first_breach or breach
        self.breaches.append(breach)
        return ""

    def _keep(self, text: str) -> str:
        self._sent.append(text)
        return text

    def _facts(self) -> Facts:
        # Of two cards in one turn the last counts, as in the reply.
        cards = self._outputs.cards[-1:]
        return Facts(
            verdicts=self._verdicts,
            questions=tuple(
                question
                for card in cards
                for question in card.tool_result.structured_content.questions
            ),
            acted=bool(self._outputs.actions),
        )
