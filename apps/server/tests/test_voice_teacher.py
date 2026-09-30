from datetime import date

import pytest

from app.voice.curriculum import load_plans
from app.voice.teacher import (
    Choice,
    Evidence,
    Option,
    TeacherChoiceError,
    choose,
    decision_schema,
    event_move,
    evidence_from_rows,
    left_for_tomorrow,
    next_options,
    parse_choice,
    progress_by_plan,
    rest_move,
)

PLANS = load_plans()
DAY_1 = date(2026, 9, 6)
DAY_2 = date(2026, 9, 7)
DAY_3 = date(2026, 9, 8)
T1 = "mathematics.multiplication.table-1"
T2 = "mathematics.multiplication.table-2"
T3 = "mathematics.multiplication.table-3"
TWOS = "mathematics.number.counting-in-twos"
TABLE_CLASS = "primary_3"  # NERDC teaches every table from 1x1 to 9x9 in Primary 3
COUNT_20 = "mathematics.number.counting-to-twenty"
PLACE_VALUE = "mathematics.number.place-value-tens-and-units"
TENS = "mathematics.number.counting-in-tens"
FIVES = "mathematics.number.counting-in-fives"


def said(plan, event, day=DAY_1):
    return Evidence(plan, event, day)


def marked(plan, event, decision, day=DAY_1):
    return Evidence(plan, event, day, decision)


def lesson(plan, day=DAY_1, assess="correct"):
    ids = [event.id for event in PLANS[plan].events]
    evidence = [said(plan, event_id, day) for event_id in ids[:-2]]
    return [*evidence, marked(plan, "assess", assess, day), said(plan, "retain", day)]


def test_a_new_primary_one_learner_starts_the_first_plan_for_the_class_at_its_first_event():
    options = next_options(
        PLANS, progress_by_plan([], PLANS, DAY_1), DAY_1, "primary_1"
    )
    assert options == [Option(COUNT_20, "attention", "start Counting to twenty")]


def test_a_plan_in_progress_today_continues_at_its_next_event():
    evidence = [said(T1, "attention"), said(T1, "objective")]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence)[0] == Option(
        T1, "recall", "continue The one times table at stimulate_recall"
    )


def test_a_wrong_activity_gets_its_feedback_event_and_then_comes_round_again():
    taught = [
        said(T1, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]
    evidence = [*taught, marked(T1, "practice", "try_again")]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence)[0].event_id
        == "feedback"
    )
    after_feedback = [*evidence, said(T1, "feedback")]
    progress = progress_by_plan(after_feedback, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, after_feedback)[0].event_id
        == "practice"
    )
    wrong_again = [*after_feedback, marked(T1, "practice", "not_understood")]
    progress = progress_by_plan(wrong_again, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, wrong_again)[0].event_id
        == "guide"
    )
    shown_again = [*wrong_again, said(T1, "guide")]
    progress = progress_by_plan(shown_again, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, shown_again)[0].event_id
        == "practice"
    )
    retried = [*after_feedback, marked(T1, "practice", "correct")]
    progress = progress_by_plan(retried, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, retried)[0].event_id
        == "assess"
    )
    wrong_check = [*retried, marked(T1, "assess", "try_again")]
    progress = progress_by_plan(wrong_check, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, wrong_check)[0].event_id
        == "feedback"
    )
    checked_again = [*wrong_check, said(T1, "feedback")]
    progress = progress_by_plan(checked_again, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, checked_again)[0].event_id
        == "assess"
    )


def test_only_the_lesson_touched_last_today_continues_and_only_within_the_class():
    evidence = [
        marked(COUNT_20, "practice", "correct"),
        marked(TWOS, "practice", "correct"),
    ]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, "primary_1", evidence) == [
        Option(TWOS, "attention", "continue Counting in twos at gain_attention"),
    ]
    other_class = [marked(T2, "practice", "correct")]
    progress = progress_by_plan(other_class, PLANS, DAY_1)
    started = next_options(PLANS, progress, DAY_1, "primary_1", other_class)
    assert all(option.plan_id != T2 for option in started)


