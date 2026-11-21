"""Skills in effect across turns: kept by name in the conversation, their text
put into the tutor's input by the server, with no model call of its own."""

import logging

from stand_in import inputs, stand_in
from test_tutor import MATHS, finish

from app.agent.memory import Exchange, InMemoryConversationStore
from app.agent.reply import Outcome
from app.agent.skills.active import (
    MAX_ACTIVE,
    MAX_AGE_TURNS,
    NONE_IN_EFFECT,
    active_names,
    rendered,
    still_shipped,
)
from app.agent.skills.load import load_skill_for_turn
from app.agent.skills.registry import skills
from app.agent.skills.skill import MAX_BODY_WORDS
from app.agent.summary import recalled
from app.agent.tutor import Tutor, TutorReply

MISTAKE = "explaining-a-mistake"
EXAMPLE = "worked-example"
CHECK = "checking-understanding"
TOPIC = "Number Systems"


def turn(*names: str, topic: str = TOPIC) -> Exchange:
    kept = Exchange(message="m", answer="a")
    if names:
        kept["skills"] = list(names)
        kept["topic"] = topic
    return kept


def test_a_skill_loaded_last_turn_is_in_effect():
    assert active_names([turn(MISTAKE)], TOPIC) == (MISTAKE,)


def test_nothing_is_in_effect_when_nothing_was_loaded():
    assert active_names([turn(), turn()], TOPIC) == ()


def test_at_most_two_are_in_effect_and_the_most_recent_win():
    exchanges = [turn(CHECK), turn(EXAMPLE), turn(MISTAKE)]

    assert MAX_ACTIVE == 2
    assert active_names(exchanges, TOPIC) == (MISTAKE, EXAMPLE)


def test_two_skills_of_one_turn_are_both_in_effect_the_later_first():
    assert active_names([turn(EXAMPLE, MISTAKE)], TOPIC) == (MISTAKE, EXAMPLE)


def test_a_skill_expires_after_a_few_turns_without_a_reload():
    young = [turn(MISTAKE)] + [turn() for _ in range(MAX_AGE_TURNS - 1)]
    old = [turn(MISTAKE)] + [turn() for _ in range(MAX_AGE_TURNS)]

    assert active_names(young, TOPIC) == (MISTAKE,)
    assert active_names(old, TOPIC) == ()


def test_a_reload_keeps_a_skill_in_effect():
    exchanges = [turn(MISTAKE), turn(), turn(), turn(MISTAKE), turn()]

    assert active_names(exchanges, TOPIC) == (MISTAKE,)


def test_a_skill_loaded_on_another_topic_is_not_in_effect():
    assert active_names([turn(MISTAKE, topic="Fractions")], TOPIC) == ()
    assert active_names([turn(MISTAKE, topic="")], None) == (MISTAKE,)


def test_a_skill_removed_in_a_deploy_is_dropped_with_a_log_line(caplog):
    with caplog.at_level(logging.INFO):
        kept = still_shipped(["removed-skill", MISTAKE])

    assert kept == (MISTAKE,)
    assert "removed-skill" in caplog.text


def test_the_text_in_effect_is_each_skills_current_body_within_the_bounds():
    text = rendered((MISTAKE, EXAMPLE))

    assert skills()[MISTAKE].body in text and skills()[EXAMPLE].body in text
    assert len(text.split()) <= MAX_ACTIVE * (MAX_BODY_WORDS + 6)
    assert rendered(()) == NONE_IN_EFFECT


def test_loading_a_skill_in_effect_is_told_to_use_it_and_still_counts_as_loaded():
    result = load_skill_for_turn([MISTAKE])(MISTAKE)

    assert isinstance(result, Outcome)
    assert result.told == {"skill": MISTAKE, "note": "Already in effect: use it."}
    assert result.skill == MISTAKE


def test_loading_another_skill_gives_its_text():
    result = load_skill_for_turn([MISTAKE])(EXAMPLE)

    assert result.told["guidance"] == skills()[EXAMPLE].body


def kept_in_effect(*names: str) -> Exchange:
    return Exchange(message="q", answer="a", skills=list(names), topic=TOPIC)


async def test_turn_two_has_the_text_in_its_input_and_asks_no_model_for_it():
    memory = InMemoryConversationStore()
    await memory.append("c", kept_in_effect(MISTAKE))
    lm, context = stand_in(finish("Try the next step."))

    with context:
        items = [i async for i in Tutor(memory).stream("c", "3/5?", MATHS)]

    assert isinstance(items[-1], TutorReply)
    assert skills()[MISTAKE].body in inputs(lm, 0)["skills_in_effect"]
    # The tool step and the answer: no call is made to read the skill.
    assert len(lm.history) == 2


async def test_a_turn_with_nothing_in_effect_says_so():
    lm, context = stand_in(finish("Hello."))

    with context:
        async for _ in Tutor(InMemoryConversationStore()).stream("c", "hi", MATHS):
            pass

    assert inputs(lm, 0)["skills_in_effect"] == NONE_IN_EFFECT


def loads(name: str) -> list[dict]:
    return [
        {
            "next_thought": "load it",
            "next_tool_name": "load_skill",
            "next_tool_args": {"name": name},
        },
        *finish("Which step went wrong?"),
    ]


async def test_a_skill_loaded_in_a_turn_is_kept_by_name_with_the_topic():
    memory = InMemoryConversationStore()
    _, context = stand_in(loads(MISTAKE))

    with context:
        async for _ in Tutor(memory).stream("c", "I got 2/5", MATHS):
            pass

    kept = (await memory.load("c")).exchanges[-1]
    assert kept["skills"] == [MISTAKE]
    assert kept["topic"] == TOPIC
    assert skills()[MISTAKE].body not in kept["answer"]


async def test_a_skill_in_effect_that_the_tutor_loads_again_stays_in_effect():
    memory = InMemoryConversationStore()
    await memory.append("c", kept_in_effect(MISTAKE))
    _, context = stand_in(loads(MISTAKE))

    with context:
        async for _ in Tutor(memory).stream("c", "3/5?", MATHS):
            pass

    assert (await memory.load("c")).exchanges[-1]["skills"] == [MISTAKE]


async def test_the_summary_step_neither_sees_nor_drops_the_skills():
    memory = InMemoryConversationStore()
    for n in range(25):
        await memory.append("c", kept_in_effect(MISTAKE))
    lm, context = stand_in([{"updated": "A summary."}])

    with context:
        conversation = await recalled(memory, "c")

    summarised = " ".join(str(m["content"]) for m in lm.history[0]["messages"])
    assert skills()[MISTAKE].body not in summarised
    assert conversation.exchanges[-1]["skills"] == [MISTAKE]
