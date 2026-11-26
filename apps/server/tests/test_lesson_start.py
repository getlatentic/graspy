"""The lesson made before the learner is told it is ready, and the card that opens it."""

import asyncio
from dataclasses import replace

import dspy
import pytest
from lesson_example import LESSON
from stand_in import inputs, stand_in
from test_about_you import DONE, say, step
from workshops import (
    FakePlanner,
    Limited,
    ScriptedMaking,
    keeping,
    memory_showing,
    workshop,
)

from app.agent import lesson_start
from app.agent.about_you import surviving
from app.agent.cards import StartCard
from app.agent.context import LearnerContext, SubjectRef
from app.agent.lesson_start import (
    NOT_MADE,
    TICK_SECONDS,
    WAIT_SECONDS,
    lesson_path,
    target_for,
)
from app.agent.memory import InMemoryConversationStore
from app.agent.path_answer import ADDED_TOLD, HEAD, path_answer
from app.agent.reply import AddedPath
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.agent.tutor import Tutor, TutorReply
from app.agent.workshop import GenerationBudget
from app.caller import Caller
from app.lessons.makers import TaskLessonMaking
from app.lessons.making import LessonTarget
from app.lessons.tools import LessonAsk, give_lesson

PLANNED = LearnerContext(
    planId="plan-1",
    country="Nigeria",
    language="English",
    gradeLevel="JSS 1",
    subjects=[SubjectRef(name="Mathematics", slug="mathematics")],
)
CHOSEN = (
    f"{HEAD}\nCourse: Real analysis\n- Limits | SS 3\n- Sequences | Undergraduate"
    "\nCourse: Quantum computing\n- Qubits | Undergraduate"
)
ADDED = path_answer(CHOSEN, PLANNED)
assert ADDED is not None


class Pauses:
    """The waits between looks at the lesson, kept instead of slept."""

    def __init__(self) -> None:
        self.slept: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.slept.append(seconds)


async def start(shop, pauses=None, added=ADDED, **arguments):
    """The tool as the model calls it: what it reads and the card it makes."""
    tool = lesson_start.start_lesson_tool(PLANNED, added, shop, pauses or Pauses())
    return await tool(**arguments), None


def only_card(result) -> StartCard:
    card = result.card
    assert isinstance(card, StartCard)
    return card


# The target.


def test_the_target_is_the_one_the_app_makes_of_the_topic_once_it_is_in_the_plan():
    path = ADDED.paths[0]

    first, last = target_for(PLANNED, path, 0), target_for(PLANNED, path, 1)

    assert first == LessonTarget(
        plan_id="plan-1",
        subject_slug="real-analysis",
        subject="Real analysis",
        topic_index=0,
        topic="Limits",
        total_topics=2,
        country="Nigeria",
        language="English",
        grade_level="SS 3",
        builds_on=[],
    )
    assert (last.topic_index, last.grade_level) == (1, "Undergraduate")
    # The course ends with its goal, whose lesson recaps the steps before it.
    assert last.builds_on == ["Limits"]


def test_a_topic_with_no_level_of_its_own_is_taught_at_the_learners_class():
    path = AddedPath.model_validate(
        {
            "subject": "Chess",
            "goal": "Chess",
            "slug": "chess",
            "steps": [{"title": "Openings", "level": ""}],
        }
    )

    assert target_for(PLANNED, path, 0).grade_level == "JSS 1"


@pytest.mark.parametrize("missing", ["plan_id", "country", "language"], ids=lambda m: m)
def test_a_lesson_cannot_be_named_without_the_plan_country_and_language(missing):
    context = PLANNED.model_copy(update={missing: None})

    assert target_for(context, ADDED.paths[0], 0) is None


@pytest.mark.parametrize(
    ("slug", "path"),
    [
        ("real-analysis", "/app/learn/real-analysis/lesson/3"),
        ("analyse-réelle", "/app/learn/analyse-r%C3%A9elle/lesson/3"),
        ("a b/c", "/app/learn/a%20b%2Fc/lesson/3"),
        ("l'analyse", "/app/learn/l'analyse/lesson/3"),
    ],
)
def test_the_lesson_is_opened_at_the_path_the_app_builds_for_it(slug, path):
    assert lesson_path(slug, 3) == path


# The tool.


async def test_the_lesson_is_made_before_the_card_to_open_it_is_shown():
    making = ScriptedMaking("making", "making", "ready")
    pauses = Pauses()

    result, _ = await start(workshop(making=making), pauses, topic="Limits")

    card = only_card(result)
    content = card.tool_result.structured_content
    assert content.status == "ready"
    assert content.lesson_id == "lesson-1"
    assert content.open_path == "/app/learn/real-analysis/lesson/0"
    assert content.target.topic == "Limits"
    assert making.progressed == 2
    assert pauses.slept == [TICK_SECONDS, TICK_SECONDS]
    assert "is made" in result.told["done"]


