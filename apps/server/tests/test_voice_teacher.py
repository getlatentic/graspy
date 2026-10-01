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
    next_new_plan,
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


def test_a_wrong_activity_comes_round_again_at_once_because_the_teachers_reply_was_the_feedback():
    taught = [
        said(T1, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]
    evidence = [*taught, marked(T1, "practice", "try_again")]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, evidence)[0].event_id
        == "practice"
    )
    after_feedback = evidence
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


def test_a_child_who_tried_and_was_wrong_is_asked_again_and_is_shown_it_again_on_a_second_miss():
    evidence = [*taught_before_practice(), marked(T1, "practice", "try_again")]
    assert next_step(evidence) == "practice"
    evidence += [marked(T1, "practice", "try_again")]
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


def test_a_child_who_did_not_try_the_guided_practice_is_asked_again_not_told_what_they_skipped():
    evidence = [*taught_before_practice()[:-1], marked(T1, "guide", "not_understood")]
    assert next_step(evidence) == "guide"
    tried = [*taught_before_practice()[:-1], marked(T1, "guide", "try_again")]
    assert next_step(tried) == "guide"


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
    assert next_step(done) is None


def test_a_check_passed_late_after_three_misses_is_a_pass_with_help_checked_again_tomorrow():
    evidence = [*taught_before_practice(), *[marked(T1, "assess", "try_again")] * 3]
    evidence.append(marked(T1, "assess", "correct"))
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    state = progress[T1]
    assert state.supported_days == {DAY_1} and state.assessed_days == set()
    assert state.paused_days == {DAY_1}  # the three misses before it
    assert next_step(evidence) is None
    assert rest_move(PLANS, progress, TABLE_CLASS)["say"] == "check-tomorrow"


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


def fives_next(evidence):
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    options = next_options(PLANS, progress, DAY_1, "primary_4", evidence)
    return options[0].event_id if options else None


