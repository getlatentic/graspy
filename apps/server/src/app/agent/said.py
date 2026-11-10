"""What the learner and the app have told the tutor: the words a personal detail
in a reply is held against."""

from __future__ import annotations

from dataclasses import dataclass

# The most of the earlier messages the judge reads.
EARLIER_CHARS = 1200


@dataclass(frozen=True)
class Said:
    message: str
    learner: str
    earlier: str = ""

    @property
    def text(self) -> str:
        """Everything said, for a detail to be found in."""
        return f"{self.message}\n{self.learner}\n{self.earlier}"


def said_by(
    message: str, learner: str, app: str, studying: str, earlier: list[str]
) -> Said:
    """The learner's side only, newest first: what the tutor itself wrote
    earlier is not a source for a detail."""
    kept = "\n".join([*earlier, app, studying])
    return Said(message=message, learner=learner, earlier=kept[:EARLIER_CHARS])