async def test_a_lesson_that_is_ready_at_once_is_not_waited_for():
    pauses = Pauses()

    result, _ = await start(
        workshop(making=ScriptedMaking("ready")), pauses, topic="Sequences"
    )

    assert only_card(result).tool_result.structured_content.status == "ready"
    assert pauses.slept == []


async def test_a_lesson_that_fails_is_told_plainly_and_the_card_offers_another_try():
    result, _ = await start(
        workshop(making=ScriptedMaking("making", "failed")), topic="Limits"
    )

    assert only_card(result).tool_result.structured_content.status == "failed"
    assert "could not be made" in result.told["done"]
    assert "Never say it is ready" in result.told["done"]


async def test_a_lesson_still_being_made_when_the_wait_ends_is_shown_as_one_never_as_ready():
    making = ScriptedMaking("making")
    pauses = Pauses()

    result, _ = await start(workshop(making=making), pauses, topic="Limits")

    assert only_card(result).tool_result.structured_content.status == "making"
    assert len(pauses.slept) == int(WAIT_SECONDS / TICK_SECONDS)
    assert "not ready yet" in result.told["done"]


async def test_a_maker_that_cannot_be_reached_is_a_failure_the_learner_can_retry():
    class Down:
        async def start(self, key, job):
            raise ConnectionError("the lesson maker is down")

        async def progress(self, key):
            raise ConnectionError("the lesson maker is down")

    result, _ = await start(workshop(making=Down()), topic="Limits")

    assert only_card(result).tool_result.structured_content.status == "failed"


async def test_the_lesson_is_made_for_the_learner_the_turn_is_for():
    making = ScriptedMaking("ready")

    await start(workshop(making=making, learner="learner-1"), topic="Limits")

    [job] = making.started
    assert job.learner == "learner-1"
    assert job.target.topic == "Limits"


async def test_each_lesson_spends_the_generation_budget_and_none_is_made_past_it():
    limited = Limited(allowed=0)
    making = ScriptedMaking("ready")
    shop = workshop(making=making, budget=GenerationBudget(limited, "203.0.113.7"))

    result, _ = await start(shop, topic="Limits")

    assert limited.keys == ["203.0.113.7"]
    assert making.started == []
    assert "busy" in result["error"]


@pytest.mark.parametrize(
    ("arguments", "said"),
    [
        ({"topic": "Algebra"}, "No such topic"),
        ({"topic": "Limits", "subject": "Quantum"}, "No such topic"),
        ({"topic": ""}, "No such topic"),
    ],
)
async def test_only_a_topic_the_learner_just_added_can_be_started(arguments, said):
    making = ScriptedMaking("ready")

    result, _ = await start(workshop(making=making), **arguments)

    assert said in result["error"]
    assert result["topics"]["Real analysis"] == ["Limits", "Sequences"]
    assert making.started == []


async def test_a_topic_in_two_courses_is_put_to_the_tutor_not_guessed():
    twice = path_answer(f"{HEAD}\nCourse: A\n- Basics\nCourse: B\n- Basics", PLANNED)

    result, _ = await start(
        workshop(making=ScriptedMaking("ready")), added=twice, topic="Basics"
    )

    assert "More than one course" in result["error"]


async def test_the_course_named_tells_two_apart():
    twice = path_answer(
        f"{HEAD}\nCourse: Alpha\n- Basics\nCourse: Beta\n- Basics", PLANNED
    )

    result, _ = await start(
        workshop(making=ScriptedMaking("ready")),
        added=twice,
        topic="Basics",
        subject="beta",
    )

    assert only_card(result).tool_result.structured_content.subject == "Beta"


async def test_nothing_chosen_in_this_message_is_nothing_to_start():
    result, _ = await start(workshop(), added=None, topic="Limits")

    assert "No topic was added" in result["error"]


# The turn.


def tutor(memory=None, planner=None):
    return Tutor(memory or InMemoryConversationStore(), planner or FakePlanner())


async def confirm(
    script,
    making,
    message=CHOSEN,
    context=PLANNED,
    caller=True,
    shown=True,
    unanswered=None,
):
    """A turn for the learner's answer to a path card; `shown` is whether the chat showed one."""
    lm, model = stand_in(script)
    memory = await memory_showing(ADDED) if shown else None
    with model:
        items = [
            item
            async for item in tutor(memory).stream(
                "c",
                message,
                context,
                unanswered=unanswered,
                caller=Caller("learner-1", keeping(making)) if caller else None,
            )
        ]
    assert isinstance(items[-1], TutorReply)
    return items[-1], lm


