"""Run saved lessons through the answer gate as it is now and count what it
catches of the wrong marked answers found by hand.

    uv run python scripts/answer_gate_replay.py LESSONS.json.gz \
        --wrong ../../docs/baselines/answer-gate/wrong-marked.json [--show]

LESSONS is the grounding study's lessons.json.gz (docs/GROUNDING_STUDY.md):
a list of {topic, arm, draw, lesson_wire}. --wrong is the hand-classified list
of wrong marked answers, each by topic, arm, draw and where ("s3" is the third
slide's check). Every check the gate repairs or refuses is printed with the
question, to be read by hand: one the list does not name is a false refusal
until read otherwise."""

from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

from app.domains.lesson.answers.repair import Check
from app.domains.lesson.answers.verdict import Found
from app.domains.lesson.checked import _judgement


def _checks(lesson: dict) -> list[tuple[str, Check]]:
    wire = lesson.get("lesson_wire")
    if not wire:
        return []
    parts = [
        (f"s{at}", slide["assessment"])
        for at, slide in enumerate(wire["slides"], 1)
        if slide.get("assessment")
    ]
    if wire.get("practice"):
        parts.append(("practice", wire["practice"]))
    return [
        (
            where,
            Check(
                part.get("prompt") or part["question"],
                part["options"],
                part["answerIndex"],
                part["correctFeedback"],
                part["incorrectFeedback"],
            ),
        )
        for where, part in parts
    ]


def _key(entry: dict, where: str) -> tuple:
    return entry["topic"], entry["arm"], entry["draw"], where


def replay(lessons: list[dict], wrong: list[dict], show: bool) -> dict:
    known = {_key(entry, entry["where"]): entry for entry in wrong}
    found: Counter = Counter()
    caught: dict[tuple, str] = {}
    unlisted: list[tuple] = []
    total = 0
    for lesson in lessons:
        for where, check in _checks(lesson):
            total += 1
            judged, _ = _judgement(check)
            found[judged.found] += 1
            if judged.found in (Found.NOT_COMPUTABLE, Found.RIGHT):
                continue
            key = _key(lesson, where)
            if key in known:
                caught[key] = judged.reason or judged.found.value
            else:
                unlisted.append(key)
            if show:
                question = check.question[:120].replace("\n", " ")
                print(key, judged.found.value, judged.reason, "|", question)
    return {
        "checks": total,
        "found": found,
        "caught": caught,
        "known": known,
        "unlisted": unlisted,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("lessons", type=Path)
    parser.add_argument("--wrong", type=Path, required=True)
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()
    with gzip.open(args.lessons) as saved:
        lessons = json.load(saved)
    result = replay(lessons, json.loads(args.wrong.read_text()), args.show)
    print(f"{result['checks']} checks in {len(lessons)} lessons")
    print({found.value: count for found, count in result["found"].items()})
    by_kind: Counter = Counter()
    caught_kind: Counter = Counter()
    for key, entry in result["known"].items():
        by_kind[entry["kind"]] += 1
        caught_kind[entry["kind"]] += key in result["caught"]
    for kind in by_kind:
        print(f"{caught_kind[kind]} of {by_kind[kind]} caught: {kind}")
    study = {
        key
        for key, entry in result["known"].items()
        if entry["found_by"] != "this issue"
    }
    print(
        f"{len(study & set(result['caught']))} of {len(study)} wrong marked answers of the study caught"
    )
    print(
        f"{len(result['caught'])} of {len(result['known'])} counting those found while reading for this"
    )
    print("repaired or refused, not in the list (read each):", result["unlisted"])


if __name__ == "__main__":
    main()
