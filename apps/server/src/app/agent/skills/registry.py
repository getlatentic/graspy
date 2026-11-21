"""The skills we ship, read from the SKILL.md files beside this module (the
Worker uploads them by the rule in wrangler.jsonc), and what the tutor is told
of them."""

from __future__ import annotations

from functools import cache
from pathlib import Path

from .skill import Skill, parse

SKILLS_DIR = Path(__file__).parent


@cache
def skills() -> dict[str, Skill]:
    """Built on first use: Worker startup must not read files."""
    found = [parse(path) for path in sorted(SKILLS_DIR.glob("*/SKILL.md"))]
    return {skill.name: skill for skill in found}


def catalogue() -> str:
    """For the tutor's instructions: each skill's name and description."""
    lines = [f"- {skill.name}: {skill.description}" for skill in skills().values()]
    return (
        "Teaching methods. When the situation matches one, call load_skill with "
        "its name before you answer, then follow it. Most messages match none: "
        "answer those directly.\n" + "\n".join(lines)
    )
