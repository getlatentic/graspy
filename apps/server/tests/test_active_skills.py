"""Skills in effect across turns: kept by name in the conversation, their text
put into the tutor's input by the server, with no model call of its own."""

import logging
from types import SimpleNamespace

from stand_in import inputs, stand_in
from test_tutor import MATHS, finish

from app.agent.memory import Exchange, InMemoryConversationStore
from app.agent.reply import Outcome
from app.agent.skills.active import (
    MAX_ACTIVE,
    MAX_AGE_TURNS,
    NONE_IN_EFFECT,
    in_effect,
    rendered,
    stamped,
)
from app.agent.skills.load import load_skill_for_turn
from app.agent.skills.registry import skills
from app.agent.skills.skill import MAX_BODY_WORDS
from app.agent.streaming import SkillLoaded, ToolFinished
from app.agent.summary import recalled
from app.agent.tutor import Tutor, TutorReply
from app.turns.host import TutorTurnSource
from app.turns.job import TurnJob

MISTAKE = "explaining-a-mistake"
EXAMPLE = "worked-example"
CHECK = "checking-understanding"
TOPIC = "Number Systems"


def turn(**ages: int) -> Exchange:
    """An exchange that ended with these skills in effect, at these ages."""
    kept = Exchange(message="m", answer="a")
    if ages:
        kept["skills"] = {name.replace("_", "-"): age for name, age in ages.items()}
        kept["topic"] = TOPIC
    return kept


def names(exchanges, topic=TOPIC) -> list[str]:
    return list(in_effect(exchanges, topic))


def test_a_skill_loaded_last_turn_is_in_effect_one_turn_old():
    assert in_effect([turn(explaining_a_mistake=0)], TOPIC) == {MISTAKE: 1}


def test_nothing_is_in_effect_when_nothing_was_loaded():
    assert in_effect([turn(), turn()], TOPIC) == {}
    assert in_effect([], TOPIC) == {}


def test_at_most_two_are_in_effect_and_the_most_recently_loaded_win():
    last = turn(checking_understanding=0, worked_example=1, explaining_a_mistake=2)

    assert MAX_ACTIVE == 2
    assert names([last]) == [CHECK, EXAMPLE]


def test_a_skill_removed_in_a_deploy_takes_no_slot(caplog):
    last = turn(explaining_a_mistake=0, removed=1, worked_example=2)

    with caplog.at_level(logging.INFO):
        found = names([last])

    assert found == [MISTAKE, EXAMPLE]
    assert "removed" in caplog.text


def test_a_skill_loaded_on_another_topic_is_not_in_effect():
    last = turn(explaining_a_mistake=0)

    assert names([last], "Fractions") == []
    assert names([last], "  number SYSTEMS ") == [MISTAKE]


def test_a_conversation_without_a_topic_carries_its_skills_on_a_missing_topic():
    last = Exchange(message="m", answer="a", skills={MISTAKE: 0}, topic="")

    assert names([last], None) == [MISTAKE]


def lived(turns: int) -> list[Exchange]:
    """A conversation that loaded the skill once, then went `turns` more turns
    without loading it, each turn recording the skills carried."""
    history = [stamped(Exchange(message="m", answer="a"), [], TOPIC, [MISTAKE])]
    for _ in range(turns):
        history.append(stamped(Exchange(message="m", answer="a"), history, TOPIC))
    return history


def test_a_skill_carries_on_without_being_loaded_again_to_the_fourth_turn():
    assert names(lived(2)) == [MISTAKE]


def test_a_skill_loaded_once_is_gone_by_the_seventh_turn():
    assert MAX_AGE_TURNS == 6
    assert names(lived(4)) == [MISTAKE]  # the sixth turn
    assert names(lived(5)) == []  # the seventh


def test_a_reload_starts_the_age_again():
    history = lived(4)
    history.append(
        stamped(Exchange(message="m", answer="a"), history, TOPIC, [MISTAKE])
    )
    for _ in range(4):
        history.append(stamped(Exchange(message="m", answer="a"), history, TOPIC))

    assert names(history) == [MISTAKE]


def test_a_change_of_topic_ends_the_carrying():
    history = lived(1)
    history.append(stamped(Exchange(message="m", answer="a"), history, "Fractions"))

    assert "skills" not in history[-1]
    assert names(history, TOPIC) == []


