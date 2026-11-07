"""The lesson prompts for a topic of a held curriculum: each is its prompt from prompts.py with the topic's official
objectives and the textbook passages linked to it as inputs. A topic a model planned is asked with the prompts
unchanged."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import dspy

from ...education.route import named
from ..curriculum.packages import Source, held_course
from ..curriculum.packages.topic import Passage, Textbook, Topic
from .lesson import (
    CitedObjective,
    CitedPassage,
    CitedTextbook,
    LessonGrounding,
)

Part = Literal["plan", "slide", "practice"]

ROLE_LABEL = {
    "instruction": "Textbook",
    "worked_example": "Worked example",
    "foundation": "Earlier work this topic builds on",
    "exercise": "Textbook exercise",
}
NO_PASSAGES = (
    "No textbook passage is linked to this topic: write from the objectives alone."
)

_BASE_NOTE = (
    "Write from `curriculum_objectives`, the official objectives for this topic, and "
    "`source_passages`, the class's textbook on it: teach what the objectives name, "
    "with the facts and methods of the passages, and nothing beyond them. The passages "
    "write mathematics between dollar signs; write yours as the notation rules say. "
    "Never mention the objectives or the passages: the lesson cites them itself."
)
_PART_NOTE = {
    "plan": " The slides together cover every objective.",
    "slide": "",
    "practice": (
        " Do not copy a textbook exercise: write a new question of the same kind, "
        "on an objective."
    ),
}
_FIELDS = (
    (
        "curriculum_objectives",
        "The official objectives for this topic, one per line",
    ),
    ("source_passages", "Textbook passages on this topic, each with its title"),
)


def for_topic(signature: type[dspy.Signature], part: Part) -> type[dspy.Signature]:
    """The signature with the topic's objectives and passages as inputs, and told to write from them."""
    for name, desc in _FIELDS:
        signature = signature.append(name, dspy.InputField(desc=desc), str)
    note = _BASE_NOTE + _PART_NOTE[part]
    return signature.with_instructions(f"{signature.instructions}\n\n{note}")


def _passage_block(passage: Passage) -> str:
    return f"[{ROLE_LABEL[passage.role]}: {passage.title}]\n{passage.text}"


@dataclass(frozen=True)
class Grounding:
    """What a lesson on a held topic is written from, and what it says it was written from."""

    source: Source
    textbook: Textbook | None
    topic: Topic

    def inputs(self) -> dict[str, str]:
        passages = "\n\n".join(_passage_block(p) for p in self.topic.passages)
        return {
            "curriculum_objectives": "\n".join(
                f"- {o.statement}" for o in self.topic.objectives
            ),
            "source_passages": passages or NO_PASSAGES,
        }

    def cited(self) -> LessonGrounding:
        """What the learner is shown the lesson was written from."""
        return LessonGrounding(
            authority=self.source.authority,
            edition=self.source.edition,
            objectives=[
                CitedObjective(code=o.code, statement=o.statement)
                for o in self.topic.objectives
            ],
            passages=[
                CitedPassage(id=p.id, title=p.title, chapter=p.chapter)
                for p in self.topic.passages
            ],
            textbook=_cited_textbook(self.textbook)
            if self.textbook and self.topic.passages
            else None,
        )


def _cited_textbook(textbook: Textbook) -> CitedTextbook:
    return CitedTextbook(
        title=textbook.title,
        source_url=textbook.source_url,
        licence=textbook.licence,
        licence_url=textbook.licence_url,
        attribution=textbook.attribution,
    )


def grounding_for(grade_level: str, subject: str, topic: str) -> Grounding | None:
    """The grounding of a topic of a held course for the class a request names; None for a class the catalogue
    cannot place, a subject no held course teaches, or a topic it does not list."""
    found = named(grade_level)
    if found is None:
        return None
    system, level = found
    course = held_course(system.id, level.id, subject)
    held = course.topic(topic) if course else None
    if course is None or held is None:
        return None
    return Grounding(course.source, course.textbook, held)
