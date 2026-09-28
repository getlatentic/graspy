"""What a lesson's questions and parts must be, checked in code: whether the
option marked right is right, where the answer can be worked out from the
question (the server's own answer checks, domains/lesson/answers/), and
whether each question and the lesson are whole."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.agent.choices import plain
from app.domains.lesson.answers.maths_text import plain_maths
from app.domains.lesson.answers.tokens import numbers_in
from app.domains.lesson.answers.verdict import Found, verdict
from app.domains.lesson.answers.written import Written, written

# A list marker the learner sees, as "- 0.875" shows it.
_SHOWN_MARKER = re.compile(r"^\s*(?:[-*•]|[A-Da-d][).])\s+")


def _words(text: str) -> set[str]:
    """Its longer words and its numbers: an option such as "5/8 = 0.625 and
    0.6 = 3/5" has no long words at all."""
    return set(re.findall(r"[a-z]{4,}|\d+(?:\.\d+)?(?:[/⁄]\d+)?", text.lower()))


def _equal(a: Written | None, b: Written | None) -> bool:
    return a is not None and b is not None and a.value == b.value


@dataclass(frozen=True)
class Question:
    where: str
    question: str
    options: list[str]
    answer_index: int
    correct_feedback: str

    def verdict(self) -> Found:
        if not self.in_range():
            return Found.NOT_COMPUTABLE
        return verdict(self.question, self.options, self.answer_index).found

    def in_range(self) -> bool:
        return 0 <= self.answer_index < len(self.options)

    def problems(self) -> list[str]:
        found = []
        if len(self.options) != 4:
            found.append(f"{len(self.options)} options, not four")
        if any(not plain(option) for option in self.options):
            found.append("an empty option")
        if any(_SHOWN_MARKER.match(option) for option in self.options):
            found.append("an option shown with a list marker")
        if self._duplicated():
            found.append("the same answer twice")
        if not self.in_range():
            found.append("no option marked right")
        elif not self.feedback_names_answer():
            found.append("feedback does not name the answer")
        return found

    def _duplicated(self) -> bool:
        seen: list[tuple[str, Written | None]] = []
        for option in self.options:
            text = plain(_SHOWN_MARKER.sub("", plain_maths(option)))
            value = written(option)
            if any(text == other or _equal(value, v) for other, v in seen):
                return True
            seen.append((text, value))
        return False

    def feedback_names_answer(self) -> bool:
        """By its number, its words, or half its longer words: feedback on a
        sentence-long option says it again in its own words."""
        marked = _SHOWN_MARKER.sub("", plain_maths(self.options[self.answer_index]))
        feedback = plain_maths(self.correct_feedback)
        value = written(marked)
        if value is not None:
            return any(number.value == value.value for number in numbers_in(feedback))
        if plain(marked) in plain(feedback):
            return True
        wanted = _words(marked)
        return bool(wanted) and len(wanted & _words(feedback)) >= len(wanted) / 2


def questions(lesson: dict) -> list[Question]:
    """Every slide's check and the practice question, from the lesson as the
    app receives it."""
    found = [
        Question(
            f"slide {number}",
            slide["assessment"]["prompt"],
            slide["assessment"]["options"],
            slide["assessment"]["answerIndex"],
            slide["assessment"].get("correctFeedback", ""),
        )
        for number, slide in enumerate(lesson["slides"], 1)
        if slide["assessment"]
    ]
    practice = lesson.get("practice")
    if practice:
        found.append(
            Question(
                "practice",
                practice["question"],
                practice["options"],
                practice["answerIndex"],
                practice["correctFeedback"],
            )
        )
    return found


def missing_parts(lesson: dict) -> list[str]:
    slides = lesson["slides"]
    missing = []
    if not lesson.get("objectives"):
        missing.append("objectives")
    if not any(
        slide["slideType"] == "worked_example" or "example" in slide["bodyMd"].lower()
        for slide in slides
    ):
        missing.append("a worked example")
    if not slides or any(
        not slide["assessment"]
        or not slide["assessment"]["prompt"].strip()
        or len(slide["assessment"]["options"]) < 2
        for slide in slides
    ):
        missing.append("a check on every slide")
    if not lesson.get("practice"):
        missing.append("a practice question")
    return missing