def test_loading_on_a_new_topic_starts_there():
    history = lived(1)
    moved = stamped(Exchange(message="m", answer="a"), history, "Fractions", [EXAMPLE])

    assert moved["skills"] == {EXAMPLE: 0}
    assert moved["topic"] == "Fractions"


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
    return Exchange(
        message="q", answer="a", skills=dict.fromkeys(names, 0), topic=TOPIC
    )


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
    assert kept["skills"] == {MISTAKE: 0}
    assert kept["topic"] == TOPIC
    assert skills()[MISTAKE].body not in kept["answer"]


async def test_a_skill_in_effect_that_the_tutor_loads_again_stays_in_effect():
    memory = InMemoryConversationStore()
    await memory.append("c", kept_in_effect(MISTAKE))
    _, context = stand_in(loads(MISTAKE))

    with context:
        async for _ in Tutor(memory).stream("c", "3/5?", MATHS):
            pass

    assert (await memory.load("c")).exchanges[-1]["skills"] == {MISTAKE: 0}


async def test_a_skill_in_effect_the_tutor_does_not_load_again_is_carried_on():
    memory = InMemoryConversationStore()
    await memory.append("c", kept_in_effect(MISTAKE))
    _, context = stand_in(finish("Try the next step."))

    with context:
        async for _ in Tutor(memory).stream("c", "3/5?", MATHS):
            pass

    assert (await memory.load("c")).exchanges[-1]["skills"] == {MISTAKE: 1}


async def test_a_message_that_got_no_answer_keeps_the_skills_in_effect_aged():
    memory = InMemoryConversationStore()
    await memory.append("c", kept_in_effect(MISTAKE))
    _, context = stand_in(finish("Try the next step."))

    with context:
        async for _ in Tutor(memory).stream("c", "3/5?", MATHS, unanswered=["lost"]):
            pass

    skills_kept = [e["skills"] for e in (await memory.load("c")).exchanges]
    assert skills_kept == [{MISTAKE: 0}, {MISTAKE: 1}, {MISTAKE: 2}]


async def test_a_stopped_turn_keeps_the_skills_in_effect_and_the_topic():
    memory = InMemoryConversationStore()
    await memory.append("c", kept_in_effect(MISTAKE))
    source = TutorTurnSource(None, SimpleNamespace(conversations=memory))
    job = TurnJob(
        chat="c",
        turn="t",
        message="3/5?",
        metadata={"learner": {"topic": TOPIC}},
    ).model_dump(mode="json")

    await source.keep_stopped(job, "t", "Half an ans", ())

    stopped = (await memory.load("c")).exchanges[-1]
    assert stopped["answer"] == "Half an ans"
    assert stopped["skills"] == {MISTAKE: 1}
    assert stopped["topic"] == TOPIC


async def test_the_summary_step_neither_sees_nor_drops_the_skills():
    memory = InMemoryConversationStore()
    for n in range(25):
        await memory.append("c", kept_in_effect(MISTAKE))
    lm, context = stand_in([{"updated": "A summary."}])

    with context:
        conversation = await recalled(memory, "c")

    summarised = " ".join(str(m["content"]) for m in lm.history[0]["messages"])
    assert skills()[MISTAKE].body not in summarised
    assert conversation.exchanges[-1]["skills"] == {MISTAKE: 0}


async def test_a_skill_the_tutor_loads_is_told_once_with_the_turns_own_items():
    _, context = stand_in(loads(MISTAKE))

    with context:
        items = [
            i async for i in Tutor(InMemoryConversationStore()).stream("c", "x", MATHS)
        ]

    assert [i for i in items if isinstance(i, SkillLoaded)] == [SkillLoaded(MISTAKE)]


async def test_a_skill_is_told_though_the_status_buffer_drops_every_event(monkeypatch):
    monkeypatch.setattr("app.agent.streaming._send", lambda item: None)
    _, context = stand_in(loads(MISTAKE))

    with context:
        items = [
            i async for i in Tutor(InMemoryConversationStore()).stream("c", "x", MATHS)
        ]

    assert [i for i in items if isinstance(i, SkillLoaded)] == [SkillLoaded(MISTAKE)]
    assert not [i for i in items if isinstance(i, ToolFinished)]
