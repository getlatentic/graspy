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


def _with_support(**changes):
    payload = json.loads(
        (PLANS_DIR / "mathematics/time/days-of-the-week.json").read_text()
    )
    span = next(event for event in payload["events"] if event["id"] == "span")
    span.update(changes)
    return plan_from_json(payload)


def test_a_shorter_step_is_the_start_of_the_list_it_supports():
    plan = load_plans()["mathematics.time.days-of-the-week"]
    span = plan.event("span")
    assert span.support == "practice"
    assert [item.id for item in span.activity.items] == [
        item.id for item in plan.event("practice").activity.items
    ][: len(span.activity.items)]
    assert [p for p in check_catalogue({plan.id: plan}) if "span" in p] == []


@pytest.mark.parametrize(
    "changes,problem",
    [
        ({"support": "feedback"}, "has no activity to compare with feedback's"),
        ({"support": "attention"}, "supports an event that does not come after it"),
        ({"support": "nowhere"}, "supports an event that does not come after it"),
    ],
)
def test_a_shorter_step_that_does_not_lead_to_its_event_is_refused(changes, problem):
    plan = _with_support(**changes)
    refused = [p for p in check_catalogue({plan.id: plan}) if "span" in p]
    assert refused and problem in refused[0]


def test_a_shorter_step_as_long_as_the_whole_list_is_refused():
    payload = json.loads(
        (PLANS_DIR / "mathematics/time/days-of-the-week.json").read_text()
    )
    events = {event["id"]: event for event in payload["events"]}
    events["span"]["activity"]["items"] = events["practice"]["activity"]["items"]
    plan = plan_from_json(payload)
    assert any("cut short" in p for p in check_catalogue({plan.id: plan}))


def test_a_shorter_count_is_marked_against_its_own_items_and_told_what_follows():
    from app.voice.exercises import plan_exercise
    from app.voice.expectation import expectation

    step = expectation(plan_exercise("plan.mathematics.time.days-of-the-week.span"))
    full = expectation(plan_exercise("plan.mathematics.time.days-of-the-week.practice"))
    assert [item["id"] for item in step["items"]] == [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
    ]
    assert [item["id"] for item in step["more"]] == ["friday", "saturday"]
    assert "more" not in full


def test_a_shorter_step_must_be_an_elicit_performance_and_the_only_one_for_its_event():
    plan = _with_support(event="provide_guidance")
    assert any("elicit_performance" in p for p in check_catalogue({plan.id: plan}))
    payload = json.loads(
        (PLANS_DIR / "mathematics/time/days-of-the-week.json").read_text()
    )
    twin = dict(next(e for e in payload["events"] if e["id"] == "span"), id="span-two")
    payload["events"].insert(5, twin)
    two = plan_from_json(payload)
    assert any(
        "more than one shorter step" in p for p in check_catalogue({two.id: two})
    )


def test_a_shorter_question_leads_to_a_question_of_the_same_kind():
    plans = load_plans()
    fives = plans["mathematics.number.counting-in-fives"]
    assert fives.event("span").support == "practice"
    assert fives.event("span").activity.kind == fives.event("practice").activity.kind
    assert [p for p in check_catalogue({fives.id: fives}) if "span" in p] == []
    payload = json.loads(
        (PLANS_DIR / "mathematics/number/counting-in-fives.json").read_text()
    )
    span = next(e for e in payload["events"] if e["id"] == "span")
    span["activity"] = {
        "kind": "sequence",
        "items": [{"id": "5", "spoken": {"en": ["5"], "yo": ["5"], "pcm": ["5"]}}],
    }
    unlike = plan_from_json(payload)
    assert any(
        "is not the same kind of activity" in p
        for p in check_catalogue({unlike.id: unlike})
    )


from app.voice.curriculum import Skill, check_skills, load_skills, needs_first


def test_the_skills_the_lessons_name_form_a_graph_with_nothing_missing_and_no_loop():
    skills, plans = load_skills(), load_plans()
    assert check_skills(skills, plans) == []
    assert len(skills) >= 12


def test_what_a_skill_rests_on_is_found_nearest_first_across_the_whole_graph():
    skills = load_skills()
    assert needs_first(skills, "groups-of-five") == [
        "skip-count-5",
        "equal-groups",
        "number-names-1-20",
        "skip-count-10",
        "number-names-1-10",
    ]
    assert needs_first(skills, "number-names-1-10") == []


def test_every_activity_of_a_lesson_that_has_skills_names_one():
    plans = load_plans()
    for plan_id in (
        "mathematics.number.counting-in-fives",
        "mathematics.number.counting-in-sevens",
    ):
        for event in plans[plan_id].events:
            assert (event.skill is not None) == (event.activity is not None), (
                plan_id,
                event.id,
            )


def test_a_broken_graph_is_refused():
    plans = load_plans()
    loop = {
        "a": Skill("a", "A", ("b",)),
        "b": Skill("b", "B", ("a",)),
        "c": Skill("c", "C", ("nowhere",), "no.such.plan"),
    }
    problems = check_skills(loop, plans)
    assert "a: needs itself" in problems and "b: needs itself" in problems
    assert "c: needs nowhere, which does not exist" in problems
    assert "c: taught by no.such.plan, which does not exist" in problems
    stray = {"a": Skill("a", "A", ())}
    assert any("names the skill" in p for p in check_skills(stray, plans))


def test_a_wrong_answer_is_met_with_the_plans_hints_least_help_first_and_only_where_it_wrote_them():
    from app.voice.exercises import exercise_by_prompt_id
    from app.voice.expectation import expectation

    fives = "mathematics.number.counting-in-fives"
    for event, rungs in (("recall", 2), ("span", 2), ("practice", 3), ("assess", 3)):
        marking = expectation(exercise_by_prompt_id(f"plan.{fives}.{event}"))
        assert len(marking["hints"]) == rungs, event
    first = expectation(exercise_by_prompt_id(f"plan.{fives}.practice"))["hints"][0]
    assert first == "Each new heap adds five. Count heap by heap."
    assert "hints" not in expectation(exercise_by_prompt_id(f"echo.{fives}.recall"))
    assert "hints" not in expectation(exercise_by_prompt_id("mul_fact_2x3_answer"))
    assert exercise_by_prompt_id(f"plan.{fives}.practice", "yo").hints == ()


def test_a_skill_whose_teaching_steps_lack_english_is_refused():
    from app.voice.curriculum import RemedyStep, Skill, check_skills

    skills = {"a": Skill("a", "A", (), None, (RemedyStep({}, {}, {}),))}
    assert any("needs English words" in p for p in check_skills(skills, load_plans()))
    assert not [
        p for p in check_skills(load_skills(), load_plans()) if "remediation" in p
    ]


def test_a_ladder_of_hints_says_how_much_each_gives_and_never_gives_less_than_the_one_before():
    from app.voice.curriculum import hint_problems

    three = ("a", "b", "c")
    assert hint_problems("x", three, ("cue", "structure", "partial_model")) == []
    assert hint_problems("x", three, ("cue", "cue", "partial_model")) == []
    assert hint_problems("x", three, ("cue", "structure")) != []
    assert hint_problems("x", three, ("structure", "cue", "partial_model")) != []
    assert hint_problems("x", three[:1], ("partial_model",)) != []
    assert all(
        hint_problems(
            f"{plan.id}#{event.id}", event.activity.hints, event.activity.hint_levels
        )
        == []
        for plan in load_plans().values()
        for event in plan.events
        if event.activity
    )