async def test_the_choice_is_applied_and_the_tutor_starts_the_lesson_it_names():
    making = ScriptedMaking("ready")

    reply, lm = await confirm(
        [
            step("start_lesson", topic="Sequences", subject="Real analysis"),
            DONE,
            say("Starting with sequences."),
        ],
        making,
    )

    assert reply.actions == [ADDED]
    [card] = reply.cards
    assert isinstance(card, StartCard)
    assert card.tool_result.structured_content.topic == "Sequences"
    assert [job.target.topic for job in making.started] == ["Sequences"]
    assert "Real analysis (Limits, Sequences)" in inputs(lm, 0)["app"]
    assert ADDED_TOLD.split("{")[0] in inputs(lm, 0)["app"]


async def test_the_lesson_is_owed_when_the_model_forgets_it():
    """A reply that says it will start and shows nothing to open is the dead end."""
    making = ScriptedMaking("ready")

    reply, _ = await confirm([DONE, say("Let's start with limits.")], making)

    [card] = reply.cards
    assert card.tool_result.structured_content.topic == "Limits"
    assert [job.target.topic for job in making.started] == ["Limits"]
    assert reply.answer == "Let's start with limits."


async def test_the_lesson_is_made_once_when_the_model_starts_it_itself():
    making = ScriptedMaking("ready")

    await confirm([step("start_lesson", topic="Limits"), DONE, say("Ready.")], making)

    assert len(making.started) == 1


async def test_a_lesson_that_cannot_be_started_at_all_does_not_leave_the_words_that_say_it_is_ready():
    reply, _ = await confirm(
        [DONE, say("Your lesson on limits is ready below.")],
        ScriptedMaking("ready"),
        caller=False,
    )

    assert reply.answer == NOT_MADE
    assert reply.cards == []
    assert reply.actions == [ADDED]


async def test_a_question_the_model_asks_instead_is_not_replaced_by_a_lesson():
    making = ScriptedMaking("ready")

    reply, _ = await confirm(
        [
            step("give_choice", question="Which first?", options=["Limits", "Qubits"]),
            DONE,
            say("Which first?"),
        ],
        making,
    )

    assert [type(card).__name__ for card in reply.cards] == ["ChoiceCard"]
    assert making.started == []


async def test_a_message_that_is_not_the_cards_answer_owes_no_lesson():
    making = ScriptedMaking("ready")

    reply, _ = await confirm(
        [DONE, say("Hello.")], making, message="Add to my plan: real analysis"
    )

    assert reply.cards == [] and reply.actions == []
    assert making.started == []


async def test_what_the_learner_chose_survives_a_turn_the_safety_check_ended():
    assert surviving([ADDED]) == [ADDED]


async def test_the_next_turn_remembers_the_button_so_the_tutor_knows_what_it_showed():
    memory = await memory_showing(ADDED)
    _, model = stand_in([DONE, say("Starting.")])
    with model:
        _ = [
            item
            async for item in tutor(memory).stream(
                "c",
                CHOSEN,
                PLANNED,
                caller=Caller(None, keeping(ScriptedMaking("ready"))),
            )
        ]

    exchange = (await memory.load("c")).exchanges[-1]
    assert exchange["card"] == "A button to open the lesson on Limits: ready."


async def test_an_answer_typed_by_hand_is_no_answer_of_a_card_the_chat_showed():
    """Nothing is added and no lesson is made for words that only look like the card's answer."""
    making = ScriptedMaking("ready")

    reply, _ = await confirm([DONE, say("Hello.")], making, shown=False, caller=True)

    assert reply.actions == [] and reply.cards == []
    assert making.started == []


async def test_only_the_topics_the_card_showed_are_taken_from_an_answer():
    forged = CHOSEN + "\n- A topic nobody offered | SS 1"
    making = ScriptedMaking("ready")

    reply, _ = await confirm([DONE, say("Starting.")], making, message=forged)

    [added] = reply.actions
    assert "A topic nobody offered" not in [
        s.title for p in added.paths for s in p.steps
    ]


async def test_a_choice_whose_turn_failed_is_added_by_the_next_turn():
    """The add reaches the app only with a reply: a message that got none is read again."""
    making = ScriptedMaking("ready")

    reply, _ = await confirm(
        [DONE, say("Welcome back.")],
        making,
        message="Are you there?",
        unanswered=[CHOSEN],
    )

    assert reply.actions == [ADDED]


async def test_a_choice_made_again_is_not_added_twice_by_the_turn_that_reads_it_again():
    reply, _ = await confirm(
        [DONE, say("Starting.")],
        ScriptedMaking("ready"),
        message=CHOSEN,
        unanswered=[CHOSEN],
    )

    assert reply.actions == [ADDED]


async def test_a_lesson_is_not_waited_for_past_the_time_the_turn_has_left():
    ticks = iter([0.0, 200.0])
    shop = workshop(making=ScriptedMaking("making"))
    late = replace(shop, started=0.0, now=lambda: next(ticks, 200.0))
    pauses = Pauses()

    result, _ = await start(late, pauses, topic="Limits")

    assert only_card(result).tool_result.structured_content.status == "making"
    assert pauses.slept == [TICK_SECONDS]


