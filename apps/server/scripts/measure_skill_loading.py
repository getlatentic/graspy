"""Measure how the tutor uses tools with and without the load_skill tool: twelve
fixed single messages and one two-turn case, drawn several times through the
real tutor, with the model and settings in .env and DSPy's cache off. A tool
call is counted from the tool the turn announced, the skill named from the
call itself, and the request bodies sent to the model are kept so the wire can
be read.

    uv run python scripts/measure_skill_loading.py --out after.json --wire after-wire.json
    uv run python scripts/measure_skill_loading.py --without-skills --out before.json

--without-skills removes load_skill and the catalogue, which is the tutor before skills.
The two-turn case sends a mistake, then a wrong retry, to see whether the right
skill's text is in effect on the second turn and whether the tutor keeps to the
ladder. A skill is in effect when the server put its text into the turn's input
(tutors that do so) or the tutor loaded it in that turn. --ladder-draws sets the
draws of that case, --draws the draws of the others; --wire keeps the requests of
one two-turn conversation run alone.
"""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import dataclasses
import functools
import json
import re
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

import dspy
from measure_stage_writing import model

import app.agent.toolkit as toolkit_module
import app.agent.tutor as tutor_module
from app.agent.context import LearnerContext
from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import ToolActivity
from app.agent.tutor import Tutor, TutorReply
from app.llm.transport import HttpxTransport
from app.settings import Settings

try:
    from app.agent.skills.active import active_names
except ImportError:  # the tutor before skills carried across turns
    active_names = None

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
MISTAKE = (
    "I worked out 1/2 + 1/3 and got 2/5. My teacher marked it wrong. "
    "What did I do wrong?"
)
# 1/2 + 1/3 is 5/6, so a retry of 3/5 is wrong.
WRONG_RETRY = "I tried again and I think it is 3/5."
RIGHT_ANSWER = "5/6"
# The answer as plain text or as LaTeX, which the tutor writes fractions in.
GIVES_ANSWER = re.compile(r"5\s*/\s*6|\\frac\s*\{5\}\s*\{6\}")

# (id, group, the messages of the conversation, the tool the first should call)
CASES = [
    (
        "calculate",
        "tool",
        ["What is 15% of 240? Please work it out for me."],
        "calculate",
    ),
    (
        "practice",
        "tool",
        ["Give me three practice questions on this topic."],
        "give_practice",
    ),
    (
        "passage",
        "tool",
        ["Can I have a short reading passage with questions to answer?"],
        "give_passage",
    ),
    ("subject", "tool", ["Switch to English Language."], "open_subject"),
    ("lesson", "tool", ["Take me to the Number Systems lesson."], "open_topic"),
    (
        "add",
        "tool",
        ["I want to learn about percentages as well. Add it to my plan."],
        "add_topic",
    ),
    ("mistake", "skill", [MISTAKE], "load_skill"),
    (
        "example",
        "skill",
        [
            (
                "I don't know how to add fractions with different denominators. "
                "Can you show me how it is done?"
            )
        ],
        "load_skill",
    ),
    (
        "check",
        "skill",
        ["Explain what an equivalent fraction is, and then see if I have understood."],
        "load_skill",
    ),
    ("numerator", "plain", ["What is a numerator?"], None),
    ("thanks", "plain", ["Thanks, that was helpful!"], None),
    ("point", "plain", ["Why do we write decimals with a point?"], None),
    ("ladder", "ladder", [MISTAKE, WRONG_RETRY], "load_skill"),
]

_LOADED: contextvars.ContextVar[list[str]] = contextvars.ContextVar("loaded")


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


def replace(module, name: str, value) -> None:
    """Sets a module's attribute, refusing one that is not there: a renamed
    hook would otherwise measure the wrong tutor without saying so."""
    if not hasattr(module, name):
        raise SystemExit(f"{module.__name__} has no {name}: update this script.")
    setattr(module, name, value)


def record_skill_loads() -> None:
    """Notes the name each load_skill call is made with."""
    chosen = [spec for spec in toolkit_module.TOOLS if spec.name == "load_skill"]
    if len(chosen) != 1:
        raise SystemExit("TOOLS has no load_skill: update this script.")

    def build(turn):
        tool = chosen[0].build(turn)

        @functools.wraps(tool)
        def recording(name):
            _LOADED.get().append(name)
            return tool(name)

        return recording

    replace(
        toolkit_module,
        "TOOLS",
        tuple(
            dataclasses.replace(spec, build=build)
            if spec.name == "load_skill"
            else spec
            for spec in toolkit_module.TOOLS
        ),
    )


def remove_skills() -> None:
    replace(
        toolkit_module,
        "TOOLS",
        tuple(spec for spec in toolkit_module.TOOLS if spec.name != "load_skill"),
    )
    replace(tutor_module, "signature_for", lambda _context: tutor_module.TutorTurn)


