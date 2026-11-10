"""Measure what the tutor's guards stop (planning #713): each case in
guard_cases.json, drawn several times through the real tutor with the model and
settings in .env and DSPy's cache off. Each draw keeps what the model wrote
and what the learner was sent, and both are scored by the case's own patterns,
with no model judging.

    uv run python scripts/measure_guards.py --out guards.json
    uv run python scripts/measure_guards.py --instructions-file old.txt --out before.json

--instructions-file replaces the tutor's instructions, to measure a different prompt.
"""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import json
import re
import statistics
import time
from collections import defaultdict
from pathlib import Path

import dspy
from measure_stage_writing import model

import app.agent.passage as passage_module
import app.agent.practice as practice_module
import app.agent.tutor as tutor_module
from app.agent.answer_gate import AnswerGate
from app.agent.app_tools import app_calls
from app.agent.cards import Card
from app.agent.choices import plain
from app.agent.context import LearnerContext
from app.agent.memory import InMemoryConversationStore
from app.agent.safety_screen import SafetyScreen
from app.agent.streaming import AnswerDelta
from app.agent.tutor import Tutor, TutorReply
from app.settings import Settings

CASES = Path(__file__).with_name("guard_cases.json")
CONCURRENT_DRAWS = 6
_GATES: contextvars.ContextVar[list[AnswerGate]] = contextvars.ContextVar("gates")
_REFUSED: contextvars.ContextVar[list[str]] = contextvars.ContextVar("refused")
_SCREENS: contextvars.ContextVar[list[SafetyScreen]] = contextvars.ContextVar("screens")


class RecordingGate(AnswerGate):
    def __init__(self, *args) -> None:
        super().__init__(*args)
        _GATES.get().append(self)


class RecordingScreen(SafetyScreen):
    """Keeps the sentences it stopped, for reading here and never in the app's log."""

    def __init__(self, *args) -> None:
        super().__init__(*args)
        self.stopped_sentences: list[tuple[str, str]] = []
        _SCREENS.get().append(self)

    async def _check(self, sentence: str, before: str) -> str | None:
        reason = await super()._check(sentence, before)
        if reason:
            self.stopped_sentences.append((reason, sentence.strip()))
        return reason


class NoScreen(SafetyScreen):
    """Every sentence passes unchecked: the turn as it was before the safety stage."""

    async def _check(self, block: str, before: str) -> str | None:
        return None


def counting(original):
    def check(*args):
        problem = original(*args)
        if problem:
            _REFUSED.get().append(problem)
        return problem

    return check


def tap_of(spec: dict, chosen: int) -> list:
    arguments = {**spec, "chosenIndex": chosen}
    request = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": "answer_practice", "arguments": arguments},
    }
    return app_calls([{"data": {"appCalls": [request]}}])


def shown_questions(cards: list[Card]) -> list:
    return [q for card in cards for q in card.tool_result.structured_content.questions]


def appears(text: str, wanted: str) -> bool:
    return (
        re.search(rf"(?<![\w.]){re.escape(plain(wanted))}(?![\w])", plain(text))
        is not None
    )


def card_leaks(answer: str, cards: list[Card]) -> bool:
    """The question's words or its right option in the answer, or the right
    option in a hint or a note shown with it."""
    for question in shown_questions(cards):
        right = question.options[question.answer_index]
        if plain(question.question) in plain(answer):
            return True
        if appears(answer, right) and re.search(
            r"(?i)\b(answer|correct|right)\b", answer
        ):
            return True
    return False


def note_leaks(cards: list[Card]) -> bool:
    for question in shown_questions(cards):
        right = question.options[question.answer_index]
        for note in (question.hint, question.incorrect_feedback):
            if appears(note, right) and not appears(question.question, right):
                return True
    return False


def violates(case: dict, spec: dict, answer: str, reply: TutorReply) -> bool:
    kind = case["forbidden"]
    if kind == "pattern":
        return bool(re.search(case["pattern"], answer))
    if kind == "blocked":
        return False
    if kind == "card":
        return bool(reply.cards) and card_leaks(answer, reply.cards)
    if kind == "claims_done_without_action":
        return bool(re.search(spec["claims_done"], answer)) and not reply.actions
    pattern = spec[f"verdict_{kind}"] if kind.startswith("says_") else spec[kind]
    return bool(re.search(pattern, answer))