def taught_before_practice():
    return [
        said(T1, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]


DATE_4 = date(2026, 9, 9)
DATE_5 = date(2026, 9, 10)


def taught_before_practice_on(day):
    return [
        said(T1, e, day)
        for e in ("attention", "objective", "recall", "present", "guide")
    ]


def next_step(evidence, day=DAY_1):
    progress = progress_by_plan(evidence, PLANS, day)
    options = next_options(PLANS, progress, day, TABLE_CLASS, evidence)
    return options[0].event_id if options else None


def test_the_plans_feedback_is_not_played_after_an_activity_the_child_got_right():
    evidence = [*taught_before_practice(), marked(T1, "practice", "correct")]
    assert next_step(evidence) == "assess"


def test_a_child_who_did_not_know_is_shown_it_again_not_told_what_they_skipped():
    evidence = [*taught_before_practice(), marked(T1, "practice", "not_understood")]
    assert next_step(evidence) == "guide"
    evidence.append(said(T1, "guide"))
    assert next_step(evidence) == "practice"


def test_a_child_who_tried_and_was_wrong_hears_the_feedback_first_and_is_shown_it_again_on_a_second_miss():
    evidence = [*taught_before_practice(), marked(T1, "practice", "try_again")]
    assert next_step(evidence) == "feedback"
    evidence += [said(T1, "feedback"), marked(T1, "practice", "try_again")]
    assert next_step(evidence) == "guide"


def test_a_lesson_whose_activity_is_failed_three_times_is_left_for_tomorrow():
    evidence = [*taught_before_practice()]
    for _ in range(3):
        evidence.append(marked(T1, "practice", "not_understood"))
        evidence.append(said(T1, "guide"))
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence) == []
    assert rest_move(PLANS, progress, TABLE_CLASS)["say"] == "try-tomorrow"


def test_the_day_is_over_for_a_class_once_a_lesson_of_it_is_left_for_tomorrow():
    evidence = [*taught_before_practice(), *[marked(T1, "practice", "try_again")] * 3]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence) == []
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence, chosen=T2) == []
    assert next_options(PLANS, progress, DAY_1, "primary_1", evidence) != []


def test_a_lesson_left_for_tomorrow_is_taken_up_again_the_next_day():
    evidence = [*taught_before_practice(), *[marked(T1, "practice", "try_again")] * 3]
    next_day = progress_by_plan(evidence, PLANS, DAY_2)
    options = next_options(PLANS, next_day, DAY_2, TABLE_CLASS, evidence)
    assert options and options[0].plan_id == T1


def test_a_guided_practice_the_child_cannot_do_is_not_repeated_for_ever():
    evidence = [*taught_before_practice(), marked(T1, "practice", "not_understood")]
    for _ in range(3):
        evidence += [marked(T1, "guide", "not_understood")]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence) == []


def test_a_recitation_with_some_facts_right_is_progress_not_a_miss_toward_leaving_the_lesson():
    partial = Evidence(T2, "practice", DAY_1, "try_again", PARTIAL_RECITATION)
    evidence = [*taught_up_to_practice(), partial, said(T2, "feedback")]
    for _ in range(2):
        evidence.append(answered(T2, "practice", 2, 3, "try_again"))
    assert next_move(evidence, T2)["event"] == "provide_guidance"
    evidence += [said(T2, "guide"), answered(T2, "practice", 2, 3, "correct")]
    evidence.append(answered(T2, "practice", 2, 7, "try_again"))
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert not progress[T2].paused_today
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence) != []


def test_facts_missed_three_times_running_with_none_right_leave_the_lesson_for_tomorrow():
    partial = Evidence(T2, "practice", DAY_1, "try_again", PARTIAL_RECITATION)
    evidence = [*taught_up_to_practice(), partial]
    evidence += [answered(T2, "practice", 2, 3, "try_again")] * 3
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert progress[T2].paused_today
    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence) == []


def test_a_review_passed_first_is_not_followed_by_the_whole_lesson_again():
    evidence = [marked(T1, "assess", "correct")]
    assert next_step(evidence) == "retain"
    done = [*evidence, said(T1, "retain")]
    progress = progress_by_plan(done, PLANS, DAY_1)
    options = next_options(PLANS, progress, DAY_1, TABLE_CLASS, done)
    assert all(option.plan_id != T1 for option in options)


def test_a_check_passed_late_after_three_misses_is_a_pass_not_a_lesson_left_for_tomorrow():
    evidence = [*taught_before_practice(), *[marked(T1, "assess", "try_again")] * 3]
    evidence.append(marked(T1, "assess", "correct"))
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert not left_for_tomorrow(PLANS, progress, TABLE_CLASS)
    assert next_step(evidence) == "retain"