def check_the_tutor(without_skills: bool) -> None:
    """The tutor that will be measured is the one asked for."""
    names = [
        t.__name__
        for t in toolkit_module.tools_for(
            toolkit_module.Turn(CONTEXT, ""), toolkit_module.TurnOutputs()
        )
    ]
    told = tutor_module.signature_for(CONTEXT).instructions
    if without_skills == ("load_skill" in names) or without_skills == (
        "Teaching methods" in told
    ):
        raise SystemExit("The tutor is not the one asked for: update this script.")


async def draw(case: tuple, lm: dspy.LM) -> dict:
    case_id, group, messages, expected = case
    memory = InMemoryConversationStore()
    turns = []
    for message in messages:
        loaded: list[str] = []
        _LOADED.set(loaded)
        in_effect = (
            list(active_names((await memory.load("c")).exchanges, CONTEXT.topic))
            if active_names
            else []
        )
        tools: list[str] = []
        answer = ""
        started = time.perf_counter()
        with dspy.context(lm=lm.copy()):
            async for item in Tutor(memory).stream("c", message, CONTEXT):
                if isinstance(item, ToolActivity):
                    tools.append(item.tool)
                if isinstance(item, TutorReply):
                    answer = item.answer
        turns.append(
            {
                "tools": tools,
                "loaded": loaded,
                "in_effect": in_effect,
                "answer": answer,
                "seconds": round(time.perf_counter() - started, 1),
            }
        )
    return {"case": case_id, "group": group, "expected": expected, "turns": turns}


async def measure(lm: dspy.LM, draws: int, ladder_draws: int) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def one(case: tuple) -> dict:
        async with gate:
            return await draw(case, lm)

    cases = [
        case
        for case in CASES
        for _ in range(ladder_draws if case[1] == "ladder" else draws)
    ]
    drawn = await asyncio.gather(*(one(case) for case in cases), return_exceptions=True)
    # A failed turn is a result to count, not a crash.
    return [
        {"case": case[0], "group": case[1], "error": repr(result)[:300]}
        if isinstance(result, BaseException)
        else result
        for case, result in zip(cases, drawn, strict=True)
    ]


async def wire_of_ladder(settings: Settings) -> dict:
    """One two-turn conversation run alone, so each request body can be told to
    its turn: the first request of each turn, which names the tools it may call."""
    transport = RecordingTransport()
    lm = model(settings, transport)
    memory = InMemoryConversationStore()
    firsts = []
    for message in CASES[-1][2]:
        _LOADED.set([])
        before = len(transport.bodies)
        with dspy.context(lm=lm.copy()):
            async for _ in Tutor(memory).stream("c", message, CONTEXT):
                pass
        firsts.append(transport.bodies[before])
    return {
        "chars_of_each_turns_first_request": [len(json.dumps(b)) for b in firsts],
        "turn_2_first_request": firsts[-1],
    }


def summary(results: list[dict]) -> str:
    groups: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        groups[result["group"]].append(result)
    lines = []
    for group, rows in groups.items():
        ok = [row for row in rows if "error" not in row]
        lines.append(f"{group}: {len(ok)} conversations, {len(rows) - len(ok)} errors")
        for case_id in dict.fromkeys(row["case"] for row in rows):
            mine = [row for row in ok if row["case"] == case_id]
            for row in mine:
                lines.append(
                    f"  {case_id:10} "
                    + " | ".join(
                        f"{turn['tools']} {turn['loaded']}" for turn in row["turns"]
                    )
                )
    ladder = [row for row in results if row["group"] == "ladder" and "turns" in row]
    if ladder:
        first_loaded = sum(
            "explaining-a-mistake" in r["turns"][0]["loaded"] for r in ladder
        )
        reloaded = sum(bool(r["turns"][1]["loaded"]) for r in ladder)
        in_effect = sum(
            "explaining-a-mistake"
            in {*r["turns"][1]["loaded"], *r["turns"][1]["in_effect"]}
            for r in ladder
        )
        gave_it = sum(
            bool(GIVES_ANSWER.search(r["turns"][1]["answer"])) for r in ladder
        )
        lines.append(
            f"ladder: {len(ladder)} draws; explaining-a-mistake on turn 1: {first_loaded}; "
            f"a skill loaded again on turn 2: {reloaded}; "
            f"explaining-a-mistake in effect on turn 2: {in_effect}; "
            f"turn 2 gives the full answer ({RIGHT_ANSWER}): {gave_it}"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--wire", type=Path)
    parser.add_argument("--draws", type=int, default=3)
    parser.add_argument("--ladder-draws", type=int, default=12)
    parser.add_argument("--env-file")
    parser.add_argument("--without-skills", action="store_true")
    options = parser.parse_args()
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    if options.without_skills:
        remove_skills()
    else:
        record_skill_loads()
    check_the_tutor(options.without_skills)
    transport = RecordingTransport()
    lm = model(settings, transport)
    results = asyncio.run(measure(lm, options.draws, options.ladder_draws))
    options.out.write_text(json.dumps(results, indent=2))
    if options.wire:
        options.wire.write_text(
            json.dumps(asyncio.run(wire_of_ladder(settings)), indent=2)
        )
    print(summary(results))


if __name__ == "__main__":
    main()
