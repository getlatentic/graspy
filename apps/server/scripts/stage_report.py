"""The table of a stage-writing measurement: reading level, and whether each
lesson's questions are right and whole, per learner and run, scored from the
texts and lessons each run kept so every run is scored alike."""

from __future__ import annotations

import statistics
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Protocol

from lesson_checks import missing_parts, questions
from reading_level import reading_level

HEADING = (
    "| Learner | Run | Lesson words/sentence | "
    "Lesson syllables/word | Lesson over limit | Tutor words/sentence | "
    "Tutor syllables/word | Tutor over limit | "
    "Persona names stage | Answers worked out: right/wrong/unmatched | "
    "Malformed questions | Lessons missing a part | Whole lessons | "
    "Failed draws |"
)


class Learner(Protocol):
    name: str

    @property
    def limit(self) -> int | None: ...

    @property
    def school(self) -> str | None: ...


def _spread(values: list[float], scale: float = 1.0) -> str:
    if not values:
        return "-"
    mean = statistics.fmean(values) * scale
    sd = statistics.stdev(values) * scale if len(values) > 1 else 0.0
    return f"{mean:.1f} ± {sd:.1f}"


def _reading(done: list[dict], part: str, limit: int | None) -> list[str]:
    levels = [reading_level(r["texts"][part], limit) for r in done]
    over = [level.over_limit for level in levels if level.over_limit is not None]
    return [
        _spread([level.words_per_sentence for level in levels]),
        _spread([level.syllables_per_word for level in levels]),
        _spread(over, 100) + " %" if over else "-",
    ]


def _content(done: list[dict]) -> list[str]:
    asked = [q for r in done for q in questions(r["lesson_wire"])]
    verdicts = Counter(q.verdict() for q in asked)
    malformed = sum(bool(q.problems()) for q in asked)
    missing = sum(bool(missing_parts(r["lesson_wire"])) for r in done)
    return [
        f"{verdicts['right']}/{verdicts['wrong']}/{verdicts['unmatched']}",
        f"{malformed}/{len(asked)}",
        f"{missing}/{len(done)}",
    ]


def _row(learner: Learner, run: str, mine: list[dict]) -> str:
    done = [r for r in mine if not r["error"]]
    named = sum(r["persona_names_stage"] for r in done)
    cells = [
        learner.name,
        run,
        *_reading(done, "lesson", learner.limit),
        *_reading(done, "tutor", learner.limit),
        f"{named}/{len(done)}" if learner.school else "n/a",
        *_content(done),
        f"{sum(r['lesson_complete'] for r in done)}/{len(done)}",
        str(len(mine) - len(done)),
    ]
    return "| " + " | ".join(cells) + " |"


def _findings(run: str, records: list[dict]) -> Iterable[str]:
    """Each defect, to be read: a check in code can misjudge a question."""
    for r in records:
        if r["error"]:
            continue
        where = f"{run} {r['learner']} draw {r['draw']}"
        for part in missing_parts(r["lesson_wire"]):
            yield f"- {where}: lesson has no {part}"
        for q in questions(r["lesson_wire"]):
            verdict = q.verdict()
            if verdict in ("wrong", "unmatched"):
                yield (
                    f"- {where}, {q.where}: answer {verdict}: {q.question!r} "
                    f"marked {q.options[q.answer_index]!r} of {q.options}"
                )
            for problem in q.problems():
                yield f"- {where}, {q.where}: {problem}: {q.question!r} {q.options}"


def report(paths: list[Path], learners: list[Learner], load) -> None:
    runs = {path.stem: load(path) for path in paths}
    print(HEADING)
    print("|---" * (HEADING.count("|") - 1) + "|")
    for learner in learners:
        for run, records in runs.items():
            print(
                _row(learner, run, [r for r in records if r["learner"] == learner.name])
            )
    print("\nDefects found:")
    for run, records in runs.items():
        for line in _findings(run, records):
            print(line)
