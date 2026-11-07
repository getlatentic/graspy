"""One topic of a held course as a lesson on it is written: its official objectives and the textbook passages
linked to it."""

from dataclasses import dataclass

from ....utils.slug import slugify


@dataclass(frozen=True)
class Objective:
    code: str
    statement: str


@dataclass(frozen=True)
class Passage:
    id: str
    role: str
    title: str
    chapter: str
    text: str


@dataclass(frozen=True)
class Textbook:
    """What the textbook's licence requires a lesson that uses it to say."""

    title: str
    publisher: str
    source_url: str
    licence: str
    licence_url: str
    attribution: str


@dataclass(frozen=True)
class Topic:
    code: str
    title: str
    objectives: tuple[Objective, ...]
    passages: tuple[Passage, ...]


def same_title(left: str, right: str) -> bool:
    return slugify(left) == slugify(right)


def read_topic(node: dict, passages: list[dict]) -> Topic:
    """A topic from its outline node and the passages the export chose for it."""
    return Topic(
        code=node["code"],
        title=node["title"],
        objectives=tuple(
            Objective(o["code"], o["statement"])
            for sub in node["subtopics"]
            for o in sub["objectives"]
        ),
        passages=tuple(
            Passage(p["id"], p["role"], p["title"], p["chapter"], p["text"])
            for p in passages
        ),
    )
