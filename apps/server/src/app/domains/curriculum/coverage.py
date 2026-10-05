"""Which classes and subjects graspy has curriculum for, computed from what it holds, so it cannot go stale.

A class and subject has a held curriculum when an official edition of it is converted and in packages/. A voice
lesson says where in the national curriculum it comes from by quoting an edition ("cited"), or does not
("ungrounded"); none yet quotes a held edition, since graspy holds none for the classes they are written for.
"""

from collections import Counter
from dataclasses import dataclass, field

from ...voice.curriculum import load_plans
from .packages import Source, courses

# The voice lessons are written for Nigeria's classes, named as the catalogue's with an underscore.
VOICE_SYSTEM = "NG"
CITED = {"nerdc", "scheme-of-work"}


@dataclass
class Row:
    system: str
    level: str
    subject: str
    curriculum: Source | None = None
    topics: int = 0
    objectives: int = 0
    voice: Counter = field(default_factory=Counter)

    def as_json(self) -> dict:
        return {
            "system": self.system,
            "level": self.level,
            "subject": self.subject,
            "curriculum": self.curriculum.as_json() if self.curriculum else None,
            "topics": self.topics,
            "objectives": self.objectives,
            "voiceLessons": {
                kind: self.voice[kind] for kind in ("cited", "ungrounded")
            },
        }


def _voice_grounding(source: str | None) -> str:
    return "cited" if source in CITED else "ungrounded"


def coverage() -> list[dict]:
    rows: dict[tuple[str, str, str], Row] = {}

    def row(system: str, level: str, subject: str) -> Row:
        return rows.setdefault((system, level, subject), Row(system, level, subject))

    for course in courses():
        for system, level in course.levels:
            held = row(system, level, course.subject)
            held.curriculum, held.topics, held.objectives = (
                course.source,
                len(course.topics()),
                course.objectives(),
            )
    for plan in load_plans().values():
        for voice_class in plan.classes:
            row(VOICE_SYSTEM, voice_class.replace("_", "-"), plan.subject).voice[
                _voice_grounding(plan.curriculum.source if plan.curriculum else None)
            ] += 1
    return [rows[key].as_json() for key in sorted(rows)]
