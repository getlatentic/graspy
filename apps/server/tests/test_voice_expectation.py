from app.voice.exercises import exercise_by_prompt_id, plan_exercise
from app.voice.expectation import expectation


def test_one_fact_is_named_by_the_fact_it_asks_for():
    asked = expectation(exercise_by_prompt_id("mul_fact_6x7_answer"))

    assert asked == {"kind": "fact", "item": "6x7"}


def test_a_whole_table_carries_every_fact_it_asks_for():
    asked = expectation(exercise_by_prompt_id("mul_table_2_recite_1_12"))

    assert asked["kind"] == "recitation"
    assert asked["table"] == 2
    assert asked["multipliers"] == list(range(1, 13))
    assert asked["item"] == "table-2"


def test_a_targeted_recitation_asks_for_only_its_own_facts():
    asked = expectation(exercise_by_prompt_id("mul_table_2_recite_facts_3-7-11"))

    assert asked["multipliers"] == [3, 7, 11]


def test_the_seven_times_eight_prompt_is_that_one_fact():
    assert expectation(exercise_by_prompt_id("mul_7x8_explain")) == {
        "kind": "fact",
        "item": "7x8",
    }


COUNTING = "plan.mathematics.number.counting-to-ten.recall"
LETTER_SOUNDS = "plan.english.alphabet.letter-sounds.practice"


def test_a_list_carries_every_way_a_child_may_say_each_item():
    asked = expectation(plan_exercise(COUNTING))

    exercise = plan_exercise(COUNTING)

    assert asked["kind"] == "sequence"
    assert asked["item"] == COUNTING
    assert [item["id"] for item in asked["items"]] == [
        item.id for item in exercise.items
    ]
    for item in asked["items"]:
        assert item["spoken"], f"{item['id']} has no spelling a child could say"


def test_a_word_answer_brings_the_spellings_a_child_may_use():
    asked = expectation(plan_exercise(LETTER_SOUNDS))

    assert asked["kind"] == "fact"
    assert asked["item"] in asked["accept"]
    assert len(asked["accept"]) > 1
