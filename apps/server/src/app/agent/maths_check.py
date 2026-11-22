"""The tutor's check on its own LaTeX, run by KaTeX in the tutor Worker.

KaTeX is JavaScript, so the formulas go to the `graspy-tutor` Worker (apps/tutor/src/maths-check.ts)
through the TUTOR service binding. The model reads which formulas fail and why, and corrects them
before it writes the answer. The check never blocks a turn: when the Worker cannot be reached or does
not answer in time, the model is told to write the answer anyway.

The formulas are the learner's words and the model's: they are never logged here.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

MATHS_CHECK_URL = "https://tutor/maths/check"
CHECK_TIMEOUT_SECONDS = 5
# The Worker's own caps (apps/tutor/src/maths-check.ts): a longer list is checked in part, not refused.
MAX_FORMULAS = 20
MAX_FORMULA_CHARS = 2000
MAX_TOTAL_CHARS = 8000
SHOWN_CHARS = 60

MathsChecker = Callable[[list[str]], Awaitable[list[dict]]]

UNAVAILABLE = {
    "unavailable": (
        "The maths check is not available right now. Write the answer anyway, with "
        "the formulas as you have them, and do not mention the check to the learner."
    )
}
FIX_THEM = "Correct each formula that failed, using its error, then write the answer."


class MathsCheckError(RuntimeError):
    """The tutor Worker could not be reached or did not answer as agreed."""


def tutor_worker_checker(env: Any) -> MathsChecker:
    """The checker that asks the tutor Worker through the service binding of `env`."""

    async def check(formulas: list[str]) -> list[dict]:
        async def ask() -> list[dict]:
            response = await env.TUTOR.fetch(
                MATHS_CHECK_URL,
                method="POST",
                headers={"Content-Type": "application/json"},
                body=json.dumps({"formulas": formulas}),
            )
            if response.status != 200:
                raise MathsCheckError(
                    f"the maths check answered HTTP {response.status}"
                )
            return (await response.json())["results"]

        try:
            results = await asyncio.wait_for(ask(), CHECK_TIMEOUT_SECONDS)
        except TimeoutError as error:
            raise MathsCheckError("the maths check timed out") from error
        if not isinstance(results, list) or len(results) != len(formulas):
            raise MathsCheckError(
                "the maths check answered with the wrong number of results"
            )
        return results

    return check


def _shown(formula: str) -> str:
    return formula if len(formula) <= SHOWN_CHARS else f"{formula[:SHOWN_CHARS]}..."


def _admitted(formulas: list[str]) -> tuple[list[str], list[str]]:
    """The formulas to send, within the Worker's caps, and what was left out in words."""
    sent: list[str] = []
    left_out: list[str] = []
    total = 0
    for formula in formulas:
        if not isinstance(formula, str) or not formula.strip():
            continue
        if len(formula) > MAX_FORMULA_CHARS:
            left_out.append(f"a formula over {MAX_FORMULA_CHARS} characters")
        elif len(sent) >= MAX_FORMULAS or total + len(formula) > MAX_TOTAL_CHARS:
            left_out.append(_shown(formula))
        else:
            sent.append(formula)
            total += len(formula)
    return sent, left_out


def _row(n: int, formula: str, result: dict) -> dict:
    row: dict[str, Any] = {
        "n": n,
        "formula": _shown(formula),
        "ok": result.get("ok") is True,
    }
    if not row["ok"]:
        row["error"] = str(result.get("error") or "KaTeX cannot render it")
        if isinstance(result.get("at"), int):
            row["at"] = result["at"]
    return row


def check_maths_tool(checker: MathsChecker | None) -> Callable[..., Awaitable[dict]]:
    """check_maths for one turn, with the checker its Worker provides (None where there is none)."""

    async def check_maths(formulas: list[str]) -> dict:
        """Check LaTeX before you use it in an answer: pass each formula, without the $ signs, and fix any that fails; the result lists which ones fail and why.

        Args:
            formulas: The formulas you are about to write, each as LaTeX with no delimiters, e.g. ["\\frac{1}{2} + \\frac{1}{3}", "x^2 - 5x + 6 = 0"]. At most 20.
        """
        sent, left_out = _admitted(formulas if isinstance(formulas, list) else [])
        if not sent:
            return {"note": "There was no formula to check."}
        if checker is None:
            return UNAVAILABLE
        try:
            results = await checker(sent)
        except Exception as error:  # noqa: BLE001 - a failed check must never stop a turn
            logger.warning("The maths check was unavailable: %s", type(error).__name__)
            return UNAVAILABLE
        rows = [
            _row(n, formula, result)
            for n, (formula, result) in enumerate(zip(sent, results, strict=True), 1)
        ]
        told: dict[str, Any] = {"results": rows}
        if any(not row["ok"] for row in rows):
            told["next"] = FIX_THEM
        if left_out:
            told["not_checked"] = (
                f"Too many or too long to check here: {'; '.join(left_out)}."
            )
        return told

    return check_maths
