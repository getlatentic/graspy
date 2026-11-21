"""Measure how the tutor uses tools with and without the load_skill tool: twelve
fixed messages drawn several times through the real tutor, with the model and
settings in .env and DSPy's cache off. A tool call is counted from the tool the
turn announced, and the request body sent to the model is kept, so the `tools`
array on the wire can be read.

    uv run python scripts/measure_skill_loading.py --out after.json --wire after-wire.json
    uv run python scripts/measure_skill_loading.py --without-skills --out before.json

--without-skills removes load_skill and the catalogue, which is the tutor before skills.
"""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import json
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

import dspy
from measure_stage_writing import model

import app.agent.skills.load as load_module
import app.agent.toolkit as toolkit_module
import app.agent.tutor as tutor_module
from app.agent.context import LearnerContext
from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import ToolActivity
from app.agent.tutor import Tutor, TutorReply
from app.llm.transport import HttpxTransport
from app.settings import Settings

CONCURRENT_DRAWS = 6
CONTEXT = LearnerContext.model_validate(
    {
        "country": "Nigeria",
        "language": "English",
        "gradeLevel": "JSS 1",
        "subject": "Mathematics",
        "subjectSlug": "mathematics",
        "topic": "Fractions and Decimals",
        "topics": ["Number Systems", "Fractions and Decimals"],
        "subjects": [
            {"name": "Mathematics", "slug": "mathematics"},
            {"name": "English Language", "slug": "english-language"},
        ],
    }
)

# (id, group, message, the tool it should call, or None)
CASES = [
    (
        "calculate",
        "tool",
        "What is 15% of 240? Please work it out for me.",
        "calculate",
    ),
    (
        "practice",
        "tool",
        "Give me three practice questions on this topic.",
        "give_practice",
    ),
    (
        "passage",
        "tool",
        "Can I have a short reading passage with questions to answer?",
        "give_passage",
    ),
    ("subject", "tool", "Switch to English Language.", "open_subject"),
    ("lesson", "tool", "Take me to the Number Systems lesson.", "open_topic"),
    (
        "add",
        "tool",
        "I want to learn about percentages as well. Add it to my plan.",
        "add_topic",
    ),
    (
        "mistake",
        "skill",
        (
            "I worked out 1/2 + 1/3 and got 2/5. My teacher marked it wrong. "
            "What did I do wrong?"
        ),
        "load_skill",
    ),
    (
        "example",
        "skill",
        (
            "I don't know how to add fractions with different denominators. "
            "Can you show me how it is done?"
        ),
        "load_skill",
    ),
    (
        "check",
        "skill",
        "Explain what an equivalent fraction is, and then see if I have understood.",
        "load_skill",
    ),
    ("numerator", "plain", "What is a numerator?", None),
    ("thanks", "plain", "Thanks, that was helpful!", None),
    ("point", "plain", "Why do we write decimals with a point?", None),
]
EXPECTED_SKILL = {
    "mistake": "explaining-a-mistake",
    "example": "worked-example",
    "check": "checking-understanding",
}


_LOADED: contextvars.ContextVar[list[str]] = contextvars.ContextVar("loaded")


class RecordingSkills(dict):
    """The registry, noting each name the tutor asks load_skill for."""

    def get(self, name, default=None):
        _LOADED.get().append(name)
        return super().get(name, default)


class RecordingTransport(HttpxTransport):
    """Keeps each request body sent to the model."""

    def __init__(self) -> None:
        super().__init__()
        self.bodies: list[dict] = []

    @asynccontextmanager
    async def stream(self, request):
        self.bodies.append(json.loads(request.body))
        async with super().stream(request) as response:
            yield response


async def draw(case: tuple, lm: dspy.LM) -> dict:
    case_id, group, message, expected = case
    tools: list[str] = []
    loaded: list[str] = []
    _LOADED.set(loaded)
    started = time.perf_counter()
    with dspy.context(lm=lm.copy()):
        async for item in Tutor(InMemoryConversationStore()).stream(
            "c", message, CONTEXT
        ):
            if isinstance(item, ToolActivity):
                tools.append(item.tool)
            if isinstance(item, TutorReply):
                answer = item.answer
    return {
        "case": case_id,
        "group": group,
        "expected": expected,
        "tools": tools,
        "loaded": loaded,
        "answer_words": len(answer.split()),
        "seconds": round(time.perf_counter() - started, 1),
    }


async def measure(lm: dspy.LM, draws: int) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def one(case: tuple) -> dict:
        async with gate:
            return await draw(case, lm)

    cases = [case for case in CASES for _ in range(draws)]
    drawn = await asyncio.gather(*(one(case) for case in cases), return_exceptions=True)
    # A failed turn is a result to count, not a crash.
    return [
        {"case": case[0], "group": case[1], "error": repr(result)[:300]}
        if isinstance(result, BaseException)
        else result
        for case, result in zip(cases, drawn, strict=True)
    ]


def without_skills() -> None:
    toolkit_module.TOOLS = tuple(
        spec for spec in toolkit_module.TOOLS if spec.name != "load_skill"
    )
    tutor_module.signature_for = lambda _context: tutor_module.TutorTurn


def summary(results: list[dict]) -> str:
    groups: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        groups[result["group"]].append(result)
    lines = []
    for group, rows in groups.items():
        ok = [row for row in rows if "error" not in row]
        lines.append(f"{group}: {len(ok)} turns, {len(rows) - len(ok)} errors")
        for case_id in dict.fromkeys(row["case"] for row in rows):
            mine = [row for row in ok if row["case"] == case_id]
            called = [row["tools"] + row["loaded"] for row in mine]
            lines.append(f"  {case_id:10} {called}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--wire", type=Path)
    parser.add_argument("--draws", type=int, default=3)
    parser.add_argument("--env-file")
    parser.add_argument("--without-skills", action="store_true")
    options = parser.parse_args()
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    if options.without_skills:
        without_skills()
    transport = RecordingTransport()
    registry = RecordingSkills(load_module.skills())
    load_module.skills = lambda: registry
    lm = model(settings, transport)
    results = asyncio.run(measure(lm, options.draws))
    options.out.write_text(json.dumps(results, indent=2))
    if options.wire:
        # The first request of a turn that names the tools it may call.
        sent = [b for b in transport.bodies if "next_tool_name" in json.dumps(b)]
        options.wire.write_text(json.dumps(sent[:1], indent=2))
    print(summary(results))


if __name__ == "__main__":
    main()