def fives_taught():
    return [
        said(FIVES, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]


def _missed_and_shown(times):
    """A child who could not begin, shown the guided practice after each miss."""
    out = []
    for _ in range(times):
        out += [marked(FIVES, "practice", "not_understood"), said(FIVES, "guide")]
    return out


def test_a_child_who_misses_the_question_after_its_hints_is_given_a_smaller_one_before_it_again():
    evidence = [*fives_taught(), marked(FIVES, "practice", "not_understood")]
    assert fives_next(evidence) == "guide"
    evidence = [
        *fives_taught(),
        *_missed_and_shown(3),
        marked(FIVES, "practice", "not_understood"),
    ]
    assert fives_next(evidence) == "span"
    evidence.append(marked(FIVES, "span", "correct"))
    assert fives_next(evidence) == "practice"


def test_a_shorter_count_heard_but_not_answered_is_still_owed():
    evidence = [
        *fives_taught(),
        *_missed_and_shown(3),
        marked(FIVES, "practice", "not_understood"),
        said(FIVES, "span"),
    ]
    assert fives_next(evidence) == "span"


def test_a_child_who_does_the_full_count_first_time_is_never_asked_the_shorter_one():
    evidence = [*fives_taught(), marked(FIVES, "practice", "correct")]
    assert fives_next(evidence) == "assess"


def test_a_child_who_cannot_do_the_shorter_count_is_helped_with_it_and_not_sent_back_to_the_full_one():
    evidence = [
        *fives_taught(),
        *[marked(FIVES, "practice", "try_again")] * 4,
        marked(FIVES, "span", "not_understood"),
    ]
    assert fives_next(evidence) == "guide"
    evidence.append(said(FIVES, "guide"))
    assert fives_next(evidence) == "span"


def test_a_child_who_still_misses_the_full_count_after_the_shorter_one_is_left_for_tomorrow():
    evidence = [
        *fives_taught(),
        *_missed_and_shown(3),
        marked(FIVES, "practice", "not_understood"),
        marked(FIVES, "span", "correct"),
        marked(FIVES, "practice", "not_understood"),
    ]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert left_for_tomorrow(PLANS, progress, "primary_4")
    assert fives_next(evidence) is None


def test_a_plan_with_no_shorter_step_helps_a_second_miss_as_before():
    evidence = [
        *taught_before_practice(),
        marked(T1, "practice", "not_understood"),
        said(T1, "guide"),
        marked(T1, "practice", "not_understood"),
    ]
    assert next_step(evidence) == "guide"


def test_the_day_is_over_once_a_lesson_is_finished_because_it_ends_by_naming_tomorrow():
    evidence = lesson(COUNT_20)
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert next_options(PLANS, progress, DAY_1, "primary_1", evidence) == []
    assert rest_move(PLANS, progress, "primary_1")["say"] == "finished"


def test_a_review_passed_ends_without_tomorrows_line_and_the_day_goes_on():
    day_one = lesson(COUNT_20)
    review = [*day_one, marked(COUNT_20, "assess", "correct", DAY_2)]
    progress = progress_by_plan(review, PLANS, DAY_2)
    options = next_options(PLANS, progress, DAY_2, "primary_1", review)
    assert options and options[0].plan_id == TWOS
    assert all(option.event_id != "retain" for option in options)


def test_a_lesson_finished_yesterday_does_not_end_today_before_it_starts():
    evidence = lesson(COUNT_20, DAY_1)
    progress = progress_by_plan(evidence, PLANS, DAY_2)
    assert next_options(PLANS, progress, DAY_2, "primary_1", evidence)


def test_a_child_may_still_open_another_lesson_the_day_a_lesson_was_finished():
    evidence = lesson(COUNT_20)
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    opened = next_options(PLANS, progress, DAY_1, "primary_1", evidence, chosen=TWOS)
    assert [option.plan_id for option in opened] == [TWOS]


def test_when_nothing_is_due_the_rest_is_the_plain_finish():
    progress = progress_by_plan([], PLANS, DAY_1)
    assert rest_move(PLANS, progress, TABLE_CLASS)["say"] == "finished"


def test_a_recall_check_nobody_answered_is_asked_again_without_feedback_then_followed_by_the_teaching():
    start = [said(T1, "attention"), said(T1, "objective")]
    first = [*start, marked(T1, "recall", "not_understood")]
    assert next_step(first) == "recall"
    again = [*first, marked(T1, "recall", "not_understood")]
    assert next_step(again) == "present"


def test_a_recall_check_answered_wrongly_is_asked_again_without_the_plans_feedback_then_the_teaching_follows():
    start = [said(T1, "attention"), said(T1, "objective")]
    first = [*start, marked(T1, "recall", "try_again")]
    assert next_step(first) == "recall"
    again = [*first, marked(T1, "recall", "try_again")]
    assert next_step(again) == "present"


def test_misses_at_the_check_are_not_held_against_the_practice_that_follows():
    taught = [
        said(T1, "attention"),
        said(T1, "objective"),
        marked(T1, "recall", "not_understood"),
        marked(T1, "recall", "try_again"),
        said(T1, "present"),
        said(T1, "guide"),
        marked(T1, "practice", "try_again"),
    ]
    progress = progress_by_plan(taught, PLANS, DAY_1)
    assert (
        next_options(PLANS, progress, DAY_1, TABLE_CLASS, taught)[0].event_id
        == "practice"
    )
    assert progress[T1].failed_today["practice"] == 1


def test_a_recall_miss_owes_the_child_no_help_but_asking_again():
    start = [
        said(T1, "attention"),
        said(T1, "objective"),
        marked(T1, "recall", "try_again"),
    ]
    state = progress_by_plan(start, PLANS, DAY_1)[T1]
    assert state.guidance_owed == set() and state.rung_owed == set()


def test_a_miss_after_a_passed_check_is_asked_again_at_once():
    before = [said(T1, e) for e in ("attention", "objective")]
    failed_recall = [*before, marked(T1, "recall", "try_again")]
    heard = [*failed_recall, marked(T1, "recall", "correct")]
    taught = [*heard, said(T1, "present"), said(T1, "guide")]
    failed_practice = [*taught, marked(T1, "practice", "try_again")]
    progress = progress_by_plan(failed_practice, PLANS, DAY_1)
    offered = next_options(PLANS, progress, DAY_1, TABLE_CLASS, failed_practice)
    assert offered[0].event_id == "practice"


def test_mastery_needs_two_assessed_days_and_a_weakened_lesson_comes_before_new_material():
    day_one = [*lesson(COUNT_20), *lesson(TWOS)]
    progress = progress_by_plan(day_one, PLANS, DAY_1)
    assert not progress[COUNT_20].mastered
    assert next_new_plan(PLANS, progress, "primary_1").id == TENS
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
    assert (
        next_options(PLANS, day_three, DAY_3, "primary_1", both_days)[0].plan_id == TENS
    )


def test_a_lesson_holds_while_it_is_remembered_and_returns_weakest_first():
    done = [*lesson(COUNT_20), *lesson(TWOS)]
    progress = progress_by_plan(done, PLANS, DAY_2)
    assert next_options(PLANS, progress, DAY_2, "primary_1", done)[0].plan_id == TENS
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
    assert next_new_plan(PLANS, progress, "primary_3").id == PLACE_VALUE
    assert next_new_plan(PLANS, progress, "primary_4").id == FIVES
    after_place_value = progress_by_plan(lesson(PLACE_VALUE), PLANS, DAY_1)
    assert next_new_plan(PLANS, after_place_value, "primary_3").id == T1
    after_table_one = progress_by_plan(
        [*lesson(PLACE_VALUE), *lesson(T1)], PLANS, DAY_1
    )
    assert next_new_plan(PLANS, after_table_one, "primary_3").id == T2
    after_two = progress_by_plan(
        [*lesson(PLACE_VALUE), *lesson(T1), *lesson(T2)], PLANS, DAY_1
    )
    assert next_new_plan(PLANS, after_two, "primary_3").id == T3


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
        Evidence(T2, "assess", DAY_1, "correct", None, None, "mul_fact_2x7_answer"),
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


def test_an_owed_fact_answered_wrongly_is_asked_again_at_once():
    partial = Evidence(T2, "practice", DAY_1, "try_again", PARTIAL_RECITATION)
    evidence = [*taught_up_to_practice(), partial]
    evidence.append(answered(T2, "practice", 2, 3, "try_again"))

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


DAYS = "mathematics.time.days-of-the-week"
WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]


