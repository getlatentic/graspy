"""Measure whether the tutor uses check_maths, and what it costs: twenty-three fixed
English messages, each drawn several times through the real tutor with the model and
settings of --profile and --env-file, DSPy's cache off, and KaTeX run by the real
handler of the tutor Worker (apps/tutor/src/maths-check.ts) behind the same
service-binding call the Worker makes (tutor_worker_checker).

    node ../tutor/bench/maths-check-server.ts 8797 &       # the Worker's handler, locally
    uv run python scripts/measure_check_maths.py --arm before --out before.json \
        --profile gpt-oss-120b --env-file ../../apps/server/.dev.vars
    uv run python scripts/measure_check_maths.py --arm after --out after.json ...
    uv run python scripts/measure_check_maths.py --report before.json after.json

--arm before removes the check_maths tool and the rule that asks for it: the tutor as it was.
--native sends the tools as native tool calls (LLM_NATIVE_TOOLS=true).
The three "corrupt" cases hand the model a failing result for the first formula of its first
check: the harness corrupts the formula (a typo in its first command, or a dangling ^), runs the
real checker on that, and returns that formula and KaTeX's real error, as if the first draft had
been written so. Whether the model then writes the right formula is what they measure.

The answer scored is the one the learner is sent (after the server's own maths repair), and a
formula is a span of $...$ or $$...$$ in it, each run through the same checker.
"""

from __future__ import annotations

import argparse
import asyncio
import contextvars
import dataclasses
import functools
import json
import os
import re
import time
import traceback
from collections import defaultdict
from pathlib import Path
from statistics import mean

import dspy
import httpx
from measure_stage_writing import add_profile_option, model, settings_from
from wire_record import CALLS, RecordingTransport, read_calls

import app.agent.toolkit as toolkit_module
import app.agent.tutor as tutor_module
from app.agent.context import LearnerContext
from app.agent.maths_check import tutor_worker_checker
from app.agent.memory import InMemoryConversationStore
from app.agent.streaming import ToolActivity
from app.agent.tutor import Tutor, TutorReply

CHECKER_URL = "http://127.0.0.1:{port}/maths/check"
CONCURRENT_DRAWS = 6
CONTEXT = LearnerContext.model_validate(
    {
        "country": "Nigeria",
        "language": "English",
        "gradeLevel": "SS 2",
        "subject": "Mathematics",
        "subjectSlug": "mathematics",
        "topic": "Algebra",
        "topics": ["Algebra", "Matrices", "Statistics"],
        "subjects": [
            {"name": "Mathematics", "slug": "mathematics"},
            {"name": "Chemistry", "slug": "chemistry"},
        ],
    }
)
RULE = (
    "When your answer holds a formula, first call check_maths with each formula\n"
    "as LaTeX without delimiters, correct the ones that fail from their errors,\n"
    "then write the answer. An answer with no formula needs no check.\n"
)