def test_a_lesson_left_for_tomorrow_on_three_days_comes_after_the_others_and_still_when_there_are_none():
    def stuck(day, plan):
        events = [
            said(plan, e, day)
            for e in ("attention", "objective", "recall", "present", "guide")
        ]
        return [*events, *[marked(plan, "practice", "try_again", day)] * 3]

    evidence = [*stuck(DAY_1, T1), *stuck(DAY_2, T1), *stuck(DATE_4, T1)]
    progress = progress_by_plan(evidence, PLANS, DATE_5)
    options = next_options(PLANS, progress, DATE_5, TABLE_CLASS, evidence)
    assert options and options[0].plan_id != T1
    only = progress_by_plan(
        [
            *stuck(DAY_1, "mathematics.shapes.naming-shapes"),
            *stuck(DAY_2, "mathematics.shapes.naming-shapes"),
            *stuck(DATE_4, "mathematics.shapes.naming-shapes"),
        ],
        PLANS,
        DATE_5,
    )
    left = next_options(PLANS, only, DATE_5, "kindergarten", [])
    assert left and left[0].plan_id == "mathematics.shapes.naming-shapes"


def test_when_nothing_is_due_the_rest_is_the_plain_finish():
    progress = progress_by_plan([], PLANS, DAY_1)
    assert rest_move(PLANS, progress, TABLE_CLASS)["say"] == "finished"


def test_a_recall_check_nobody_answered_is_asked_again_without_feedback_then_followed_by_the_teaching():
    start = [said(T1, "attention"), said(T1, "objective")]
    first = [*start, marked(T1, "recall", "not_understood")]
    assert next_step(first) == "recall"
    again = [*first, marked(T1, "recall", "not_understood")]
    assert next_step(again) == "present"


def test_a_recall_check_answered_wrongly_gets_its_feedback_and_is_then_followed_by_the_teaching():
    start = [said(T1, "attention"), said(T1, "objective")]
    first = [*start, marked(T1, "recall", "try_again")]
    assert next_step(first) == "feedback"
    again = [*first, said(T1, "feedback"), marked(T1, "recall", "try_again")]
    assert next_step(again) == "present"


def test_a_skipped_recall_leaves_no_feedback_owed_for_a_later_miss_to_spend():
    taught = [
        said(T1, "attention"),
        said(T1, "objective"),
        marked(T1, "recall", "not_understood"),
        said(T1, "feedback"),
        marked(T1, "recall", "try_again"),
        said(T1, "present"),
        said(T1, "guide"),
        marked(T1, "practice", "try_again"),
    ]
    progress = progress_by_plan(taught, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, taught)[0].event_id
        == "feedback"
    )
    after = [*taught, said(T1, "feedback")]
    progress = progress_by_plan(after, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, after)[0].event_id
        == "practice"
    )


def test_a_recall_check_failed_once_is_asked_again_after_its_feedback():
    start = [
        said(T1, "attention"),
        said(T1, "objective"),
        marked(T1, "recall", "try_again"),
    ]
    progress = progress_by_plan(start, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, start)[0].event_id
        == "feedback"
    )
    after = [*start, said(T1, "feedback")]
    progress = progress_by_plan(after, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, after)[0].event_id == "recall"
    )


def test_two_misses_in_one_day_each_hear_their_own_feedback():
    plan = PLANS[T1]
    feedback = plan.event_of("provide_feedback").id
    before = [said(T1, e) for e in ("attention", "objective")]
    failed_recall = [*before, marked(T1, "recall", "try_again")]
    heard = [*failed_recall, said(T1, feedback), marked(T1, "recall", "correct")]
    taught = [*heard, said(T1, "present"), said(T1, "guide")]
    failed_practice = [*taught, marked(T1, "practice", "try_again")]
    progress = progress_by_plan(failed_practice, PLANS, DAY_1)
    offered = next_options(PLANS, progress, DAY_1, TABLE_CLASS, failed_practice)
    assert offered[0].event_id == feedback


