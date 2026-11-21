"""The tutor's load_skill tool."""

from __future__ import annotations

from ..refusal import refusal
from .registry import skills


def load_skill(name: str) -> dict:
    """Load a teaching method to follow in this answer.

    Args:
        name: The skill's name, exactly as listed under Teaching methods.
    """
    skill = skills().get(name.strip())
    if skill is None:
        listed = ", ".join(skills())
        return refusal(f"There is no skill named {name!r}. The skills are: {listed}")
    return {"skill": skill.name, "guidance": skill.body}
