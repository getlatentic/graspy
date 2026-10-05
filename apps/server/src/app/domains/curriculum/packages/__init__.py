"""The curricula graspy holds: official editions, converted to an outline the API reads (see export.py).

A plan for a learner whose class and subject a held course covers takes its topics from that course, in its order,
and says where they come from; any other is written by a model and says so.
"""

from dataclasses import dataclass
from functools import cache

from ....utils.slug import slugify


@dataclass(frozen=True)
class Source:
    """Where a subject's topics come from, as the learner's plan records it."""

    package_id: str
    package_revision: int
    authority: str
    title: str
    edition: str

    def as_json(self) -> dict:
        return {
            "packageId": self.package_id,
            "packageRevision": self.package_revision,
            "authority": self.authority,
            "title": self.title,
            "edition": self.edition,
        }


@dataclass(frozen=True)
class Course:
    source: Source
    country: str
    subject: str
    aliases: frozenset[str]
    levels: frozenset[tuple[str, str]]
    themes: tuple[dict, ...]

    def topics(self) -> list[str]:
        """Every topic, theme by theme, in the curriculum's order."""
        return [topic["title"] for theme in self.themes for topic in theme["topics"]]

    def objectives(self) -> int:
        return sum(
            len(sub["objectives"])
            for theme in self.themes
            for topic in theme["topics"]
            for sub in topic["subtopics"]
        )

    def teaches(self, subject: str) -> bool:
        return slugify(subject) in self.aliases


def _course(outline: dict) -> Course:
    return Course(
        source=Source(
            package_id=outline["packageId"],
            package_revision=outline["packageRevision"],
            authority=outline["authority"],
            title=outline["courseTitle"],
            edition=outline["edition"],
        ),
        country=outline["country"],
        subject=outline["subject"],
        aliases=frozenset(slugify(alias) for alias in outline["aliases"]),
        levels=frozenset(
            (level["system"], level["level"]) for level in outline["levels"]
        ),
        themes=tuple(outline["themes"]),
    )


@cache
def courses() -> tuple[Course, ...]:
    # Imported here, not at the top: the Worker's startup snapshot has a size cap, and no outline is needed until a
    # plan or the coverage asks for one.
    from .outlines import OUTLINES

    return tuple(_course(outline) for outline in OUTLINES)


def held_course(system: str | None, level: str | None, subject: str) -> Course | None:
    """The held course for this class that teaches this subject, or None where graspy holds none."""
    if not system or not level:
        return None
    return next(
        (c for c in courses() if (system, level) in c.levels and c.teaches(subject)),
        None,
    )