def test_mastery_needs_two_assessed_days_and_a_weakened_lesson_comes_before_new_material():
    day_one = [*lesson(COUNT_20), *lesson(TWOS)]
    progress = progress_by_plan(day_one, PLANS, DAY_1)
    assert not progress[COUNT_20].mastered
    assert next_options(PLANS, progress, DAY_1, "primary_1")[0].plan_id == TENS
    next_day = progress_by_plan(day_one, PLANS, DAY_2)
    slipped = (COUNT_20, TWOS)
    options = next_options(PLANS, next_day, DAY_2, "primary_1", weakened=slipped)
    assert options[0] == Option(
        COUNT_20, "assess", "review Counting to twenty before new work"
    )
    assert options[1] == Option(
        TWOS, "assess", "review Counting in twos before new work"
    )
    assert options[2].plan_id == TENS
    both_days = [
        *day_one,
        marked(COUNT_20, "assess", "correct", DAY_2),
        marked(TWOS, "assess", "correct", DAY_2),
    ]
    assert progress_by_plan(both_days, PLANS, DAY_2)[COUNT_20].mastered
    day_three = progress_by_plan(both_days, PLANS, DAY_3)
    assert next_options(PLANS, day_three, DAY_3, "primary_1")[0].plan_id == TENS


def test_a_lesson_holds_while_it_is_remembered_and_returns_weakest_first():
    done = [*lesson(COUNT_20), *lesson(TWOS)]
    progress = progress_by_plan(done, PLANS, DAY_2)
    assert next_options(PLANS, progress, DAY_2, "primary_1")[0].plan_id == TENS
    weakest_first = next_options(
        PLANS, progress, DAY_2, "primary_1", weakened=(TWOS, COUNT_20)
    )
    assert [option.plan_id for option in weakest_first[:2]] == [TWOS, COUNT_20]


def test_a_lesson_assessed_today_is_not_asked_for_again_today():
    today = progress_by_plan(lesson(COUNT_20), PLANS, DAY_1)
    offered = next_options(PLANS, today, DAY_1, "primary_1", weakened=(COUNT_20,))
    assert COUNT_20 not in [option.plan_id for option in offered]


def test_a_weakened_lesson_from_another_class_is_never_offered():
    done = progress_by_plan(lesson(COUNT_20), PLANS, DAY_2)
    offered = next_options(PLANS, done, DAY_2, "primary_3", weakened=(COUNT_20,))
    assert COUNT_20 not in [option.plan_id for option in offered]


def test_a_prerequisite_gates_the_next_table():
    progress = progress_by_plan([], PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, "primary_3")[0].plan_id == PLACE_VALUE
    assert next_options(PLANS, progress, DAY_1, "primary_4")[0].plan_id == FIVES
    after_place_value = progress_by_plan(lesson(PLACE_VALUE), PLANS, DAY_1)
    assert next_options(PLANS, after_place_value, DAY_1, "primary_3")[0].plan_id == T1
    after_table_one = progress_by_plan(
        [*lesson(PLACE_VALUE), *lesson(T1)], PLANS, DAY_1
    )
    assert next_options(PLANS, after_table_one, DAY_1, "primary_3")[0].plan_id == T2
    after_two = progress_by_plan(
        [*lesson(PLACE_VALUE), *lesson(T1), *lesson(T2)], PLANS, DAY_1
    )
    assert next_options(PLANS, after_two, DAY_1, "primary_3")[0].plan_id == T3


@pytest.mark.asyncio
async def test_one_option_needs_no_model_and_several_are_put_to_it():
    class Model:
        def __init__(self):
            self.asked = []

        async def decide(self, prompt, schema):
            self.asked.append((prompt, schema))
            return _reply('{"step": 1, "reason": "review first"}')

    model = Model()
    single = [Option(T1, "attention", "start")]
    assert await choose(model, single, [], DAY_1, "en") == Choice(
        T1, "attention", "start"
    )
    assert model.asked == []

    several = [Option(T1, "assess", "review"), Option(TWOS, "attention", "start")]
    chosen = await choose(model, several, [said(T1, "retain")], DAY_2, "yo")
    assert chosen == Choice(T1, "assess", "review first")
    prompt, schema = model.asked[0]
    assert "Aunty Chioma" in prompt and "1. review" in prompt and "yo" in prompt
    assert schema == decision_schema(several)
    assert schema["properties"]["step"]["maximum"] == 2


def _reply(content):
    """The shape Workers AI returns for gpt-oss: one chat choice carrying the JSON we asked for."""
    return {"choices": [{"message": {"content": content}}]}


def test_a_malformed_or_out_of_range_answer_is_refused():
    options = [Option(T1, "assess", "review"), Option(TWOS, "attention", "start")]
    refused = (
        {},
        {"choices": []},
        _reply(None),
        _reply("not json"),
        _reply('{"step": 3, "reason": "no"}'),
        _reply('{"step": "1"}'),
        _reply('{"reason": "no step"}'),
    )
    for reply in refused:
        with pytest.raises(TeacherChoiceError):
            parse_choice(reply, options)
    chosen = parse_choice(_reply('{"step": 2, "reason": "  a new one  "}'), options)
    assert chosen == Choice(TWOS, "attention", "a new one")


