"""The skills we ship, read from the SKILL.md files beside this module (the
Worker uploads them by the rule in wrangler.jsonc), and what the tutor is told
of them."""

from __future__ import annotations

import logging
from functools import cache
from pathlib import Path

from .skill import Skill, parse

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).parent


def read_all(folder: Path) -> dict[str, Skill]:
    """A file that breaks the format is logged and left out, so one bad skill
    never stops a turn; the tests parse every file strictly."""
    found: dict[str, Skill] = {}
    for path in sorted(folder.glob("*/SKILL.md")):
        try:
            skill = parse(path)
        except ValueError as error:
            logger.error("A skill is left out: %s", error)
            continue
        found[skill.name] = skill
    return found


@cache
def skills() -> dict[str, Skill]:
    """Built on first use: Worker startup must not read files."""
    return read_all(SKILLS_DIR)


def catalogue() -> str:
    """For the tutor's instructions: each skill's name and description."""
    lines = [f"- {skill.name}: {skill.description}" for skill in skills().values()]
    return (
        "Teaching methods. When the situation matches one, call load_skill with "
        "its name before you answer, then follow it. A skill you loaded in the last "
        "few turns is shown to you under skills in effect: follow it there and "
        "do not load it again. Most messages match none: answer those directly.\n"
        + "\n".join(lines)
    )
