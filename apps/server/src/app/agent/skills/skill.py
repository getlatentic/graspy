"""A skill is a folder holding a SKILL.md: YAML frontmatter with a name and a
one-line description, then a Markdown body of teaching guidance. Only the
plain ``key: value`` lines of YAML are read; anything else is an error that
names the file."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

# A body is read into the conversation whole, so it stays a page.
MAX_BODY_WORDS = 250
# A description is in every prompt, so it stays a line.
MAX_DESCRIPTION_WORDS = 40
FENCE = "---"
BLOCK_SCALAR = re.compile(r"^[>|][+-]?\d?$")
QUOTES = "'\""


@dataclass(frozen=True)
class Skill:
    name: str
    description: str
    body: str


def _unquoted(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in QUOTES:
        return value[1:-1].strip()
    return value


def _field(line: str, where: str) -> tuple[str, str]:
    key, colon, value = line.partition(":")
    if not colon or not key.strip() or key[0].isspace():
        raise ValueError(f"{where}: the frontmatter line {line!r} is not key: value.")
    value = value.strip()
    if BLOCK_SCALAR.match(value):
        raise ValueError(
            f"{where}: {key.strip()} is a block scalar; write it on one line."
        )
    return key.strip(), _unquoted(value)


def _split(text: str, where: str) -> tuple[dict[str, str], str]:
    lines = text.strip().splitlines()
    if not lines or lines[0].strip() != FENCE:
        raise ValueError(f"{where}: no --- frontmatter block at the start.")
    try:
        end = next(n for n, line in enumerate(lines[1:], 1) if line.strip() == FENCE)
    except StopIteration:
        raise ValueError(f"{where}: the frontmatter is never closed.") from None
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = _field(line, where)
        if key in fields:
            raise ValueError(f"{where}: {key} is given twice.")
        fields[key] = value
    return fields, "\n".join(lines[end + 1 :]).strip()


def parse(path: Path) -> Skill:
    """The skill a SKILL.md holds; one that breaks the format is a ValueError
    naming the file."""
    folder = path.parent.name
    where = f"{folder}/{path.name}"
    # utf-8-sig drops the byte order mark some editors write.
    fields, body = _split(path.read_text(encoding="utf-8-sig"), where)
    name, description = fields.get("name", ""), fields.get("description", "")
    if name != folder:
        raise ValueError(f"{where}: the skill is named {name!r}, not {folder!r}.")
    if not description:
        raise ValueError(f"{where}: no description.")
    if len(description.split()) > MAX_DESCRIPTION_WORDS:
        raise ValueError(f"{where}: description is over {MAX_DESCRIPTION_WORDS} words.")
    if not body:
        raise ValueError(f"{where}: no body.")
    if len(body.split()) > MAX_BODY_WORDS:
        raise ValueError(f"{where}: body is over {MAX_BODY_WORDS} words.")
    return Skill(name=name, description=description, body=body)
