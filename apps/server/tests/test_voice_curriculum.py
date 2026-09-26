import json
import re
import sys
from pathlib import Path

import jsonschema
import pytest

from app.voice.curriculum import (
    EVENTS,
    LANGUAGES,
    check_catalogue,
    load_plans,
    plan_from_json,
)
from app.voice.exercises import exercise_by_prompt_id
from app.voice.sequence import SequenceItem, evaluate_sequence
from app.voice.spoken_numbers import _tone_marked, normalize

SCHEMA_PATH = (
    Path(__file__).parents[1]
    / "src"
    / "app"
    / "voice"
    / "lesson_plans"
    / "lesson-plan.schema.json"
)
SCHEMA = json.loads(SCHEMA_PATH.read_text())
PLANS_DIR = (
    Path(__file__).parents[1] / "src" / "app" / "voice" / "lesson_plans" / "plans"
)


def plan_files() -> list[Path]:
    return sorted(PLANS_DIR.rglob("*.json"))


def test_the_shipped_catalogue_module_matches_the_plan_files():
    sys.path.insert(0, str(Path(__file__).parents[1] / "scripts" / "voice"))
    from build_catalogue import MODULE, render

    assert MODULE.read_text() == render(), "run scripts/build_catalogue.py"


@pytest.mark.parametrize("path", plan_files(), ids=lambda path: path.stem)
def test_every_plan_matches_the_authoring_schema(path):
    jsonschema.validate(json.loads(path.read_text()), SCHEMA)


@pytest.mark.parametrize("path", plan_files(), ids=lambda path: path.stem)
def test_every_activity_resolves_to_a_marker(path):
    plan = plan_from_json(json.loads(path.read_text()))
    for event in plan.events:
        activity = event.activity
        if activity is None:
            continue
        if activity.kind == "existing":
            assert exercise_by_prompt_id(activity.prompt_id) is not None, (
                f"{plan.id}#{event.id}"
            )
        else:
            assert activity.items or activity.expected


def test_the_catalogue_is_consistent():
    plans = load_plans()
    assert plans, "no plans shipped"
    assert check_catalogue(plans) == []
    assert all(len(plan.events) >= 9 for plan in plans.values())
    assert set(EVENTS) == {
        event.event for plan in plans.values() for event in plan.events
    }


def test_a_plan_speaks_every_event_in_every_language():
    plan = load_plans()["mathematics.multiplication.table-2"]
    assert plan.classes == ("primary_3",), "NERDC teaches 1x1 to 9x9 in Primary 3"
    assert plan.prerequisites == ("mathematics.multiplication.table-1",)
    assert plan.curriculum.source == "nerdc"
    assert plan.curriculum.strand == "Basic Operations"
    for event in plan.events:
        assert set(event.say) == set(LANGUAGES)
    assert plan.event("practice").activity.prompt_id == "mul_table_2_recite_1_12"
    utterance = plan.event("present").utterance_id(plan.id)
    assert utterance == "plan.mathematics.multiplication.table-2.present"


def test_a_spoken_sequence_is_marked_in_order():
    names = ("monday", "tuesday", "wednesday", "thursday", "friday")
    days = tuple(SequenceItem(day, (day,)) for day in names)
    result = evaluate_sequence("Monday, Tuesday, Thursday, Wednesday, Friday.", days)
    assert result.said == ["monday", "tuesday", "wednesday", "friday"]
    assert result.out_of_order == ["thursday"]
    assert result.missing == []
    missing = evaluate_sequence("monday tuesday", days)
    assert missing.missing == ["wednesday", "thursday", "friday"]


def test_sequence_aliases_follow_the_teaching_language():
    item = SequenceItem("monday", ("ọjọ́ ajé", "monday"))
    tuesday = SequenceItem("tuesday", ("ọjọ́ ìṣẹ́gun",))
    assert evaluate_sequence("Ọjọ́ Ajé", (item, tuesday)).said == ["monday"]


