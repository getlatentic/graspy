"""Write the tutor's reply contract for the web app to check itself against.

The app parses what a turn sends (apps/web/src/lib/a2a/reply-data.ts),
names each tool it shows (chat.activity.<tool>), and sends data beside the
learner's words. Its tests read the file this writes: the tools in order, one
reply carrying every kind of action and card exactly as the server sends
them, and the data a request carries as the server reads it.

    uv run python scripts/export_reply_contract.py           # write
    uv run python scripts/export_reply_contract.py --check   # fail if stale

It writes two files: what the app reads of a reply, sends with a message,
asks the MCP server for a lesson with and reads of the learner's record
(apps/web); and what the views read of a card or a lesson and send when the
learner answers (apps/server/ui).
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import get_args

from app.agent.app_tools import PART_KEY, TOOLS_CALL
from app.agent.cards import Card, ResultMeta
from app.agent.passage import PassageQuestion, give_passage
from app.agent.practice import PracticeQuestion, give_practice
from app.agent.reply import (
    Action,
    AddTopic,
    ChangeSubjects,
    OpenSubject,
    OpenTopic,
    ProposePath,
    RebuildPlan,
    ReplyData,
)
from app.agent.toolkit import TOOLS
from app.agent.unanswered import PART_KEY as UNANSWERED_KEY
from app.caller import Caller, Keeping
from app.domains.lesson.lesson import (
    Lesson,
    LessonPractice,
    LessonProgress,
    LessonSlide,
    LessonSlideAssessment,
)
from app.learner.answers import PracticeAnswer
from app.learner.record import (
    Answer,
    Answered,
    Learnt,
    LessonKept,
    TopicRef,
    Where,
)
from app.learner.store import InMemoryLearnerStore
from app.lessons.makers import TaskLessonMaking
from app.lessons.making import LessonTarget
from app.lessons.store import InMemoryLessonStore
from app.lessons.tools import LessonAsk, give_lesson

APPS = Path(__file__).resolve().parents[2]
TARGET = APPS / "web/src/lib/a2a/reply-contract.json"
# The views read the cards' content, which the app never does: theirs is
# a contract of its own.
VIEWS_TARGET = APPS / "server/ui/src/lib/card-contract.json"

QUESTION = "Convert \\(\\frac{13}{40}\\) to a decimal."
OPTIONS = ["0.325", "0.35", "3.25"]
DEVICE = "0f1e2d3c4b5a69788796a5b4c3d2e1f0"
WHERE = Where(plan_id="plan-1", subject_slug="mathematics", topic="Fractions")
FRACTIONS = TopicRef(
    plan_id="plan-1", subject_slug="mathematics", topic_index=2, topic="Fractions"
)


PRACTICE_VIEW = "4f1c2b7e9a0d4c3e8b5a6f7d2e1c0b9a"


def pinned(card: Card, view_uuid: str) -> Card:
    """A card as a tool made it and a turn placed it, with the view's key
    fixed so the file is."""
    meta = ResultMeta(view_uuid=view_uuid, where=WHERE)
    return card.model_copy(
        update={"tool_result": card.tool_result.model_copy(update={"meta": meta})}
    )


PRACTICE = give_practice(
    instruction="Write each fraction as a decimal.",
    questions=[
        PracticeQuestion(
            question=QUESTION,
            working="13 ÷ 40 = 0.325",
            options=OPTIONS,
            answer_index=0,
            correct_feedback="13 ÷ 40 = 0.325.",
            incorrect_feedback="Divide the top by the bottom.",
            check="13/40",
            hint="Write it as 13 ÷ 40.",
        ),
        PracticeQuestion(
            question="Convert \\(\\frac{1}{4}\\) to a decimal.",
            working="1 ÷ 4 = 0.25",
            options=["0.4", "0.25"],
            answer_index=1,
            correct_feedback="1 ÷ 4 = 0.25.",
            incorrect_feedback="Divide 1 by 4.",
            check="1/4",
        ),
    ],
).card
PASSAGE = give_passage(
    instruction="Read the passage, then answer the questions.",
    title="Market Day",
    passage=(
        "Ada sells tomatoes at Oja Oba market in Akure every Saturday.\n\n"
        "She wakes before dawn, loads three baskets onto a bus, and reaches the "
        "market by six. By noon the baskets are empty and she counts her money."
    ),
    questions=[
        PassageQuestion(
            question="How many baskets does Ada take to market?",
            evidence="loads three baskets onto a bus",
            options=["Two", "Three", "Four"],
            answer_index=1,
            correct_feedback="The passage says she loads three baskets.",
            incorrect_feedback="Look at what she loads onto the bus.",
        )
    ],
).card

EXAMPLE = ReplyData(
    follow_ups=["What is 1/2 as a decimal?"],
    actions=[
        OpenTopic(
            subject_slug="mathematics", topic_index=2, topic="Fractions and Decimals"
        ),
        OpenSubject(subject_slug="basic-science", subject="Basic Science"),
        AddTopic(
            subject_slug="mathematics",
            subject="Mathematics",
            topic="Ratio and Proportion",
        ),
        ChangeSubjects(add=["Physics"], remove=["Basic Science"]),
        RebuildPlan(),
        ProposePath(goal="real analysis"),
    ],
    cards=[
        pinned(PRACTICE, PRACTICE_VIEW),
        pinned(PASSAGE, "9b0c1e2d7f6a5b8e3c4d0a9e7b2c1f4a"),
    ],
)


# What the app sends beside the learner's words: the JSON-RPC requests a
# card's buttons made, as an MCP Apps UI makes them, and the learner's
# messages whose turns failed.
REQUEST = {
    UNANSWERED_KEY: ["Make me a study plan for my exams"],
    PART_KEY: [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": TOOLS_CALL,
            "params": {
                "name": "answer_practice",
                "arguments": PracticeAnswer(
                    question=QUESTION,
                    options=OPTIONS,
                    answer_index=0,
                    chosen_index=2,
                    where=WHERE,
                    key=f"{PRACTICE_VIEW}:0",
                ).model_dump(by_alias=True),
            },
        }
    ],
}


TARGET_LESSON = LessonTarget(
    **FRACTIONS.model_dump(),
    subject="Mathematics",
    total_topics=5,
    country="Nigeria",
    language="English",
    grade_level="JSS 1",
)
CHECK = LessonSlideAssessment(
    prompt="Which is bigger, \\(\\frac{1}{2}\\) or \\(\\frac{1}{3}\\)?",
    options=["\\(\\frac{1}{2}\\)", "\\(\\frac{1}{3}\\)"],
    answer_index=0,
    correct_feedback="Two equal parts are bigger than three.",
    incorrect_feedback="Sharing among more makes each part smaller.",
)
# A lesson as the pipeline finishes it (see domains/lesson/service.py).
LESSON = Lesson(
    title="Fractions - JSS 1",
    content="Lesson plan for Fractions",
    key_points=["A fraction names equal parts of a whole."],
    objectives=["Name the parts of a fraction", "Compare two unit fractions"],
    slides=[
        LessonSlide(
            slide_type="concept_introduction",
            title="Parts of a whole",
            body_md="Share an orange **equally** between two: each gets \\(\\frac{1}{2}\\).",
            assessment=CHECK,
        )
    ],
    practice=LessonPractice(
        question="What is \\(\\frac{1}{4}\\) of 8?",
        options=["2", "4"],
        answer_index=0,
        correct_feedback="8 shared among 4 is 2.",
        incorrect_feedback="Share 8 among 4.",
    ),
    progress=LessonProgress(current=0, total=2),
)


async def _never_made(_job, _save) -> None:
    raise SystemExit("The contract's lesson is kept: nothing is made")


async def _learner() -> tuple[dict, dict]:
    """A lesson as give_lesson opens it for a view, and the record the app
    reads, from the real tools and stores."""
    keeping = Keeping(
        learners=InMemoryLearnerStore(),
        lessons=InMemoryLessonStore(),
        making=TaskLessonMaking(_never_made),
    )
    caller = Caller(DEVICE, keeping)
    await keeping.lessons.keep("lesson-1", LESSON)
    await caller.change(LessonKept(topic=FRACTIONS, lesson_id="lesson-1"))
    await caller.change(Learnt(topic=FRACTIONS, at=1_790_000_000_000))
    answered = PracticeAnswer(
        question=CHECK.prompt,
        options=CHECK.options,
        answer_index=0,
        chosen_index=1,
        where=WHERE,
    )
    kept = answered.kept("lesson").model_copy(update={"at": 1_790_000_000_000})
    await caller.change(Answered(answer=Answer.model_validate(kept.model_dump())))
    opened = await give_lesson(LessonAsk(target=TARGET_LESSON), caller)
    record = (await caller.record()).for_app("plan-1")
    return opened, record


OPENED, RECORD = asyncio.run(_learner())
LESSON_ASK = LessonAsk(target=TARGET_LESSON).model_dump(by_alias=True)
LESSON_CHECK = {
    "name": "answer_check",
    "arguments": PracticeAnswer(
        question=CHECK.prompt,
        options=CHECK.options,
        answer_index=0,
        chosen_index=1,
        where=WHERE,
        key=f"{OPENED['_meta']['viewUUID']}:0",
    ).model_dump(by_alias=True),
}
LESSON_FINISH = {
    "name": "finish_lesson",
    "arguments": FRACTIONS.model_dump(by_alias=True),
}


def contract() -> str:
    kinds = set(get_args(get_args(Action)[0])) | set(get_args(get_args(Card)[0]))
    shown = {type(item) for item in [*EXAMPLE.actions, *EXAMPLE.cards]}
    missing = kinds - shown
    if missing:
        raise SystemExit(
            f"EXAMPLE has no {', '.join(sorted(m.__name__ for m in missing))}"
        )
    wire = {
        "tools": [
            {"name": spec.name, **({"ui": spec.ui} if spec.ui else {})}
            for spec in TOOLS
        ],
        "reply": EXAMPLE.model_dump(by_alias=True),
        "request": REQUEST,
        "lesson": {"name": "give_lesson", "arguments": LESSON_ASK},
        "learner": RECORD,
    }
    return json.dumps(wire, indent=2, ensure_ascii=False) + "\n"


def card_contract() -> str:
    """Each card's structured content, by the resource whose view shows it,
    and what a view sends when the learner answers."""
    wire = {
        "content": {
            **{
                card.resource_uri: card.tool_result.model_dump(by_alias=True)[
                    "structuredContent"
                ]
                for card in EXAMPLE.cards
            },
            "ui://graspy/lesson": OPENED["structuredContent"],
        },
        "meta": EXAMPLE.cards[0].tool_result.model_dump(by_alias=True)["_meta"],
        "answer": REQUEST[PART_KEY][0]["params"],
        "lesson": {
            "meta": OPENED["_meta"],
            "progress": {"name": "lesson_progress", "arguments": LESSON_ASK},
            "check": LESSON_CHECK,
            "finish": LESSON_FINISH,
        },
    }
    return json.dumps(wire, indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    for target, text in ((TARGET, contract()), (VIEWS_TARGET, card_contract())):
        if "--check" not in sys.argv[1:]:
            target.write_text(text, encoding="utf-8")
        elif not target.exists() or json.loads(
            target.read_text(encoding="utf-8")
        ) != json.loads(text):
            raise SystemExit(f"{target} is stale; run scripts/export_reply_contract.py")


if __name__ == "__main__":
    main()