def days_taught():
    return [
        said(DAYS, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]


def days_try(said_days, decision="try_again"):
    missing = [day for day in WEEK if day not in said_days]
    result = {"said": said_days, "missing": missing, "out_of_order": []}
    return Evidence(DAYS, "practice", DAY_1, decision, result)


def days_offer(evidence):
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    options = next_options(PLANS, progress, DAY_1, "primary_2", evidence)
    return options[0]


def _asked(offer, plan=DAYS, event="practice"):
    return event_move(
        PLANS[plan], PLANS[plan].event(event), offer.why, (), offer.variant
    )


def test_a_list_that_broke_is_repaired_by_asking_for_the_item_it_broke_at_then_from_the_last_right_one():
    broke = [*days_taught(), days_try(WEEK[:5])]
    offer = days_offer(broke)
    assert (offer.event_id, offer.variant) == ("practice", ("probe", "friday"))
    asked = _asked(offer)
    assert asked["say_text"]["en"] == "What comes after Thursday?"
    assert asked["activity"] == {
        "kind": "answer",
        "prompt_id": f"probe.{DAYS}.practice.friday",
    }

    knew = [*broke, _side("probe", "friday", "correct")]
    offer = days_offer(knew)
    assert offer.variant == ("repair", "friday")
    asked = _asked(offer)
    assert asked["say_text"]["en"] == "Start from Thursday. Count on to Saturday."
    assert asked["activity"]["prompt_id"] == f"repair.{DAYS}.practice.friday"


def _side(how, item, decision):
    return Evidence(
        DAYS, "practice", DAY_1, decision, None, None, f"{how}.{DAYS}.practice.{item}"
    )


def test_a_child_who_cannot_give_the_item_is_told_it_to_say_and_then_asked_the_list_from_the_last_right_one():
    broke = [*days_taught(), days_try(WEEK[:5])]
    missed = [*broke, _side("probe", "friday", "try_again")]
    offer = days_offer(missed)
    assert offer.variant == ("show", "friday")
    assert _asked(offer)["say_text"]["en"] == "After Thursday comes Friday. Say Friday."
    shown = [*missed, _side("show", "friday", "correct")]
    assert days_offer(shown).variant == ("repair", "friday")


def test_what_is_asked_on_the_way_back_to_the_list_earns_nothing_towards_it():
    broke = [*days_taught(), days_try(WEEK[:5])]
    state = progress_by_plan(
        [*broke, _side("probe", "friday", "correct")], PLANS, DAY_1
    )[DAYS]
    assert "practice" in state.retry_today and "practice" not in state.assessed_days
    state = progress_by_plan(
        [*broke, _side("show", "friday", "correct")], PLANS, DAY_1
    )[DAYS]
    assert "practice" in state.retry_today and state.failed_today["practice"] == 1


def test_an_answer_that_names_a_different_break_than_the_real_one_is_ignored():
    broke = [*days_taught(), days_try(WEEK[:5])]
    state = progress_by_plan(
        [*broke, _side("probe", "saturday", "correct")], PLANS, DAY_1
    )[DAYS]
    assert state.probed == {}
    assert days_offer([*broke, _side("probe", "saturday", "correct")]).variant == (
        "probe",
        "friday",
    )


def test_a_probe_nobody_could_hear_is_asked_again_and_a_break_further_on_is_probed_anew():
    unheard = Evidence(
        DAYS,
        "practice",
        DAY_1,
        "not_understood",
        None,
        None,
        f"probe.{DAYS}.practice.friday",
        "unheard",
        "garbled",
    )
    broke = [*days_taught(), days_try(WEEK[:5])]
    assert days_offer([*broke, unheard]).variant == ("probe", "friday")
    again = [*broke, _side("probe", "friday", "correct"), days_try(WEEK[:6])]
    assert days_offer(again).variant == ("probe", "saturday")


def test_the_whole_list_got_right_ends_the_way_back():
    broke = [*days_taught(), days_try(WEEK[:5]), _side("probe", "friday", "correct")]
    done = [*broke, Evidence(DAYS, "practice", DAY_1, "correct")]
    state = progress_by_plan(done, PLANS, DAY_1)[DAYS]
    assert state.probed == {} and state.resume_at == {} and state.shown == {}


def test_the_plans_general_feedback_is_not_played_when_the_teacher_named_where_it_broke():
    assert days_offer([*days_taught(), days_try(WEEK[:5])]).event_id == "practice"


def test_a_list_with_nothing_right_is_asked_whole_again():
    offer = days_offer([*days_taught(), days_try([])])
    assert (offer.event_id, offer.resume) == ("practice", None)


def test_a_list_got_right_on_the_second_try_is_asked_whole_no_more():
    evidence = [
        *days_taught(),
        days_try(WEEK[:5]),
        Evidence(DAYS, "practice", DAY_1, "correct"),
    ]
    assert days_offer(evidence).event_id == "assess"


def test_after_the_shorter_step_the_list_is_asked_again_from_where_it_broke():
    evidence = [
        *days_taught(),
        days_try(WEEK[:3]),
        days_try(WEEK[:3]),
        Evidence(DAYS, "span", DAY_1, "correct"),
    ]
    offer = days_offer(evidence)
    assert (offer.event_id, offer.variant) == ("practice", ("probe", "wednesday"))


def test_a_repair_prompt_is_marked_over_the_rest_of_the_list_from_the_last_item_right():
    from app.voice.exercises import exercise_by_prompt_id
    from app.voice.expectation import expectation

    prompt = f"repair.{DAYS}.practice.friday"
    marking = expectation(exercise_by_prompt_id(prompt))
    assert marking["kind"] == "sequence"
    assert [item["id"] for item in marking["items"]] == ["friday", "saturday"]
    assert [item["id"] for item in marking["before"]] == WEEK[:5]
    assert marking["item"] == f"plan.{DAYS}.practice"
    assert exercise_by_prompt_id(f"repair.{DAYS}.practice.sunday") is None


def _try(event_id, said_days, decision="try_again"):
    missing = [day for day in WEEK if day not in said_days]
    result = {"said": said_days, "missing": missing, "out_of_order": []}
    return Evidence(DAYS, event_id, DAY_1, decision, result)


def test_only_the_childs_own_try_at_a_list_is_repaired_not_the_check_the_guide_or_the_step():
    taught = days_taught()
    for event_id in ("guide", "assess", "span"):
        progress = progress_by_plan([*taught, _try(event_id, WEEK[:5])], PLANS, DAY_1)
        assert event_id not in progress[DAYS].resume_at, event_id
    progress = progress_by_plan([*taught, _try("practice", WEEK[:5])], PLANS, DAY_1)
    assert progress[DAYS].resume_at == {"practice": "friday"}


def test_a_repair_try_nobody_heard_does_not_move_the_start_back():
    evidence = [
        *days_taught(),
        _try("practice", WEEK[:5]),
        _try("practice", [], "not_understood"),
    ]
    assert progress_by_plan(evidence, PLANS, DAY_1)[DAYS].resume_at == {
        "practice": "friday"
    }


def test_a_try_that_gets_further_than_the_last_is_progress_not_a_second_miss():
    evidence = [*days_taught(), _try("practice", WEEK[:2]), _try("practice", WEEK[:5])]
    assert days_offer(evidence).event_id == "practice"
    stuck = [*days_taught(), _try("practice", WEEK[:2]), _try("practice", WEEK[:2])]
    assert days_offer(stuck).event_id == "span"


def test_a_repair_may_be_claimed_only_for_the_event_it_repairs():
    from app.voice.samples import _require_owning_event

    def claim(event_id, prompt_id):
        _require_owning_event(
            {"plan_id": DAYS, "event_id": event_id, "prompt_id": prompt_id}
        )

    claim("practice", f"repair.{DAYS}.practice.friday")
    for event_id, prompt_id in (
        ("practice", f"repair.{DAYS}.practice.sunday"),
        ("practice", f"repair.{DAYS}.assess.friday"),
        ("assess", f"repair.{DAYS}.assess.friday"),
        ("assess", f"repair.{DAYS}.practice.friday"),
        ("guide", f"repair.{DAYS}.guide.monday"),
        ("practice", "repair.no.such.plan.practice.friday"),
    ):
        with pytest.raises(ValueError):
            claim(event_id, prompt_id)


def test_a_repair_is_remembered_against_the_list_it_repairs():
    from app.voice.exercises import exercise_by_prompt_id
    from app.voice.expectation import expectation

    repaired = expectation(exercise_by_prompt_id(f"repair.{DAYS}.practice.friday"))
    whole = expectation(exercise_by_prompt_id(f"plan.{DAYS}.practice"))
    assert repaired["item"] == whole["item"]


def _repair_try(claimed, said_days, missing, decision="correct"):
    result = {"said": said_days, "missing": missing, "out_of_order": []}
    return Evidence(
        DAYS,
        "practice",
        DAY_1,
        decision,
        result,
        None,
        f"repair.{DAYS}.practice.{claimed}",
    )


def test_a_repair_claimed_from_later_than_the_try_broke_earns_nothing():
    broke = [*days_taught(), days_try(WEEK[:5])]
    cheated = [*broke, _repair_try("saturday", ["saturday"], [])]
    state = progress_by_plan(cheated, PLANS, DAY_1)[DAYS]
    assert "practice" in state.retry_today and "practice" not in state.done_today
    honest = [*broke, _repair_try("friday", ["friday", "saturday"], [])]
    state = progress_by_plan(honest, PLANS, DAY_1)[DAYS]
    assert "practice" not in state.retry_today and "practice" in state.done_today


def test_a_repair_nobody_heard_leaves_the_start_where_it_was_with_the_tail_only_missing():
    evidence = [
        *days_taught(),
        days_try(WEEK[:5]),
        _repair_try("friday", [], ["friday", "saturday"], "not_understood"),
    ]
    assert progress_by_plan(evidence, PLANS, DAY_1)[DAYS].resume_at == {
        "practice": "friday"
    }


def test_going_from_nothing_right_to_something_right_is_progress_not_a_second_miss():
    state_after = progress_by_plan(
        [*days_taught(), days_try([]), days_try(WEEK[:3])], PLANS, DAY_1
    )[DAYS]
    assert state_after.failed_today["practice"] == 0
    assert (
        days_offer([*days_taught(), days_try([]), days_try(WEEK[:3])]).event_id
        != "span"
    )


def test_naming_where_it_broke_records_the_item_it_broke_at():
    state = progress_by_plan([*days_taught(), days_try(WEEK[:5])], PLANS, DAY_1)[DAYS]
    assert state.resume_at == {"practice": "friday"}


def test_an_answer_to_the_guided_step_is_known_to_be_said_after_the_teacher():
    from app.voice.worker_evaluation import _was_modelled

    assert _was_modelled(
        {"plan_id": "mathematics.time.days-of-the-week", "event_id": "guide"}
    )
    assert not _was_modelled(
        {"plan_id": "mathematics.time.days-of-the-week", "event_id": "practice"}
    )
    assert not _was_modelled(
        {"plan_id": "mathematics.time.days-of-the-week", "event_id": "assess"}
    )
    assert not _was_modelled({"plan_id": "no.such.plan", "event_id": "guide"})
    assert not _was_modelled({})


def _assess(day, decision="correct"):
    return Evidence(COUNT_20, "assess", day, decision)


def test_a_lesson_is_known_only_when_the_check_was_passed_alone_on_two_days():
    first_try = [
        Evidence(COUNT_20, "assess", DAY_1, "correct"),
        Evidence(COUNT_20, "assess", DAY_2, "correct"),
    ]
    state = progress_by_plan(first_try, PLANS, DAY_2)[COUNT_20]
    assert state.mastered and len(state.independent_days) == 2


def test_a_check_passed_on_a_second_try_is_progress_but_not_a_lesson_learnt():
    missed_then_right = [
        _assess(DAY_1, "try_again"),
        _assess(DAY_1),
        _assess(DAY_2, "try_again"),
        _assess(DAY_2),
    ]
    state = progress_by_plan(missed_then_right, PLANS, DAY_2)[COUNT_20]
    assert state.supported_days == {DAY_1, DAY_2}
    assert state.assessed_days == set() and state.independent_days == set()
    assert not state.mastered


def test_what_helped_an_answer_decides_what_it_shows():
    event = PLANS[DAYS].event
    from app.voice.teacher import support_of

    guide, practice, span = event("guide"), event("practice"), event("span")
    answer = Evidence(DAYS, "practice", DAY_1, "correct")
    repaired = Evidence(
        DAYS, "practice", DAY_1, "correct", None, None, f"repair.{DAYS}.practice.friday"
    )
    assert support_of(guide, answer, 1) == "modelled"
    assert support_of(span, answer, 1) == "reduced"
    assert support_of(practice, repaired, 1) == "narrowed"
    assert support_of(practice, answer, 2) == "after_help"
    assert support_of(practice, answer, 1) == "independent"


def test_a_repaired_try_is_never_the_check_and_never_counts_towards_knowing_it():
    state = progress_by_plan(
        [
            Evidence(
                DAYS,
                "practice",
                DAY_1,
                "try_again",
                {"said": WEEK[:5], "missing": WEEK[5:], "out_of_order": []},
            ),
            Evidence(
                DAYS,
                "practice",
                DAY_1,
                "correct",
                None,
                None,
                f"repair.{DAYS}.practice.friday",
            ),
        ],
        PLANS,
        DAY_1,
    )[DAYS]
    assert state.independent_days == set() and state.assessed_days == set()


def _unheard_try(event_id, kind="garbled", plan=COUNT_20):
    return Evidence(
        plan, event_id, DAY_1, "not_understood", None, None, None, "unheard", kind
    )


def test_a_recording_that_could_not_be_heard_before_a_pass_does_not_make_the_pass_a_helped_one():
    state = progress_by_plan(
        [_unheard_try("assess"), Evidence(COUNT_20, "assess", DAY_1, "correct")],
        PLANS,
        DAY_1,
    )[COUNT_20]
    assert state.independent_days == {DAY_1} and state.assessed_days == {DAY_1}


def test_a_child_who_said_they_do_not_know_has_tried():
    state = progress_by_plan(
        [
            _unheard_try("assess", "dont_know"),
            Evidence(COUNT_20, "assess", DAY_1, "correct"),
        ],
        PLANS,
        DAY_1,
    )[COUNT_20]
    assert state.supported_days == {DAY_1} and state.independent_days == set()


def test_a_recording_that_could_not_be_heard_is_no_miss_owes_no_help_and_is_asked_again():
    taught = [
        said(COUNT_20, e)
        for e in ("attention", "objective", "recall", "present", "guide")
    ]
    state = progress_by_plan([*taught, _unheard_try("practice")], PLANS, DAY_1)[
        COUNT_20
    ]
    assert "practice" not in state.failed_today
    assert state.guidance_owed == set() and state.rung_owed == set()
    assert "practice" in state.retry_today and "practice" not in state.done_today
    assert not state.paused_today


def test_a_child_who_cannot_be_heard_again_and_again_is_sent_home_kindly_not_marked_wrong():
    taught = [
        said(COUNT_20, e)
        for e in ("attention", "objective", "recall", "present", "guide")
    ]
    three = [*taught, *[_unheard_try("practice")] * 3]
    assert not progress_by_plan(three, PLANS, DAY_1)[COUNT_20].paused_today
    four = [*three, _unheard_try("practice")]
    state = progress_by_plan(four, PLANS, DAY_1)[COUNT_20]
    assert state.paused_today and "practice" not in state.failed_today
    heard_between = [
        *three,
        Evidence(COUNT_20, "practice", DAY_1, "try_again"),
        _unheard_try("practice"),
    ]
    assert not progress_by_plan(heard_between, PLANS, DAY_1)[COUNT_20].paused_today


def test_a_lesson_passed_only_with_help_is_not_learnt_and_earns_no_day_towards_its_badge():
    from app.voice.teacher import catalogue

    turns = [
        _assess(DAY_1, "try_again"),
        _assess(DAY_1),
        _assess(DAY_2, "try_again"),
        _assess(DAY_2),
    ]
    progress = progress_by_plan(turns, PLANS, DAY_2)
    rows = {
        row["plan_id"]: row
        for row in catalogue(PLANS, progress, DAY_2, "primary_1", None)
    }
    assert rows[COUNT_20]["standing"] == "started"
    assert rows[COUNT_20]["days_correct"] == 0


def test_the_check_passed_alone_the_next_day_completes_a_lesson_that_was_only_passed_with_help():
    helped = [_assess(DAY_1, "try_again"), _assess(DAY_1)]
    assert progress_by_plan(helped, PLANS, DAY_1)[COUNT_20].supported_today
    alone = [*helped, Evidence(COUNT_20, "assess", DAY_2, "correct")]
    state = progress_by_plan(alone, PLANS, DAY_2)[COUNT_20]
    assert state.assessed_days == {DAY_2} and state.independent_days == {DAY_2}
    assert not state.supported_today and state.supported_days == {DAY_1}


def test_a_lesson_passed_only_with_help_unlocks_the_lesson_that_needs_it_only_after_two_such_days():
    helped = [_assess(DAY_1, "try_again"), _assess(DAY_1)]
    assert not progress_by_plan(helped, PLANS, DAY_2)[COUNT_20].unlocks
    twice = [*helped, _assess(DAY_2, "try_again"), _assess(DAY_2)]
    assert progress_by_plan(twice, PLANS, DAY_3)[COUNT_20].unlocks
    alone = [*helped, Evidence(COUNT_20, "assess", DAY_2, "correct")]
    assert progress_by_plan(alone, PLANS, DAY_3)[COUNT_20].unlocks
    place = "mathematics.number.place-value-tens-and-units"
    learnt_elsewhere = [e for plan in (TWOS, TENS) for e in lesson(plan, DAY_1)]
    blocked = progress_by_plan([*helped, *learnt_elsewhere], PLANS, DAY_2)
    assert next_new_plan(PLANS, blocked, "primary_1").id != place
    open_ = progress_by_plan([*twice, *learnt_elsewhere], PLANS, DAY_3)
    assert next_new_plan(PLANS, open_, "primary_1").id == place


def test_the_day_after_a_check_passed_with_help_the_check_is_asked_again_on_its_own_and_not_the_lesson():
    helped = [*lesson(COUNT_20, DAY_1, "try_again"), _assess(DAY_1)]
    progress = progress_by_plan(helped, PLANS, DAY_2)
    options = next_options(PLANS, progress, DAY_2, "primary_1", helped)
    assert [(o.plan_id, o.event_id) for o in options] == [(COUNT_20, "assess")]
    weak = next_options(
        PLANS, progress, DAY_2, "primary_1", helped, weakened=(COUNT_20,)
    )
    assert [(o.plan_id, o.event_id) for o in weak] == [(COUNT_20, "assess")]


def test_one_miss_and_then_a_pass_at_the_check_closes_the_day_with_a_check_tomorrow():
    taught = [
        said(COUNT_20, e)
        for e in (
            "attention",
            "objective",
            "recall",
            "present",
            "guide",
            "span",
            "practice",
        )
    ]
    evidence = [*taught, _assess(DAY_1, "try_again"), _assess(DAY_1)]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    assert progress[COUNT_20].paused_today and progress[COUNT_20].paused_days == set()
    assert next_options(PLANS, progress, DAY_1, "primary_1", evidence) == []
    assert rest_move(PLANS, progress, "primary_1")["say"] == "check-tomorrow"


def test_a_review_of_a_lesson_learnt_before_that_took_a_second_try_does_not_end_the_day():
    learnt = lesson(COUNT_20, DAY_1)
    review = [*learnt, _assess(DAY_2, "try_again"), _assess(DAY_2)]
    progress = progress_by_plan(review, PLANS, DAY_2)
    state = progress[COUNT_20]
    assert state.assessed_today and not state.paused_today
    assert DAY_2 in state.assessed_days and DAY_2 not in state.independent_days
    assert not left_for_tomorrow(PLANS, progress, "primary_1")


ECHO_DAYS = f"echo.{DAYS}.recall"


def _recall(decision, said_days=None, plan=DAYS, prompt_id=None):
    result = (
        None
        if said_days is None
        else {"said": said_days, "missing": WEEK[:3], "out_of_order": []}
    )
    return Evidence(plan, "recall", DAY_1, decision, result, None, prompt_id)


def _opening(plan=DAYS):
    return [said(plan, "attention"), said(plan, "objective")]


def _offer(evidence, plan_id=DAYS, learner_class="primary_2"):
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    options = next_options(PLANS, progress, DAY_1, learner_class, evidence)
    return (options[0] if options else None), progress


def test_nothing_right_twice_at_the_check_owes_the_answer_said_after_the_teacher():
    one = [*_opening(), _recall("not_understood")]
    assert _offer(one)[0].echo is False
    two = [*one, _recall("not_understood")]
    offer, _ = _offer(two)
    assert (offer.event_id, offer.echo) == ("recall", True)
    move = event_move(
        PLANS[DAYS], PLANS[DAYS].event("recall"), offer.why, (), offer.variant
    )
    assert move["say_text"]["en"] == "Say it after me: Sunday, Monday, Tuesday."
    assert move["activity"] == {"kind": "sequence", "prompt_id": ECHO_DAYS}


def test_a_wrong_answer_is_the_same_evidence_as_not_knowing():
    wrong = [*_opening(FIVES), _recall("try_again", plan=FIVES)] * 1
    wrong = [*wrong, _recall("try_again", plan=FIVES)]
    offer, _ = _offer(wrong, FIVES, "primary_4")
    assert (offer.event_id, offer.echo) == ("recall", True)
    move = event_move(
        PLANS[FIVES], PLANS[FIVES].event("recall"), offer.why, (), offer.variant
    )
    assert move["say_text"]["en"] == "Listen: ten. Now you say ten."
    assert move["activity"]["kind"] == "answer"


def test_a_child_who_got_some_of_it_right_twice_is_taught_not_given_the_answer():
    partly = [
        *_opening(),
        _recall("try_again", ["sunday"]),
        _recall("try_again", ["sunday"]),
    ]
    offer, _ = _offer(partly)
    assert offer.echo is False and offer.event_id != "recall"


def test_after_the_answer_is_said_the_check_is_asked_again_and_a_pass_goes_on_to_the_teaching():
    said_after = [
        *_opening(),
        _recall("not_understood"),
        _recall("not_understood"),
        _recall("correct", WEEK[:3], prompt_id=ECHO_DAYS),
    ]
    offer, _ = _offer(said_after)
    assert (offer.event_id, offer.echo) == ("recall", False)
    passed = [*said_after, _recall("correct", WEEK[:3])]
    offer, progress = _offer(passed)
    assert offer.event_id == "present"
    assert not progress[DAYS].paused_today


def test_a_check_that_still_draws_nothing_after_the_answer_leaves_the_lesson_for_tomorrow():
    evidence = [
        *_opening(),
        _recall("not_understood"),
        _recall("not_understood"),
        _recall("not_understood", [], prompt_id=ECHO_DAYS),
        _recall("not_understood"),
    ]
    offer, progress = _offer(evidence)
    assert offer is None and left_for_tomorrow(PLANS, progress, "primary_2")
    assert rest_move(PLANS, progress, "primary_2")["say"] == "try-tomorrow"


def test_a_check_the_plan_does_not_define_is_never_echoed():
    start = [said(T1, "attention"), said(T1, "objective")]
    evidence = [
        *start,
        marked(T1, "recall", "not_understood"),
        marked(T1, "recall", "not_understood"),
    ]
    assert next_step(evidence) == "present"


def test_the_answer_said_after_the_teacher_is_claimed_for_the_check_and_nothing_else():
    from app.voice.samples import _require_owning_event

    _require_owning_event(
        {"plan_id": DAYS, "event_id": "recall", "prompt_id": ECHO_DAYS}
    )
    for event_id in ("practice", "assess", "guide"):
        with pytest.raises(ValueError):
            _require_owning_event(
                {"plan_id": DAYS, "event_id": event_id, "prompt_id": ECHO_DAYS}
            )


def test_the_answer_said_after_the_teacher_is_marked_as_the_check_is_and_known_as_modelled():
    from app.voice.exercises import exercise_by_prompt_id
    from app.voice.expectation import expectation
    from app.voice.worker_evaluation import _was_modelled

    marking = expectation(exercise_by_prompt_id(ECHO_DAYS))
    assert [item["id"] for item in marking["items"]] == WEEK[:3]
    assert marking["item"] == f"plan.{DAYS}.recall"
    answer = expectation(exercise_by_prompt_id(f"echo.{FIVES}.recall"))
    assert answer["kind"] == "fact" and "ten" in answer["accept"]
    assert _was_modelled(
        {"plan_id": DAYS, "event_id": "recall", "prompt_id": ECHO_DAYS}
    )
    assert not _was_modelled(
        {"plan_id": DAYS, "event_id": "recall", "prompt_id": f"plan.{DAYS}.recall"}
    )


def test_a_choice_among_several_steps_keeps_what_the_chosen_one_asks():
    from app.voice.teacher import Option, parse_choice

    options = [
        Option(DAYS, "recall", "a", (), ("echo", "")),
        Option(DAYS, "practice", "b", (), ("repair", "friday")),
    ]

    def said(step, reason):
        return {"choices": [{"message": {"content": {"step": step, "reason": reason}}}]}

    first = parse_choice(said(1, "x"), options)
    second = parse_choice(said(2, "y"), options)
    assert (first.echo, first.resume) == (True, None)
    assert (second.echo, second.resume) == (False, "friday")


def test_what_was_asked_of_the_child_is_what_the_tutor_is_told_it_was():
    from app.voice.worker_evaluation import _asked_line

    assert (
        _asked_line({"prompt_id": ECHO_DAYS}, "en")
        == "Say it after me: Sunday, Monday, Tuesday."
    )
    repair = f"repair.{DAYS}.practice.friday"
    assert (
        _asked_line({"prompt_id": repair}, "en")
        == "Start from Thursday. Count on to Saturday."
    )
    assert _asked_line({"prompt_id": "echo.no.such.recall"}, "en") == ""


def test_an_echoed_check_longer_than_the_teacher_says_lets_the_child_count_on():
    from app.voice.exercises import exercise_by_prompt_id
    from app.voice.expectation import expectation

    place = "mathematics.number.place-value-tens-and-units"
    marking = expectation(exercise_by_prompt_id(f"echo.{place}.recall"))
    assert [item["id"] for item in marking["items"]] == ["1", "2", "3", "4", "5", "6"]
    assert [item["id"] for item in marking["more"]] == ["7", "8", "9", "10"]


def test_what_the_child_showed_yesterday_is_not_held_against_them_today():
    yesterday = [
        Evidence(DAYS, "recall", DAY_1, "not_understood"),
        Evidence(DAYS, "recall", DAY_1, "not_understood"),
    ]
    progress = progress_by_plan(yesterday, PLANS, DAY_2)
    assert progress[DAYS].blank_recall == {}
    options = next_options(PLANS, progress, DAY_2, "primary_2", yesterday)
    assert options and not options[0].echo


def test_a_right_answer_ends_a_run_of_nothing_right():
    evidence = [
        *_opening(),
        _recall("not_understood"),
        _recall("correct", ["sunday", "monday", "tuesday"]),
        _recall("not_understood"),
    ]
    offer, _ = _offer(evidence)
    assert offer.echo is False


def test_an_echo_that_arrives_late_does_not_reopen_a_check_the_child_passed():
    evidence = [
        *_opening(),
        _recall("not_understood"),
        _recall("not_understood"),
        _recall("correct", WEEK[:3], prompt_id=ECHO_DAYS),
        _recall("correct", WEEK[:3]),
        _recall("correct", WEEK[:3], prompt_id=ECHO_DAYS),
    ]
    offer, progress = _offer(evidence)
    assert offer.event_id == "present" and not progress[DAYS].paused_today


def test_the_item_a_list_broke_at_can_be_claimed_only_for_that_list_and_never_for_its_first_item():
    from app.voice.samples import _require_owning_event

    def claim(event_id, prompt_id):
        _require_owning_event(
            {"plan_id": DAYS, "event_id": event_id, "prompt_id": prompt_id}
        )

    claim("practice", f"probe.{DAYS}.practice.friday")
    claim("practice", f"show.{DAYS}.practice.friday")
    for event_id, prompt_id in (
        ("practice", f"probe.{DAYS}.practice.sunday"),
        ("assess", f"probe.{DAYS}.assess.friday"),
        ("assess", f"probe.{DAYS}.practice.friday"),
        ("guide", f"show.{DAYS}.guide.monday"),
        ("practice", f"show.{DAYS}.assess.friday"),
    ):
        with pytest.raises(ValueError):
            claim(event_id, prompt_id)


def test_the_item_asked_for_is_marked_as_one_answer_and_only_what_was_shown_is_known_as_modelled():
    from app.voice.exercises import exercise_by_prompt_id
    from app.voice.expectation import expectation
    from app.voice.worker_evaluation import _was_modelled

    for how in ("probe", "show"):
        marking = expectation(exercise_by_prompt_id(f"{how}.{DAYS}.practice.friday"))
        assert marking["kind"] == "fact" and "friday" in marking["accept"]
    meta = {"plan_id": DAYS, "event_id": "practice"}
    assert _was_modelled(meta | {"prompt_id": f"show.{DAYS}.practice.friday"})
    assert not _was_modelled(meta | {"prompt_id": f"probe.{DAYS}.practice.friday"})


PRIMES = "mathematics.number.prime-numbers"


def test_a_list_with_no_rule_to_ask_by_goes_straight_to_being_told():
    from app.voice.curriculum import probeable

    assert not probeable(PLANS[PRIMES].event("practice"))
    assert probeable(PLANS[DAYS].event("practice"))
    assert probeable(PLANS[COUNT_20].event("practice"))
    broke = {
        "said": ["2", "3"],
        "missing": ["5", "7", "11", "13", "17", "19"],
        "out_of_order": [],
    }
    evidence = [
        *[
            said(PRIMES, e)
            for e in ("attention", "objective", "recall", "present", "guide")
        ],
        Evidence(PRIMES, "practice", DAY_1, "try_again", broke),
    ]
    progress = progress_by_plan(evidence, PLANS, DAY_1)
    options = next_options(PLANS, progress, DAY_1, "primary_5", evidence)
    assert options[0].variant == ("show", "5")


def test_a_probe_nobody_asked_changes_nothing_about_the_event():
    forged = [*days_taught(), _side("probe", "friday", "correct")]
    state = progress_by_plan(forged, PLANS, DAY_1)[DAYS]
    assert "practice" not in state.done_today or state.done_today == {
        "attention",
        "objective",
        "recall",
        "present",
        "guide",
    }
    assert days_offer(forged).event_id == "practice"
    done = [*days_taught(), Evidence(DAYS, "practice", DAY_1, "correct")]
    after = [
        *done,
        Evidence(
            DAYS,
            "practice",
            DAY_1,
            "not_understood",
            None,
            None,
            f"show.{DAYS}.practice.friday",
            "unheard",
            "garbled",
        ),
    ]
    assert days_offer(after).event_id == "assess"


def test_an_echo_nobody_could_hear_does_not_reopen_a_check_that_was_passed():
    passed = [*_opening(), _recall("correct", WEEK[:3])]
    noise = Evidence(
        DAYS,
        "recall",
        DAY_1,
        "not_understood",
        None,
        None,
        ECHO_DAYS,
        "unheard",
        "garbled",
    )
    offer, _ = _offer([*passed, noise])
    assert offer.event_id == "present"


def test_a_heard_probe_ends_the_run_of_recordings_nobody_could_hear():
    def noise():
        return Evidence(
            DAYS,
            "practice",
            DAY_1,
            "not_understood",
            None,
            None,
            f"probe.{DAYS}.practice.friday",
            "unheard",
            "garbled",
        )

    broke = [*days_taught(), days_try(WEEK[:5])]
    heard = [
        *broke,
        noise(),
        noise(),
        noise(),
        _side("probe", "friday", "try_again"),
        noise(),
    ]
    assert not progress_by_plan(heard, PLANS, DAY_1)[DAYS].paused_today
    four = [*broke, noise(), noise(), noise(), noise()]
    assert progress_by_plan(four, PLANS, DAY_1)[DAYS].paused_today


def test_what_the_child_was_asked_is_what_the_tutor_is_told_it_was_for_a_probe_and_a_show():
    from app.voice.worker_evaluation import _asked_line, _support_asked

    probe, show = f"probe.{DAYS}.practice.friday", f"show.{DAYS}.practice.friday"
    assert _asked_line({"prompt_id": probe}, "en") == "What comes after Thursday?"
    assert (
        _asked_line({"prompt_id": show}, "en")
        == "After Thursday comes Friday. Say Friday."
    )
    meta = {"plan_id": DAYS, "event_id": "practice"}
    assert _support_asked(meta | {"prompt_id": probe}) == {"support": "probed"}
    assert _support_asked(meta | {"prompt_id": show}) == {"support": "modelled"}
    assert _support_asked(meta | {"prompt_id": f"plan.{DAYS}.practice"}) == {}


def test_yesterdays_probe_is_not_counted_today():
    broke = [*days_taught(), days_try(WEEK[:5])]
    yesterday = Evidence(
        DAYS, "practice", DAY_1, "correct", None, None, f"probe.{DAYS}.practice.friday"
    )
    progress = progress_by_plan([*broke, yesterday], PLANS, DAY_2)
    assert progress[DAYS].probed == {}


def _fives_taught():
    return [
        said(FIVES, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]


def _wrong(event, n=1):
    return [Evidence(FIVES, event, DAY_1, "try_again") for _ in range(n)]


def test_each_miss_where_the_plan_has_hints_is_asked_again_until_the_answer_has_been_told():
    taught = _fives_taught()
    for misses in (1, 2, 3):
        evidence = [*taught, *_wrong("practice", misses)]
        progress = progress_by_plan(evidence, PLANS, DAY_1)
        assert not progress[FIVES].paused_today, misses
        offer = next_options(PLANS, progress, DAY_1, "primary_4", evidence)[0]
        assert offer.event_id == "practice", misses


def test_after_the_answer_was_told_a_child_who_misses_again_is_given_the_shorter_step_then_sent_home():
    taught = _fives_taught()
    four = [*taught, *_wrong("practice", 4)]
    progress = progress_by_plan(four, PLANS, DAY_1)
    offer = next_options(PLANS, progress, DAY_1, "primary_4", four)[0]
    assert offer.event_id == "span"
    five = [*taught, *_wrong("practice", 5)]
    assert progress_by_plan(five, PLANS, DAY_1)[FIVES].paused_today


def test_a_plan_without_hints_is_helped_after_two_misses_and_sent_home_after_three_as_before():
    taught = [
        said(T1, e) for e in ("attention", "objective", "recall", "present", "guide")
    ]
    two = [
        *taught,
        marked(T1, "practice", "try_again"),
        marked(T1, "practice", "try_again"),
    ]
    assert next_step(two) == "guide"
    three = [*two, said(T1, "guide"), marked(T1, "practice", "try_again")]
    assert progress_by_plan(three, PLANS, DAY_1)[T1].paused_today
