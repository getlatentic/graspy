"""Measure what the tutor does when a learner asks the chat for a new course:
the tools it calls and what reaches the app, with each action's arguments. Each phrasing is drawn several times through the real tutor, with the
model and settings from the environment and DSPy's cache off.

    uv run python scripts/measure_new_courses.py --profile gpt-oss-120b \
        --env-file /path/to/.dev.vars --draws 10 --out new-courses.json

A request that names several courses should make one new subject each, a
request for one course one subject, and a request for one more topic of the
open subject a topic. "Subjects made" counts a propose_path goal or a
change_subjects add as one subject each; "topics added" counts add_topic calls.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import time
from collections import defaultdict
from pathlib import Path

import dspy
from measure_stage_writing import add_profile_option, model, settings_from
from wire_record import RecordingTransport

from app.agent.context import LearnerContext
from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import ToolActivity
from app.agent.tutor import Tutor, TutorReply

CONCURRENT_DRAWS = 6
SUBJECTS = [
    {"name": "Mathematics", "slug": "mathematics"},
    {"name": "Physics", "slug": "physics"},
]
LEARNER = {
    "country": "Nigeria",
    "language": "English",
    "gradeLevel": "SS 2",
    "subjects": SUBJECTS,
}
TOPICS = ["Indices and Logarithms", "Quadratic Equations", "Trigonometry"]
# A subject open as a whole, a topic of it open, and no subject open.
CONTEXTS = {
    "subject open": {
        **LEARNER,
        "subject": "Mathematics",
        "subjectSlug": "mathematics",
        "topics": TOPICS,
    },
    "topic open": {
        **LEARNER,
        "subject": "Mathematics",
        "subjectSlug": "mathematics",
        "topic": "Quadratic Equations",
        "topics": TOPICS,
    },
    "nothing open": LEARNER,
}

THREE = [
    "Give me a high-school-level curriculum for machine learning, the maths of machine learning, and quantum computing.",
    "I want to study ML, maths of ML and quantum computing, all at high school level. Please set them up for me.",
    "Make me courses on machine learning, the mathematics behind machine learning, and quantum computing. High school level please.",
    "ML, maths of ML, quantum computing: a high school level curriculum for all three.",
]
ONE = [
    "I want a high-school-level course on quantum computing.",
    "Can you set up a machine learning course for me? High school level.",
    "Create a new subject for me: astronomy.",
    "Make a new subject called data science, please.",
    "I'd like to start a new course on Python programming.",
    "Can you create a new subject here? I want to learn about chess.",
]
TOPIC = [
    "Add a topic on completing the square to this subject.",
    "I want to learn about the quadratic formula as well. Add it to my plan.",
]
# (group, subjects it should make, topics it should add, contexts, phrasings)
GROUPS = [
    ("three courses", 3, 0, list(CONTEXTS), THREE),
    ("one course", 1, 0, list(CONTEXTS), ONE),
    ("one more topic", 0, 1, ["subject open", "topic open"], TOPIC),
]


def subjects_made(actions: list[dict]) -> list[str]:
    made = []
    for action in actions:
        if action["type"] == "propose_path":
            made.append(action["goal"])
        elif action["type"] == "change_subjects":
            made.extend(action["add"])
    return made


SECRET = re.compile(
    r"(?i)(authorization|bearer|api[-_ ]?key|x-api-key|token|secret)\W{0,3}[\w.~+/=-]{8,}"
)


def described(error: BaseException) -> str:
    """A failed draw as its kind and a short message with anything key-like cut
    out: no request headers and no traceback, which can carry them."""
    return f"{type(error).__name__}: {SECRET.sub('[redacted]', str(error))[:200]}"


async def draw(case: tuple, lm: dspy.LM) -> dict:
    group, context_name, message = case
    tools: list[str] = []
    answer, actions = "", []
    started = time.perf_counter()
    with dspy.context(lm=lm.copy()):
        async for item in Tutor(InMemoryConversationStore()).stream(
            "c", message, LearnerContext.model_validate(CONTEXTS[context_name])
        ):
            if isinstance(item, ToolActivity):
                tools.append(item.tool)
            if isinstance(item, TutorReply):
                answer = item.answer
                actions = [
                    a.model_dump(mode="json", by_alias=True) for a in item.actions
                ]
    return {
        "group": group,
        "context": context_name,
        "message": message,
        "tools": tools,
        "actions": actions,
        "subjects_made": subjects_made(actions),
        "topics_added": [a["topic"] for a in actions if a["type"] == "add_topic"],
        "answer": answer,
        "seconds": round(time.perf_counter() - started, 1),
    }


async def measure(
    lm: dspy.LM, draws: int, groups: set[str], phrasings: int
) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def one(case: tuple) -> dict:
        async with gate:
            return await draw(case, lm)

    cases = [
        (group, context, message)
        for group, _, _, contexts, messages in GROUPS
        if group in groups
        for context in contexts
        for message in messages[:phrasings]
        for _ in range(draws)
    ]
    drawn = await asyncio.gather(*(one(c) for c in cases), return_exceptions=True)
    # A failed turn is a result to count, not a crash.
    return [
        {
            "group": c[0],
            "context": c[1],
            "message": c[2],
            "error": described(r),
        }
        if isinstance(r, BaseException)
        else r
        for c, r in zip(cases, drawn, strict=True)
    ]


def summary(results: list[dict]) -> str:
    expected = {group: (subjects, topics) for group, subjects, topics, *_ in GROUPS}
    rows: dict[tuple, list[dict]] = defaultdict(list)
    for row in results:
        rows[(row["group"], row["context"], row["message"])].append(row)
    lines = []
    for (group, context, message), draws in rows.items():
        good = [r for r in draws if "error" not in r]
        want_subjects, want_topics = expected[group]
        right = sum(
            len(r["subjects_made"]) == want_subjects
            and len(r["topics_added"]) == want_topics
            for r in good
        )
        distinct = sum(
            len({s.casefold() for s in r["subjects_made"]}) == want_subjects
            for r in good
        )
        sizes = sorted(len(r["subjects_made"]) for r in good)
        lines.append(
            f"{group} | {context} | right {right}/{len(draws)} "
            f"(distinct {distinct}, errors {len(draws) - len(good)}) "
            f"subjects made per draw {sizes} | {message[:60]}"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--draws", type=int, default=10)
    parser.add_argument("--env-file")
    parser.add_argument(
        "--groups", default=",".join(g[0] for g in GROUPS), help="comma-separated"
    )
    parser.add_argument("--phrasings", type=int, default=99, help="first N of each")
    add_profile_option(parser)
    options = parser.parse_args()
    settings = settings_from(options)
    lm = model(settings, RecordingTransport())
    results = asyncio.run(
        measure(lm, options.draws, set(options.groups.split(",")), options.phrasings)
    )
    options.out.write_text(json.dumps(results, indent=2))
    print(summary(results))


if __name__ == "__main__":
    main()
