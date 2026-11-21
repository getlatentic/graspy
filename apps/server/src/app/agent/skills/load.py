"""The tutor's load_skill tool, one per turn."""

from __future__ import annotations

from collections.abc import Callable

from .registry import skills

# A name the model got wrong is echoed back, never at any length.
MAX_NAME_ECHO = 40


def load_skill_for_turn() -> Callable[[str], dict]:
    """A skill's text is read once in a turn: asking again is told to use what
    it has, so a loop of loads does not spend the turn's steps."""
    loaded: set[str] = set()

    def load_skill(name: str) -> dict:
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
            return {"skill": skill.name, "note": "Already loaded in this turn: use it."}
        loaded.add(skill.name)
        return {"skill": skill.name, "guidance": skill.body}

    return load_skill
