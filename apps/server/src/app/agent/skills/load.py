"""The tutor's load_skill tool, one per turn."""

from __future__ import annotations

from collections.abc import Callable, Iterable

from ..reply import Outcome
from .registry import skills

# A name the model got wrong is echoed back, never at any length.
MAX_NAME_ECHO = 40


def load_skill_for_turn(
    in_effect: Iterable[str] = (),
) -> Callable[[str], dict | Outcome]:
    """A skill's text is read once in a turn, and not at all when it is already
    in effect: asking again is told to use what it has, so a loop of loads does
    not spend the turn's steps. A skill loaded in this turn is stamped as new;
    one carried from earlier keeps its age, so asking for it again does not
    send a stepped skill back to its first step."""
    carried = frozenset(in_effect)
    loaded: set[str] = set(carried)

    def load_skill(name: str) -> dict | Outcome:
        """Load a teaching method to follow in this answer.

        Args:
            name: The skill's name, exactly as listed under Teaching methods.
        """
        known = skills()
        skill = known.get(name.strip())
        if skill is None:
            shown = name.strip()[:MAX_NAME_ECHO]
            return {
                "error": f"There is no skill named {shown!r}. "
                f"The skills are: {', '.join(known)}."
            }
        if skill.name in loaded:
            told = {"skill": skill.name, "note": "Already in effect: use it."}
            return Outcome(told, skill=None if skill.name in carried else skill.name)
        loaded.add(skill.name)
        return Outcome(
            {"skill": skill.name, "guidance": skill.for_turn(1)}, skill=skill.name
        )

    return load_skill