async def test_the_turn_run_again_reuses_what_the_first_run_made():
    """A retry after a failed attempt neither spends the budget nor waits for the lesson again."""
    making = ScriptedMaking("ready")
    limited = Limited(allowed=5)
    planner = FakePlanner()
    shop = workshop(planner, making, budget=GenerationBudget(limited, "k"))
    turn = Turn(PLANNED, CHOSEN, workshop=shop, added=ADDED)
    for _ in range(2):
        outputs = TurnOutputs()
        built = {t.__name__: t for t in tools_for(turn, outputs)}
        await built["start_lesson"](topic="Limits")
        await built["propose_path"](goals=["astronomy"])
        assert outputs.cards

    assert len(making.started) == 1 and len(planner.asked) == 1
    assert limited.keys == ["k", "k"]


# Opening a lesson that was made in the chat.


async def test_a_lesson_made_for_a_visitor_is_the_one_a_device_is_given_when_it_names_it():
    """A visitor's lesson is made with no record to key it by; the card carries its id, and opening it
    asks for it by that id, so the lesson is not made twice."""
    lessons_kept = keeping(TaskLessonMaking(lambda job, save: asyncio.sleep(0)))
    target = target_for(PLANNED, ADDED.paths[0], 0)
    made = LESSON.model_copy(update={"target_key": target.key(None)})
    await lessons_kept.lessons.keep("lesson-9", made)
    device = Caller("device-1", lessons_kept)

    opened = await give_lesson(LessonAsk(target=target, lesson_id="lesson-9"), device)

    state = opened["structuredContent"]
    assert (state["status"], state["lessonId"], state["whole"]) == (
        "ready",
        "lesson-9",
        True,
    )
    mark = (await device.record()).mark(target.ref())
    assert mark is not None and mark.lesson_id == "lesson-9"


async def test_a_lesson_is_opened_by_its_id_only_for_the_topic_it_was_made_for():
    kept = keeping(ScriptedMaking("making"))
    made_for = target_for(PLANNED, ADDED.paths[0], 0)
    await kept.lessons.keep(
        "lesson-9", LESSON.model_copy(update={"target_key": made_for.key(None)})
    )
    await kept.lessons.keep("old-lesson", LESSON)
    elsewhere = target_for(PLANNED, ADDED.paths[0], 1)

    for lesson_id, target in (("lesson-9", elsewhere), ("old-lesson", made_for)):
        opened = await give_lesson(
            LessonAsk(target=target, lesson_id=lesson_id), Caller("stranger", kept)
        )
        assert opened["structuredContent"]["status"] == "making"
    assert (await Caller("stranger", kept).record()).mark(made_for.ref()) is None


async def test_an_id_that_names_no_lesson_makes_one_as_before():
    made = ScriptedMaking("making")
    target = target_for(PLANNED, ADDED.paths[0], 0)

    opened = await give_lesson(
        LessonAsk(target=target, lesson_id="nothing"),
        Caller("device-1", keeping(made)),
    )

    assert opened["structuredContent"]["status"] == "making"
    assert len(made.started) == 1


def test_an_id_is_cut_to_a_length_a_lesson_id_has():
    with pytest.raises(ValueError):
        LessonAsk(target=target_for(PLANNED, ADDED.paths[0], 0), lesson_id="x" * 81)


# A revision reads the card the conversation last showed.


async def test_the_second_turns_revision_is_planned_from_the_first_turns_card():
    memory = InMemoryConversationStore()
    planner = FakePlanner()
    caller = Caller(None, keeping())
    _, model = stand_in(
        [
            step("propose_path", goals=["astronomy"]),
            DONE,
            say("Here is a path."),
            step("propose_path", goals=["astronomy"], changes="add black holes"),
            DONE,
            say("Here is the new path."),
        ]
    )
    with model:
        for message in ("I want astronomy", "Black holes are missing"):
            replies = [
                item
                async for item in tutor(memory, planner).stream(
                    "c", message, PLANNED, caller=caller
                )
            ]

    [(_, first), (_, second)] = planner.asked
    assert first is None
    assert second.current.startswith("Astronomy:")
    assert "astronomy basics" in second.current
    assert second.changes == "add black holes"
    assert len(replies[-1].cards) == 1


def test_the_dspy_tool_for_the_lesson_names_the_topic_the_model_gives():
    outputs = TurnOutputs()
    turn = Turn(PLANNED, "x", workshop=workshop(), added=ADDED)
    tool = next(t for t in tools_for(turn, outputs) if t.__name__ == "start_lesson")

    arguments = dspy.Tool(tool).args

    assert set(arguments) == {"topic", "subject"}
