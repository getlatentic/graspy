from datetime import date

from app.voice.curriculum import check_skills, load_plans, load_skills
from app.voice.evidence_events import evidence_events
from app.voice.skill_tracing import SkillState, estimate, trace
from app.voice.teacher import Evidence

PLANS = load_plans()
DAYS = "mathematics.time.days-of-the-week"
FIVES = "mathematics.number.counting-in-fives"
WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
D1, D2 = date(2026, 10, 1), date(2026, 10, 2)


def broke(said_days):
    return {
        "said": said_days,
        "missing": [d for d in WEEK if d not in said_days],
        "out_of_order": [],
    }


def test_a_list_repaired_on_the_way_back_is_read_as_a_try_a_probe_and_a_repair():
    evidence = [
        Evidence(DAYS, "practice", D1, "try_again", broke(WEEK[:5])),
        Evidence(
            DAYS, "practice", D1, "correct", None, None, f"probe.{DAYS}.practice.friday"
        ),
        Evidence(
            DAYS,
            "practice",
            D1,
            "correct",
            None,
            None,
            f"repair.{DAYS}.practice.friday",
        ),
    ]
    first, probe, repair = evidence_events(evidence, PLANS)
    assert (first.outcome, first.attempt, first.independent, first.error_at) == (
        "wrong",
        1,
        True,
        "friday",
    )
    assert (
        first.support_type,
        first.support_level,
        first.task_scope,
        first.previous_help,
    ) == ("none", 0, "full", False)
    assert (
        probe.support_type,
        probe.support_level,
        probe.task_scope,
        probe.independent,
    ) == ("probe", 1, "single_step", False)
    assert probe.previous_help
    assert (repair.support_type, repair.support_level, repair.task_scope) == (
        "hint",
        3,
        "narrowed",
    )
    assert repair.previous_help and not repair.independent


def test_the_teacher_saying_it_first_is_the_most_help_there_is():
    said_after = Evidence(DAYS, "guide", D1, "correct")
    (event,) = evidence_events([said_after], PLANS)
    assert (event.support_type, event.support_level, event.independent) == (
        "model",
        5,
        False,
    )
    shown = Evidence(
        DAYS, "practice", D1, "correct", None, None, f"show.{DAYS}.practice.friday"
    )
    assert evidence_events([shown], PLANS)[0].support_level == 5


def test_a_recording_nobody_could_hear_is_an_event_but_not_a_try():
    noise = Evidence(
        DAYS, "practice", D1, "not_understood", None, None, None, "unheard", "garbled"
    )
    right = Evidence(DAYS, "practice", D1, "correct")
    unheard, answer = evidence_events([noise, right], PLANS)
    assert (unheard.outcome, unheard.hearing) == ("unheard", "garbled")
    assert (answer.attempt, answer.independent, answer.previous_help) == (
        1,
        True,
        False,
    )
    knew_not = Evidence(
        DAYS, "practice", D1, "not_understood", None, None, None, "unheard", "dont_know"
    )
    assert evidence_events([knew_not], PLANS)[0].outcome == "dont_know"


def test_an_answer_speaks_for_the_skill_it_shows_and_the_ones_it_needs():
    (event,) = evidence_events([Evidence(FIVES, "practice", D1, "correct")], PLANS)
    roles = {use.skill: use.role for use in event.skills}
    assert roles == {
        "groups-of-five": "primary",
        "equal-groups": "supporting",
        "skip-count-5": "supporting",
    }
    assert check_skills(load_skills(), PLANS) == []


def test_each_day_and_each_try_is_counted_on_its_own():
    evidence = [
        Evidence(FIVES, "assess", D1, "try_again"),
        Evidence(FIVES, "assess", D1, "correct"),
        Evidence(FIVES, "assess", D2, "correct"),
    ]
    one, two, tomorrow = evidence_events(evidence, PLANS)
    assert (one.attempt, two.attempt, tomorrow.attempt) == (1, 2, 1)
    assert two.previous_help and not tomorrow.previous_help and tomorrow.independent


def _traced(*events):
    return trace({}, list(events))


def _event(
    outcome, level, day=D1, skill="groups-of-five", role="primary", hearing="heard"
):
    from app.voice.evidence_events import EvidenceEvent, SkillUse

    return EvidenceEvent(
        FIVES,
        "practice",
        "elicit_performance",
        day,
        None,
        (SkillUse(skill, role),),
        outcome,
        level == 0,
        "none" if level == 0 else "model",
        level,
        "full",
        level > 0,
        1,
        None,
        hearing,
    )


def test_right_answers_alone_on_two_days_are_a_skill_known_and_one_day_is_not():
    two = _traced(_event("correct", 0, D1), _event("correct", 0, D2))
    assert estimate(two, "groups-of-five") == "alone"
    assert estimate(_traced(_event("correct", 0, D1)), "groups-of-five") == "alone_once"


def test_right_answers_only_after_the_answer_was_told_are_a_child_who_can_follow_not_one_who_knows():
    state = _traced(*[_event("correct", 5, day) for day in (D1, D2, D1, D2)])
    assert estimate(state, "groups-of-five") != "alone"
    assert state["groups-of-five"].score < 0.6
    cued = _traced(_event("correct", 2, D1), _event("correct", 2, D2))
    assert estimate(cued, "groups-of-five") == "supported"


def test_a_wrong_answer_given_alone_counts_for_more_than_one_given_after_help():
    alone = _traced(_event("wrong", 0))
    after = _traced(_event("wrong", 4))
    assert alone["groups-of-five"].failures > after["groups-of-five"].failures


def test_a_skill_an_answer_only_needs_counts_half_and_unheard_counts_for_nothing():
    primary = _traced(_event("correct", 0))
    supporting = _traced(_event("correct", 0, role="supporting"))
    assert (
        supporting["groups-of-five"].successes
        == primary["groups-of-five"].successes / 2
    )
    assert _traced(_event("unheard", 0, hearing="garbled")) == {}
    assert estimate({}, "anything") == "unknown"


def test_the_estimate_is_a_word_so_no_chance_is_ever_shown_for_what_the_weights_do_not_support():
    state: dict[str, SkillState] = _traced(_event("correct", 0), _event("wrong", 0))
    assert estimate(state, "groups-of-five") in {
        "unknown",
        "shaky",
        "supported",
        "alone_once",
        "alone",
    }


def test_a_small_teaching_question_is_help_not_proof():
    taught = Evidence(
        FIVES, "recall", D1, "correct", None, None, f"remedy.{FIVES}.recall.0"
    )
    (event,) = evidence_events([taught], PLANS)
    assert (
        event.support_type,
        event.support_level,
        event.task_scope,
        event.independent,
    ) == ("model", 4, "single_step", False)