# (id, kind, message): kind "maths" answers should hold a formula, "plain" should not,
# "corrupt" is a maths case whose first check is handed a broken first formula.
CASES = [
    ("fraction-add", "maths", "Show me how to add 1/2 and 1/3 step by step."),
    (
        "fraction-compare",
        "maths",
        "Which is bigger, 3/4 or 5/8? Show the working with fractions.",
    ),
    ("quadratic-factor", "maths", "Solve x^2 - 5x + 6 = 0 and show each step."),
    (
        "quadratic-formula",
        "maths",
        "Write out the quadratic formula and use it on 2x^2 + 3x - 5 = 0.",
    ),
    (
        "matrix-product",
        "maths",
        "Multiply the matrices [[1,2],[3,4]] and [[0,1],[1,0]] and show the matrices.",
    ),
    (
        "matrix-det",
        "maths",
        "What is the determinant of the matrix [[2,3],[1,4]]? Show how you get it.",
    ),
    (
        "blanks-fractions",
        "maths",
        "Make me a short worksheet of three fill-in-the-blank fraction sums, with a blank for each answer.",
    ),
    (
        "blanks-missing",
        "maths",
        "Give me three missing-number problems like ___ + 3 = 7 for practice, as a worksheet.",
    ),
    (
        "mean-sd",
        "maths",
        "What are the formulas for the mean and standard deviation? Use my data 4, 8, 6, 5, 7.",
    ),
    (
        "variance",
        "maths",
        "Explain variance with its formula, and work it out for 2, 4, 4, 4, 5, 5, 7, 9.",
    ),
    ("inequality", "maths", "Solve 3x - 7 < 11 and write the answer as an inequality."),
    ("inequality-compound", "maths", "Solve -2 <= 2x + 4 < 10 and show each step."),
    (
        "chem-combustion",
        "maths",
        "Write the balanced equation for burning methane, and for the rusting of iron.",
    ),
    (
        "chem-sodium",
        "maths",
        "Write the equation for sodium reacting with water, using chemical formulas.",
    ),
    (
        "circle",
        "maths",
        "Explain the area and circumference of a circle with their formulas.",
    ),
    (
        "indices",
        "maths",
        "Simplify the square root of 50, and (2^3 * 2^4) / 2^2, naming the laws of indices.",
    ),
    ("percent", "maths", "What is 15% of 240? Explain how you work it out."),
    (
        "words-decimal",
        "plain",
        "Why do we write decimals with a point? Answer in words only.",
    ),
    ("thanks", "plain", "Thanks, that was helpful!"),
    (
        "words-numerator",
        "plain",
        "In one or two sentences with no formulas, what is a numerator?",
    ),
    ("corrupt-fraction", "corrupt", "Show me how to add 1/2 and 1/3 step by step."),
    ("corrupt-quadratic", "corrupt", "Solve x^2 - 5x + 6 = 0 and show each step."),
    (
        "corrupt-matrix",
        "corrupt",
        "Multiply the matrices [[1,2],[3,4]] and [[0,1],[1,0]] and show the matrices.",
    ),
]

_LOG: contextvars.ContextVar[list[dict]] = contextvars.ContextVar("log")
_CORRUPT: contextvars.ContextVar[bool] = contextvars.ContextVar("corrupt")
_PORT = 8797

BLOCK = re.compile(r"\$\$(.+?)\$\$", re.DOTALL)
INLINE = re.compile(r"(?<!\\)\$(.+?)(?<!\\)\$", re.DOTALL)


def formulas_in(answer: str) -> list[str]:
    """Every maths span of the answer as the learner's app reads it."""
    blocks = BLOCK.findall(answer)
    rest = BLOCK.sub(" ", answer)
    return [span.strip() for span in [*blocks, *INLINE.findall(rest)] if span.strip()]


class _Response:
    def __init__(self, response: httpx.Response) -> None:
        self.status = response.status_code
        self._response = response

    async def json(self):
        return self._response.json()


class _Binding:
    """The TUTOR service binding, which here reaches the Worker's handler over local HTTP."""

    async def fetch(self, url, method, headers, body):
        async with httpx.AsyncClient(timeout=10) as client:
            path = CHECKER_URL.format(port=_PORT)
            return _Response(
                await client.request(method, path, headers=headers, content=body)
            )


class _Env:
    TUTOR = _Binding()


async def real_results(formulas: list[str]) -> list[dict]:
    return await tutor_worker_checker(_Env())(formulas)


async def verdicts_of(spans: list[str]) -> list[dict]:
    """The checker's verdict on every span of an answer, a batch within its caps at a time."""
    verdicts: list[dict] = []
    batch: list[str] = []
    for span in [*spans, None]:
        full = (
            span is None or len(batch) == 20 or sum(map(len, batch)) + len(span) > 8000
        )
        if full and batch:
            verdicts += await real_results(batch)
            batch = []
        if span is not None:
            batch.append(span[:2000])
    return verdicts


def corrupted(formula: str) -> str:
    """A typo in the formula's first command, or a dangling ^ where it has none."""
    return (
        re.sub(r"\\([A-Za-z]+)", r"\\\1x", formula, count=1)
        if "\\" in formula
        else f"{formula}^"
    )


