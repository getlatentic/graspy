"""Judge two runs of measure_stage_writing.py against each other with a model.

For each learner and draw found in both runs, a judge sees the two topic
lessons, and separately the two tutor answers to each question, labelled A
and B with the learner's class and age, never which run is which. Every pair
is judged twice with A and B swapped; a preference counts only when both
orders agree, and is otherwise a tie. The judge scores A and B from 1 to 5
on each dimension of the rubric, gives a short reason and a preference.

The judge is not the model that wrote either run (gpt-oss-120b), so it does
not favour its own writing, and never a Claude model. Its id is one Bedrock
serves on bedrock-mantle in AWS_REGION.

    uv run python scripts/judge_stage_writing.py --probe --env-file ../.env
    uv run python scripts/judge_stage_writing.py \\
        --pair before.json after.json --out judged.json
    uv run python scripts/judge_stage_writing.py --report judged.json

--probe prints one judge call's request body as it went on the wire, headers
left out, and the reply as it came back. --repeat judges a few pairs again,
to show how far the judge agrees with itself.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Annotated, Literal

import dspy
import httpx
from judge_report import report
from measure_stage_writing import QUESTIONS, learners
from pydantic import BaseModel, Field

from app.llm.client import build_lm
from app.llm.transport import HttpxTransport
from app.settings import Settings

logger = logging.getLogger("judge_stage_writing")

Arm = Literal["before", "after"]
Kind = Literal["lesson", "tutor"]
CONCURRENT_CALLS = 6
Score = Annotated[int, Field(ge=1, le=5)]


class Scores(BaseModel):
    age_fit: Score
    clarity: Score
    scaffolding: Score
    correctness: Score
    local_relevance: Score


class JudgePair(dspy.Signature):
    """Judge two pieces of teaching, A and B, written for the same learner.

    Score each of A and B from 1 (poor) to 5 (excellent) on every dimension:
    - age_fit: vocabulary, sentence length and how much each idea asks of
      the learner suit this learner's age; key terms are explained.
    - clarity: the explanation is clear and easy to follow.
    - scaffolding: each step builds on the last, and a worked example comes
      before the learner is asked to try.
    - correctness: every fact, working and marked answer is right. A marked
      answer is the option shown with [marked right].
    - local_relevance: examples, names, money and places suit a learner in
      Nigeria.

    Judge A and B each on its own merits; their order says nothing about
    them, and length is no merit in itself. Then prefer the one that would
    teach this learner better, or tie when neither would."""

    learner: str = dspy.InputField(desc="The learner's class, country and age")
    task: str = dspy.InputField(
        desc="What A and B are: a topic lesson, or a tutor's answer to the "
        "learner's question"
    )
    a: str = dspy.InputField()
    b: str = dspy.InputField()

    scores_a: Scores = dspy.OutputField()
    scores_b: Scores = dspy.OutputField()
    reason: str = dspy.OutputField(desc="Why, in two or three sentences")
    preference: Literal["A", "B", "tie"] = dspy.OutputField()


@dataclass(frozen=True)
class Item:
    """One pair to judge: the same learner, draw and task in both runs."""

    # The runs it came from, as a draw's number is only unique within them.
    source: str
    learner: str
    grade_level: str
    draw: int
    kind: Kind
    task: str
    before: str
    after: str

    @property
    def key(self) -> str:
        return f"{self.source}/{self.learner}/{self.draw}/{self.task}"


def _options(options: list[str], marked: int) -> list[str]:
    return [
        f"  - {option}{' [marked right]' if n == marked else ''}"
        for n, option in enumerate(options)
    ]


def _question(label: str, prompt: str, options: list[str], marked: int, right, wrong):
    return [
        f"{label}: {prompt}",
        *_options(options, marked),
        f"  Feedback when right: {right}",
        f"  Feedback when wrong: {wrong}",
    ]


def lesson_text(lesson: dict) -> str:
    """The lesson as the learner reads it, part by part."""
    lines = ["Objectives:", *(f"- {o}" for o in lesson["objectives"])]
    lines += ["Key points:", *(f"- {p}" for p in lesson["keyPoints"])]
    for number, slide in enumerate(lesson["slides"], 1):
        check = slide["assessment"]
        lines += ["", f"Slide {number}: {slide['title']}", slide["bodyMd"], ""]
        lines += _question(
            "Check",
            check["prompt"],
            check["options"],
            check["answerIndex"],
            check.get("correctFeedback", ""),
            check.get("incorrectFeedback", ""),
        )
    practice = lesson.get("practice")
    if practice:
        lines += [""] + _question(
            "Practice question",
            practice["question"],
            practice["options"],
            practice["answerIndex"],
            practice["correctFeedback"],
            practice["incorrectFeedback"],
        )
    return "\n".join(lines)


def items(before: list[dict], after: list[dict], source: str) -> list[Item]:
    """Every pair both runs have; a draw that failed in either is left out."""
    done = {
        (arm, r["learner"], r["draw"]): r
        for arm, run in (("before", before), ("after", after))
        for r in run
        if not r["error"]
    }
    found = []
    for learner in learners():
        topic = f"A topic lesson on {learner.topic} ({learner.subject})"
        for draw in sorted({d for _, name, d in done if name == learner.name}):
            old = done.get(("before", learner.name, draw))
            new = done.get(("after", learner.name, draw))
            if not (old and new):
                continue
            pair = (source, learner.name, learner.grade_level, draw)
            found.append(
                Item(
                    *pair,
                    "lesson",
                    topic,
                    lesson_text(old["lesson_wire"]),
                    lesson_text(new["lesson_wire"]),
                )
            )
            for n, question in enumerate(QUESTIONS):
                task = f'The tutor\'s answer to the learner asking: "{question}"'
                found.append(
                    Item(
                        *pair,
                        "tutor",
                        task,
                        old["texts"]["tutor"][n],
                        new["texts"]["tutor"][n],
                    )
                )
    return found


def described(grade_level: str) -> str:
    return (
        grade_level
        if "age" in grade_level
        else f"{grade_level} (class not known), Nigeria, age not given"
    )


async def judged(item: Item, a_is: Arm, judge: dspy.LM, repeat: int = 0) -> dict:
    """One order of one pair, its scores given back to the runs they judge."""
    first, second = (item.before, item.after)[:: 1 if a_is == "before" else -1]
    b_is: Arm = "after" if a_is == "before" else "before"
    record = {**asdict(item), "a_is": a_is, "repeat": repeat, "error": None}
    del record["before"], record["after"]
    try:
        with dspy.context(lm=judge):
            verdict = await dspy.Predict(JudgePair).acall(
                learner=described(item.grade_level), task=item.task, a=first, b=second
            )
    except Exception as error:
        # A call that fails is counted apart, never read as a verdict.
        logger.exception("Judging %s with A = %s failed", item.key, a_is)
        record["error"] = f"{type(error).__name__}: {error}"
        return record
    record["scores"] = {
        a_is: verdict.scores_a.model_dump(),
        b_is: verdict.scores_b.model_dump(),
    }
    record["preferred"] = {"A": a_is, "B": b_is, "tie": "tie"}[verdict.preference]
    record["reason"] = verdict.reason
    return record


def judge_lm(settings: Settings, judge: str, transport=None) -> dspy.LM:
    dspy.configure_cache(enable_disk_cache=False, enable_memory_cache=False)
    chosen = settings.model_copy(update={"llm_model_id": judge})
    return build_lm(chosen, transport).copy(cache=False)


async def judge_all(pairs: list[Item], lm: dspy.LM, repeats: int) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT_CALLS)

    async def gated(item: Item, a_is: Arm, repeat: int) -> dict:
        async with gate:
            return await judged(item, a_is, lm, repeat)

    return await asyncio.gather(
        *(
            gated(item, a_is, repeat)
            for repeat in range(repeats)
            for item in pairs
            for a_is in ("before", "after")
        )
    )


async def probe(settings: Settings, judge: str, pairs: list[Item]) -> None:
    sent: list[bytes] = []

    async def keep(request: httpx.Request) -> None:
        sent.append(request.content)

    client = httpx.AsyncClient(event_hooks={"request": [keep]})
    lm = judge_lm(settings, judge, HttpxTransport(client))
    tutor = next(item for item in pairs if item.kind == "tutor")
    record = await judged(tutor, "before", lm)
    body = json.loads(sent[0])
    print("== request body (headers left out) ==")
    print(json.dumps({k: v for k, v in body.items() if k != "messages"}, indent=1))
    for message in body["messages"]:
        print(f"--- {message['role']} ---\n{message['content']}")
    print("== reply as it came back ==")
    print(lm.history[-1]["outputs"][0] if lm.history else "(no reply)")
    print("== as parsed ==")
    print(json.dumps(record, indent=1, ensure_ascii=False))


def _read(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def repeated(pairs: list[Item], count: int) -> list[Item]:
    """The first draw of each learner, a lesson and a tutor answer in turn,
    so every learner and both kinds are judged again."""
    first = [item for item in pairs if item.draw == 0 and QUESTIONS[1] not in item.task]
    names = list(dict.fromkeys(item.learner for item in first))
    chosen = [
        next(i for i in first if i.learner == name and i.kind == kind)
        for n, name in enumerate(names)
        for kind in [("lesson", "tutor")[n % 2]]
    ]
    rest = [item for item in first if item not in chosen]
    return (chosen + rest)[:count]


async def main(options: argparse.Namespace) -> None:
    if options.report:
        report(_read(options.report))
        return
    settings = Settings(_env_file=options.env_file) if options.env_file else Settings()
    pairs = [
        item
        for before, after in options.pair
        for item in items(_read(before), _read(after), before.stem)
    ]
    if options.probe:
        await probe(settings, options.judge, pairs)
        return
    lm = judge_lm(settings, options.judge)
    records = await judge_all(pairs, lm, 1)
    again = repeated(pairs, options.repeat)
    for record in await judge_all(again, lm, 3):
        records.append({**record, "repeat": record["repeat"] + 1})
    options.out.write_text(json.dumps(records, ensure_ascii=False, indent=1))
    print(f"judge: {options.judge}   pairs: {len(pairs)}   details: {options.out}")
    report(records)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--pair",
        nargs=2,
        action="append",
        type=Path,
        default=[],
        metavar=("BEFORE", "AFTER"),
        help="Two runs of measure_stage_writing.py; repeat for more",
    )
    parser.add_argument("--judge", default="deepseek.v3.2")
    parser.add_argument("--env-file", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=Path("stage-writing-judged.json"))
    parser.add_argument(
        "--repeat", type=int, default=6, help="Pairs judged three more times"
    )
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--report", type=Path, help="Report a judged file again")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.WARNING)
    asyncio.run(main(args))
