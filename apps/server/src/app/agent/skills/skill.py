"""A skill is a folder holding a SKILL.md: YAML frontmatter with a name and a
one-line description, then a Markdown body of teaching guidance."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# A body is read into the conversation whole, so it stays a page.
MAX_BODY_WORDS = 250
FENCE = "---"


@dataclass(frozen=True)
class Skill:
    name: str
    description: str
    body: str


def _split(text: str) -> tuple[dict[str, str], str]:
    lines = text.strip().splitlines()
    if not lines or lines[0].strip() != FENCE:
        raise ValueError("A SKILL.md starts with a --- frontmatter block.")
    try:
        end = next(n for n, line in enumerate(lines[1:], 1) if line.strip() == FENCE)
    except StopIteration:
        raise ValueError("The frontmatter of a SKILL.md is never closed.") from None
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        key, colon, value = line.partition(":")
        if colon:
            fields[key.strip()] = value.strip()
    return fields, "\n".join(lines[end + 1 :]).strip()


def parse(path: Path) -> Skill:
    """The skill a SKILL.md holds; one that breaks the format is an error."""
    fields, body = _split(path.read_text(encoding="utf-8"))
    name, description = fields.get("name", ""), fields.get("description", "")
    folder = path.parent.name
    if name != folder:
        raise ValueError(f"The skill in {folder}/ is named {name!r}.")
    if not description:
        raise ValueError(f"The skill {name} has no description.")
    if not body:
        raise ValueError(f"The skill {name} has no body.")
    if len(body.split()) > MAX_BODY_WORDS:
        raise ValueError(f"The skill {name} is over {MAX_BODY_WORDS} words.")
    return Skill(name=name, description=description, body=body)