def recording_check_maths() -> None:
    """Notes what each check_maths call was given and answered, and in a corrupt case
    corrupts the first formula of the first call."""
    chosen = next(spec for spec in toolkit_module.TOOLS if spec.name == "check_maths")

    def build(turn):
        tool = chosen.build(turn)

        @functools.wraps(tool)
        async def recording(formulas):
            log = _LOG.get()
            sent = list(formulas)
            if _CORRUPT.get() and not log and sent:
                sent[0] = corrupted(sent[0])
            told = await tool(sent)
            log.append(
                {"formulas": sent, "told": told, "corrupted": sent != list(formulas)}
            )
            return told

        return recording

    toolkit_module.TOOLS = tuple(
        dataclasses.replace(spec, build=build) if spec.name == "check_maths" else spec
        for spec in toolkit_module.TOOLS
    )


def remove_check_maths() -> None:
    toolkit_module.TOOLS = tuple(
        spec for spec in toolkit_module.TOOLS if spec.name != "check_maths"
    )
    signature_for = tutor_module.signature_for

    def without_the_rule(context):
        signature = signature_for(context)
        if RULE not in signature.instructions:
            raise SystemExit(
                "The tutor's rule for check_maths is not as this script knows it."
            )
        return signature.with_instructions(signature.instructions.replace(RULE, ""))

    tutor_module.signature_for = without_the_rule


def check_the_tutor(arm: str) -> None:
    names = [
        t.__name__
        for t in toolkit_module.tools_for(
            toolkit_module.Turn(CONTEXT, "", maths=real_results),
            toolkit_module.TurnOutputs(),
        )
    ]
    told = tutor_module.signature_for(CONTEXT).instructions
    if (arm == "after") != ("check_maths" in names) or (arm == "after") != (
        RULE in told
    ):
        raise SystemExit("The tutor is not the one asked for: update this script.")


async def draw(case: tuple, lm: dspy.LM, number: int) -> dict:
    case_id, kind, message = case
    _LOG.set(log := [])
    _CORRUPT.set(kind == "corrupt")
    records: list[dict] = []
    CALLS.set(records)
    tools: list[str] = []
    answer = ""
    started = time.perf_counter()
    memory = InMemoryConversationStore()
    with dspy.context(lm=lm.copy()):
        async for item in Tutor(memory, tutor_worker_checker(_Env())).stream(
            "c", message, CONTEXT
        ):
            if isinstance(item, ToolActivity):
                tools.append(item.tool)
            if isinstance(item, TutorReply):
                answer = item.answer
    seconds = time.perf_counter() - started
    known = {spec.name for spec in toolkit_module.TOOLS} | {"finish"}
    calls = read_calls(records, known)
    spans = formulas_in(answer)
    verdicts = await verdicts_of(spans)
    return {
        "case": case_id,
        "kind": kind,
        "draw": number,
        "tools": tools,
        "checks": log,
        "answer": answer,
        "spans": spans,
        "rejected": [
            s for s, v in zip(spans, verdicts, strict=True) if not v.get("ok")
        ],
        "seconds": round(seconds, 2),
        "model_calls": len(calls),
        "prompt_tokens": sum(c["prompt_tokens"] or 0 for c in calls),
        "completion_tokens": sum(c["completion_tokens"] or 0 for c in calls),
    }


async def measure(lm: dspy.LM, draws: int) -> list[dict]:
    gate = asyncio.Semaphore(CONCURRENT_DRAWS)

    async def one(case: tuple, number: int) -> dict:
        async with gate:
            return await draw(case, lm, number)

    jobs = [(case, n) for case in CASES for n in range(draws)]
    drawn = await asyncio.gather(*(one(*job) for job in jobs), return_exceptions=True)
    return [
        {
            "case": case[0],
            "kind": case[1],
            "draw": n,
            "error": repr(result)[:300],
            "trace": "".join(traceback.format_exception(result))[-1500:],
        }
        if isinstance(result, BaseException)
        else result
        for (case, n), result in zip(jobs, drawn, strict=True)
    ]


def pct(part: int, whole: int) -> str:
    return f"{part}/{whole} ({100 * part / whole:.0f}%)" if whole else "0/0"


def covered(row: dict) -> tuple[int, int]:
    """How many of the answer's formulas were among the ones the model asked about."""
    asked = {f.replace(" ", "") for check in row["checks"] for f in check["formulas"]}
    spans = [s.replace(" ", "") for s in row["spans"]]
    return sum(s in asked for s in spans), len(spans)