def test_every_lesson_says_when_in_the_school_year_it_is_taught():
    plans = load_plans()
    placed = [plan for plan in plans.values() if plan.term is not None]

    assert len(placed) >= len(plans) - 4, (
        "only lessons with no scheme placement may lack a week"
    )
    for plan in placed:
        assert plan.term in (1, 2, 3), plan.id
        assert 1 <= plan.week <= 13, plan.id
    for plan in plans.values():
        if plan.term is None:
            assert plan.curriculum.note, f"{plan.id} must say why it has no week"
    tables = [plans[f"mathematics.multiplication.table-{n}"] for n in range(1, 10)]
    assert {plan.term for plan in tables} == {2}, (
        "the whole 1x1 to 9x9 block is second term"
    )


def test_yoruba_is_marked_correct_as_a_recognizer_writes_it():
    """A recognizer drops Yoruba tone marks and trailing syllables; that is still a right answer."""
    from app.voice.spoken_numbers import spellings

    assert "marun" in spellings("márùn-ún")
    assert "mewa" in spellings("mẹ́wàá")
    assert spellings("twenty-four") == ["twenty four"], (
        "an English compound is never widened"
    )
    assert spellings("three") == ["three"]

    plans = load_plans("yo")
    practice = plans["mathematics.number.counting-to-twenty"].event("practice")
    as_written = (
        "okan meji meta merin marun mefa meje mejo mesan mewa "
        "mokanla mejila metala merinla eedogun merindinlogun metadinlogun "
        "mejidinlogun mokandinlogun ogun"
    )
    result = evaluate_sequence(as_written, practice.activity.items)
    assert result.missing == [] and result.out_of_order == []


def test_no_spoken_answer_can_be_credited_to_the_wrong_item():
    """`twenty-two` is that number alone, never also `two`; `double u` is W, never also U."""
    clashes = []
    for language in LANGUAGES:
        for plan in load_plans(language).values():
            for event in plan.events:
                activity = event.activity
                if activity is None or activity.kind != "sequence":
                    continue
                for item in activity.items:
                    for alias in item.spoken:
                        said = evaluate_sequence(alias, activity.items).said
                        if said != [item.id]:
                            clashes.append((language, plan.id, item.id, alias, said))

    assert clashes == []


def _reaches_a_transcript(alias: str) -> bool:
    """A recognizer writes no hyphen suffix, no tripled vowel and no doubled final vowel."""
    written = normalize(alias)
    return not (
        "-" in alias
        or re.search(r"([aeiou])\1{2,}", written)
        or re.search(r"([aeiou])\1(?=\s|$)", written)
    )


def _squeezed(written: str) -> str:
    return re.sub(r"(.)\1+", r"\1", written)


def _is_the_same_word(reduction: str, full: str) -> bool:
    """The two spellings differ only in repeated letters or a dropped trailing syllable."""
    return _squeezed(full) == _squeezed(reduction) or _squeezed(full).startswith(
        _squeezed(reduction) + " "
    )


def _alias_groups(language: str) -> list[tuple[str, tuple[str, ...]]]:
    groups = []
    for plan in load_plans(language).values():
        for event in plan.events:
            activity = event.activity
            if activity is None:
                continue
            where = f"{plan.id}#{event.id}"
            groups.extend(
                (f"{where}:{item.id}", item.spoken) for item in activity.items
            )
            if activity.expected:
                groups.append((where, activity.expected))
    return groups


def test_every_yoruba_alias_is_authored_the_way_a_transcript_writes_it():
    """`márùn-ún` reaches the marker as `marun`, so `márùn` has to be authored beside it.

    The full spelling stays: a transcript that does write it must still match.
    """
    unreachable = [
        (where, alias)
        for where, aliases in _alias_groups("yo")
        for alias in aliases
        if _tone_marked(alias)
        and not _reaches_a_transcript(alias)
        and not any(
            _reaches_a_transcript(sibling)
            and _is_the_same_word(normalize(sibling), normalize(alias))
            for sibling in aliases
        )
    ]

    assert unreachable == []
