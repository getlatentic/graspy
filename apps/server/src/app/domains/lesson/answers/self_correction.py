"""A feedback text that corrects itself, as a model does when it notices its
own mistake mid-sentence: "Oops, the correct answer is actually 78". A
learner reads it as the app being unsure, and the key it sits beside is
usually the mistake. Shared by the lesson gate and the tutor's practice card."""

from __future__ import annotations

import re

# Said in a wrong-answer note, "Oops! Not quite" is friendly; said in the note
# for a right answer it is the model changing its mind.
_MILD = re.compile(
    r"""\b(?:
        oops|whoops|oop
      | wait\s*[-–—,.:!]
      | sorry
      | actually,?\s+(?:the\s+)?(?:correct|right|real|answer)
    )""",
    re.IGNORECASE | re.VERBOSE,
)
_MARKERS = re.compile(
    r"""\b(?:
        typo
      | my\ mistake
      | i\ made\ an?\ (?:mistake|error|typo)
      | mistake\ in\ the\ options?
      | correction\s*:
      | however,?\ the\ (?:answer|correct|options?)
      | intended\ (?:interpretation|answer)
      | answer\ index
    )""",
    re.IGNORECASE | re.VERBOSE,
)


def self_correction(text: str, right_answer: bool = True) -> str | None:
    """The words in ``text`` that correct what it said before, or None.
    ``right_answer`` is whether it is the note shown for a right answer."""
    found = _MARKERS.search(text) or (right_answer and _MILD.search(text))
    return found.group().strip() if found else None