def summary(name: str, results: list[dict]) -> list[str]:
    ok = [r for r in results if "error" not in r]
    holds = [r for r in ok if r["spans"]]
    plain = [r for r in ok if not r["spans"]]
    called = lambda r: "check_maths" in r["tools"]
    in_covered = [covered(r) for r in holds]
    corrupt = [r for r in ok if r["kind"] == "corrupt" and r["checks"]]
    fixed = [
        r
        for r in corrupt
        if not r["rejected"]
        and not any(
            c["corrupted"] and c["formulas"][0] in r["answer"] for c in r["checks"]
        )
    ]
    rechecked = [r for r in corrupt if len(r["checks"]) > 1]
    lines = [
        f"== {name}: {len(results)} draws, {len(results) - len(ok)} errors",
        f"(a) answers with a formula that called check_maths: {pct(sum(map(called, holds)), len(holds))}",
        f"(b) answers with a formula that skipped it: {pct(sum(not called(r) for r in holds), len(holds))}",
        f"    answers with no formula that called it: {pct(sum(map(called, plain)), len(plain))}",
        "    formulas in answers that were among those checked: "
        + pct(sum(a for a, _ in in_covered), sum(b for _, b in in_covered)),
        "(c) answers holding a formula KaTeX rejects: "
        + pct(sum(bool(r["rejected"]) for r in ok), len(ok))
        + ", of all formulas: "
        + pct(sum(len(r["rejected"]) for r in ok), sum(len(r["spans"]) for r in ok)),
        (
            f"(d) seconds per turn {mean(r['seconds'] for r in ok):.1f}; model calls {mean(r['model_calls'] for r in ok):.1f}; "
            f"prompt tokens {mean(r['prompt_tokens'] for r in ok):.0f}; completion tokens {mean(r['completion_tokens'] for r in ok):.0f}"
        ),
    ]
    if corrupt:
        lines.append(
            f"corrupt first draft: {len(corrupt)} draws that reached a check; final answer clean and without the typo "
            f"{pct(len(fixed), len(corrupt))}; checked again after the failure {pct(len(rechecked), len(corrupt))}"
        )
    return lines


def by_case(results: list[dict]) -> list[str]:
    rows: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        if "error" not in r:
            rows[r["case"]].append(r)
    return [
        f"  {case:20} called {sum('check_maths' in r['tools'] for r in rs)}/{len(rs)}"
        f"  formulas in answer {sum(bool(r['spans']) for r in rs)}/{len(rs)}"
        f"  rejected {sum(bool(r['rejected']) for r in rs)}/{len(rs)}"
        for case, rs in rows.items()
    ]


def report(paths: list[Path]) -> None:
    for path in paths:
        results = json.loads(path.read_text())
        print("\n".join(summary(path.stem, results)))
        print("\n".join(by_case(results)))


def main() -> None:
    global _PORT
    parser = argparse.ArgumentParser()
    parser.add_argument("--arm", choices=["before", "after"])
    parser.add_argument("--out", type=Path)
    parser.add_argument("--draws", type=int, default=5)
    parser.add_argument("--port", type=int, default=_PORT)
    parser.add_argument("--only", help="comma-separated case ids")
    parser.add_argument("--native", action="store_true")
    parser.add_argument("--env-file")
    parser.add_argument("--report", nargs="+", type=Path)
    add_profile_option(parser)
    options = parser.parse_args()
    if options.report:
        report(options.report)
        return
    if not (options.arm and options.out):
        parser.error("--arm and --out are required")
    _PORT = options.port
    if options.native:
        os.environ["LLM_NATIVE_TOOLS"] = "true"
    settings = settings_from(options)
    if options.arm == "before":
        remove_check_maths()
    else:
        recording_check_maths()
    check_the_tutor(options.arm)
    if options.only:
        CASES[:] = [c for c in CASES if c[0] in options.only.split(",")]
    lm = model(settings, RecordingTransport())
    print(f"tools as native calls: {lm.supports_function_calling}")
    results = asyncio.run(measure(lm, options.draws))
    options.out.write_text(json.dumps(results, indent=2))
    report([options.out])


if __name__ == "__main__":
    main()