async def draw(spec: dict, case: dict, lm: dspy.LM) -> dict:
    _GATES.set([])
    _SCREENS.set([])
    _REFUSED.set([])
    context = LearnerContext.model_validate(spec["context"])
    tapped = case["tapped"]
    calls = None if tapped is None else tap_of(spec["tap"], tapped)
    items, first_text = [], None
    started = time.perf_counter()
    with dspy.context(lm=lm.copy()):
        async for item in Tutor(InMemoryConversationStore()).stream(
            "c", case["message"], context, calls
        ):
            if first_text is None and isinstance(item, AnswerDelta):
                first_text = time.perf_counter() - started
            items.append(item)
    seconds = time.perf_counter() - started
    reply = items[-1]
    assert isinstance(reply, TutorReply)
    gates = _GATES.get()
    stopped = [screen.reason for screen in _SCREENS.get() if screen.reason]
    return {
        "case": case["id"],
        "raw": gates[-1].raw,
        "delivered": reply.answer,
        "raw_violation": violates(case, spec, gates[-1].raw, reply),
        "delivered_violation": violates(case, spec, reply.answer, reply),
        "dropped": [b.value for gate in gates for b in gate.breaches],
        "stopped": stopped,
        "stopped_sentences": [
            found for screen in _SCREENS.get() for found in screen.stopped_sentences
        ],
        "seconds": seconds,
        "first_text_seconds": first_text,
        "cards": len(reply.cards),
        "refused_for_notes": len(_REFUSED.get()),
        "delivered_note_leak": note_leaks(reply.cards),
    }


async def measure(spec: dict, lm: dspy.LM, draws: int) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def one(case: dict) -> dict:
        async with gate:
            return await draw(spec, case, lm)

    cases = [case for case in spec["cases"] for _ in range(draws)]
    drawn = await asyncio.gather(*(one(case) for case in cases), return_exceptions=True)
    # A failed turn is a result to count, not a crash.
    return [
        {"case": case["id"], "error": repr(result)[:300]}
        if isinstance(result, BaseException)
        else result
        for case, result in zip(cases, drawn, strict=True)
    ]


def summary(results: list[dict]) -> str:
    by_case: dict[str, list[dict]] = defaultdict(list)
    for result in results:
        by_case[result["case"]].append(result)
    lines = [
        "case | draws | failed | model wrote it | learner was sent it | cards | refused for notes | note leaks shown | ended by the safety check"
    ]
    for case, rows in by_case.items():
        done = [r for r in rows if "error" not in r]
        lines.append(
            f"{case} | {len(rows)} | {len(rows) - len(done)} | "
            f"{sum(r['raw_violation'] for r in done)} | "
            f"{sum(r['delivered_violation'] for r in done)} | "
            f"{sum(r['cards'] for r in done)} | "
            f"{sum(r['refused_for_notes'] for r in done)} | "
            f"{sum(r['delivered_note_leak'] for r in done)} | "
            f"{sum(bool(r['stopped']) for r in done)}"
        )
    timed = [r for r in results if r.get("first_text_seconds")]
    if timed:
        lines.append(
            f"median seconds: first text {statistics.median(r['first_text_seconds'] for r in timed):.2f}, "
            f"whole turn {statistics.median(r['seconds'] for r in timed):.2f}"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--draws", type=int)
    parser.add_argument("--instructions-file", type=Path)
    parser.add_argument("--env-file")
    parser.add_argument("--only", help="comma-separated case ids")
    parser.add_argument(
        "--without-safety",
        action="store_true",
        help="send every sentence unchecked, to time the turn without the safety stage",
    )
    options = parser.parse_args()
    spec = json.loads(CASES.read_text())
    if options.only:
        wanted = set(options.only.split(","))
        spec["cases"] = [case for case in spec["cases"] if case["id"] in wanted]
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    if options.instructions_file:
        signature = tutor_module.TutorTurn.with_instructions(
            options.instructions_file.read_text()
        )
        tutor_module.signature_for = lambda _context: signature
    tutor_module.AnswerGate = RecordingGate
    tutor_module.SafetyScreen = NoScreen if options.without_safety else RecordingScreen
    practice_module.key_leak = counting(practice_module.key_leak)
    passage_module.key_leak = counting(passage_module.key_leak)
    results = asyncio.run(
        measure(spec, model(settings), options.draws or spec["draws"])
    )
    options.out.write_text(json.dumps(results, indent=1))
    print(summary(results))


if __name__ == "__main__":
    main()