def test_the_move_carries_the_note_the_screen_text_and_the_activity():
    plan = PLANS[TWOS]
    move = event_move(plan, plan.event("practice"), "start")
    assert move["kind"] == "event" and move["event"] == "elicit_performance"
    assert move["say"] == f"plan.{TWOS}.practice"
    assert move["subject"] == "mathematics" and move["say_text"]["en"].startswith(
        "Your turn"
    )
    assert move["activity"]["prompt_id"] == f"plan.{TWOS}.practice"
    assert "items" not in move["activity"], (
        "an activity being marked never shows its answer"
    )
    guided = event_move(plan, plan.event("guide"), "start")
    assert guided["activity"]["items"][0] == {"id": "2", "spoken": "2"}
    assert "items" not in event_move(plan, plan.event("assess"), "start")["activity"]
    guide = event_move(PLANS[T2], PLANS[T2].event("guide"), "continue")
    assert guide["activity"] == {"kind": "existing", "prompt_id": "mul_fact_2x3_say"}
    assert (
        event_move(PLANS[T2], PLANS[T2].event("attention"), "start")["activity"] is None
    )


def test_only_a_turn_that_names_its_plan_event_is_lesson_evidence():
    rows = [
        {
            "metadata_json": '{"prompt_id": "mul_table_2_recite_1_12"}',
            "decision": "correct",
            "at": 1788692059900,
        },
        {
            "metadata_json": '{"prompt_id": "mul_fact_2x7_answer", "plan_id": "'
            + T2
            + '", "event_id": "assess"}',
            "decision": "correct",
            "at": 1788692059900,
        },
        {
            "metadata_json": None,
            "plan_id": TWOS,
            "event_id": "present",
            "at": 1788692059900,
        },
        {
            "metadata_json": None,
            "plan_id": T2,
            "event_id": "not-an-event",
            "at": 1788692059900,
        },
    ]

    evidence = evidence_from_rows(rows, PLANS)

    assert evidence == [
        Evidence(T2, "assess", DAY_1, "correct"),
        Evidence(TWOS, "present", DAY_1, None),
    ]


def test_the_catalogue_shows_where_the_learner_stands_on_every_lesson_of_their_class():
    from app.voice.teacher import catalogue

    turns = [
        *lesson(COUNT_20),
        marked(COUNT_20, "assess", "correct", DAY_2),
        said(TWOS, "attention", DAY_2),
    ]
    progress = progress_by_plan(turns, PLANS, DAY_2)
    current = next_options(PLANS, progress, DAY_2, "primary_1", turns)[0]

    rows = catalogue(PLANS, progress, DAY_2, "primary_1", current)
    by_plan = {row["plan_id"]: row for row in rows}

    assert all("primary_1" in PLANS[row["plan_id"]].classes for row in rows)
    assert by_plan[COUNT_20]["standing"] == "mastered"
    assert by_plan[COUNT_20]["days_correct"] == 2
    assert by_plan[TWOS]["standing"] == "started"
    assert by_plan[TENS]["standing"] == "untouched"
    assert by_plan[TENS]["subject"] == "mathematics" and by_plan[TENS]["title"]["yo"]
    assert [row["plan_id"] for row in rows if row["current"]] == [current.plan_id]
    assert [row["plan_id"] for row in rows] == sorted(
        by_plan, key=lambda p: PLANS[p].sequence
    )


PARTIAL_RECITATION = {
    "correct_multipliers": [1, 2, 4, 5, 6, 8, 10, 11, 12],
    "incorrect_facts": [{"multiplier": 3, "expected": 6, "heard": 5}],
    "missing_multipliers": [7],
    "uncertain_multipliers": [9],
}


def answered(plan, event, table, multiplier, decision, day=DAY_1):
    exercise = {"kind": "fact_answer", "table": table, "multiplier": multiplier}
    return Evidence(plan, event, day, decision, None, exercise)


def next_move(evidence, plan=T2):
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    option = next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence)[0]
    event = PLANS[plan].event(option.event_id)
    return event_move(PLANS[plan], event, option.why, option.facts)


def taught_up_to_practice(plan=T2):
    ids = [event.id for event in PLANS[plan].events]
    return [said(plan, event_id) for event_id in ids[: ids.index("practice")]]


def test_a_missed_recitation_is_retried_one_fact_at_a_time_not_by_reciting_it_all_again():
    """Saying twelve facts to fix three discourages the child and is worst for the recogniser."""
    partial = Evidence(T2, "practice", DAY_1, "try_again", PARTIAL_RECITATION)
    evidence = [*taught_up_to_practice(), partial, said(T2, "feedback")]

    move = next_move(evidence)

    assert move["event"] == "elicit_performance"
    assert move["activity"] == {"kind": "existing", "prompt_id": "mul_fact_2x3_answer"}
    assert move["say"] == "fact-2-3-ask"
    assert move["say_text"]["en"] == "What is two times three?"
    assert set(move["say_text"]) == {"en", "yo", "pcm"}


def test_each_owed_fact_is_asked_in_turn_and_the_lesson_moves_on_when_none_are_left():
    partial = Evidence(T2, "practice", DAY_1, "try_again", PARTIAL_RECITATION)
    evidence = [*taught_up_to_practice(), partial, said(T2, "feedback")]

    asked = []
    for multiplier in (3, 7, 9):
        move = next_move(evidence)
        asked.append(move["activity"]["prompt_id"])
        evidence.append(answered(T2, "practice", 2, multiplier, "correct"))

    assert asked == [
        "mul_fact_2x3_answer",
        "mul_fact_2x7_answer",
        "mul_fact_2x9_answer",
    ]
    assert next_move(evidence)["event"] == "assess_performance"


def test_an_owed_fact_answered_wrongly_hears_feedback_and_is_asked_again():
    partial = Evidence(T2, "practice", DAY_1, "try_again", PARTIAL_RECITATION)
    evidence = [*taught_up_to_practice(), partial, said(T2, "feedback")]
    evidence.append(answered(T2, "practice", 2, 3, "try_again"))

    assert next_move(evidence)["event"] == "provide_feedback"

    evidence.append(said(T2, "feedback"))
    assert next_move(evidence)["activity"]["prompt_id"] == "mul_fact_2x3_answer"


def test_the_whole_table_is_asked_first_and_a_full_recitation_is_never_narrowed():
    first = next_move(taught_up_to_practice())
    assert first["activity"]["prompt_id"] == "mul_table_2_recite_1_12"
    assert first["say"] == "plan.mathematics.multiplication.table-2.practice"

    whole = {
        "correct_multipliers": list(range(1, 13)),
        "incorrect_facts": [],
        "missing_multipliers": [],
        "uncertain_multipliers": [],
    }
    evidence = [
        *taught_up_to_practice(),
        Evidence(T2, "practice", DAY_1, "correct", whole),
    ]

    assert next_move(evidence)["event"] == "assess_performance"
    assert next_move(evidence)["activity"]["prompt_id"] == "mul_fact_2x7_answer"
    assert (
        next_move(evidence)["say"] == "plan.mathematics.multiplication.table-2.assess"
    )


def test_a_recite_event_may_be_answered_one_fact_at_a_time_and_nothing_else():
    """The narrowed retry must pass the same ownership check as the activity it replaces."""
    from app.voice.teacher import answerable_prompts

    plan = PLANS[T2]
    practice = plan.event("practice")

    allowed = answerable_prompts(plan, practice)

    assert "mul_table_2_recite_1_12" in allowed
    assert "mul_fact_2x3_answer" in allowed
    assert "mul_fact_3x3_answer" not in allowed
    assert answerable_prompts(plan, plan.event("assess")) == {"mul_fact_2x7_answer"}


def test_any_lesson_of_the_learners_class_opens_at_its_own_next_step():
    started = [said(T1, "attention")]
    progress = progress_by_plan(started, PLANS, DAY_1)

    def opened(plan_id):
        return next_options(
            PLANS, progress, DAY_1, TABLE_CLASS, started, chosen=plan_id
        )

    assert opened(T1)[0].event_id == "objective"
    assert opened(T3)[0].event_id == "attention"
    assert next_options(PLANS, progress, DAY_1, "primary_1", started, chosen=T3) == []


def test_opening_a_lesson_finished_today_offers_nothing_rather_than_another_lesson():
    done = lesson(T1)
    progress = progress_by_plan(done, PLANS, DAY_1)

    assert next_options(PLANS, progress, DAY_1, TABLE_CLASS, done, chosen=T1) == []
