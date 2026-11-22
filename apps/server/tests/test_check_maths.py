"""check_maths: the tutor asks KaTeX, in the tutor Worker, whether its LaTeX renders."""

import asyncio
import json

import pytest

from app.agent import maths_check
from app.agent.context import LearnerContext
from app.agent.maths_check import (
    MAX_FORMULAS,
    UNAVAILABLE,
    MathsCheckError,
    check_maths_tool,
    tutor_worker_checker,
)
from app.agent.refusal import refusal
from app.agent.reply import AddTopic, Outcome, RebuildPlan
from app.agent.toolkit import Turn, TurnOutputs, tools_for
from app.agent.tools_known import READ_ONLY_TOOLS
from app.agent.turn_policy import ONE_CHANGE, admit

ROOM = 5
REBUILD = Outcome(told={"done": True}, actions=(RebuildPlan(),))
ADD = Outcome(
    told={},
    actions=(AddTopic(subject_slug="maths", subject="Maths", topic="Fractions"),),
)
BAD = {"ok": False, "error": "Undefined control sequence: \\foo", "at": 4}


def checker_of(*results):
    asked: list[list[str]] = []

    async def check(formulas):
        asked.append(formulas)
        return [results[n % len(results)] for n in range(len(formulas))]

    return check, asked


def run(tool, *args):
    return asyncio.run(tool(*args))


def test_every_formula_is_listed_with_its_verdict_and_the_error_of_a_failure():
    check, asked = checker_of({"ok": True}, BAD)
    told = run(check_maths_tool(check), ["x^2", "1 + \\foo{2}"])

    assert asked == [["x^2", "1 + \\foo{2}"]]
    assert told["results"] == [
        {"n": 1, "formula": "x^2", "ok": True},
        {
            "n": 2,
            "formula": "1 + \\foo{2}",
            "ok": False,
            "error": "Undefined control sequence: \\foo",
            "at": 4,
        },
    ]
    assert "Correct each formula that failed" in told["next"]


def test_all_formulas_passing_asks_for_no_correction():
    check, _ = checker_of({"ok": True})
    assert "next" not in run(check_maths_tool(check), ["x"])


def test_nothing_to_check_asks_no_one():
    check, asked = checker_of({"ok": True})
    told = run(check_maths_tool(check), ["", "  "])
    assert asked == []
    assert "no formula" in told["note"]


def test_formulas_past_the_workers_caps_are_checked_in_part_and_said_so():
    check, asked = checker_of({"ok": True})
    many = [f"x_{n}" for n in range(MAX_FORMULAS + 3)]
    told = run(check_maths_tool(check), [*many, "y" * 2001])

    assert len(asked[0]) == MAX_FORMULAS
    assert len(told["results"]) == MAX_FORMULAS
    assert (
        "x_20" in told["not_checked"] and "over 2000 characters" in told["not_checked"]
    )


def test_a_long_formula_is_shown_cut_but_checked_whole():
    check, asked = checker_of({"ok": True})
    told = run(check_maths_tool(check), ["z" * 500])
    assert asked == [["z" * 500]]
    assert told["results"][0]["formula"] == "z" * 60 + "..."


@pytest.mark.parametrize(
    "failure",
    [
        RuntimeError("the binding is down"),
        MathsCheckError("the maths check timed out"),
        TimeoutError(),
    ],
)
def test_a_check_that_fails_tells_the_model_to_write_the_answer_anyway(failure):
    async def broken(_formulas):
        raise failure

    told = run(check_maths_tool(broken), ["x"])
    assert told == UNAVAILABLE
    assert "Write the answer anyway" in told["unavailable"]


def test_with_no_worker_to_ask_the_check_is_unavailable():
    assert run(check_maths_tool(None), ["x"]) == UNAVAILABLE


def test_the_unavailable_check_logs_no_formula(caplog):
    async def broken(_formulas):
        raise RuntimeError("secret \\formula")

    run(check_maths_tool(broken), ["secret \\formula"])
    assert "secret" not in caplog.text


def test_the_model_reads_the_instruction_and_the_argument():
    tool = check_maths_tool(None)
    assert tool.__name__ == "check_maths"
    assert tool.__doc__.startswith("Check LaTeX before you use it in an answer")
    assert "without the $ signs" in tool.__doc__
    assert "fix any that fails" in tool.__doc__


def test_it_is_among_the_tutors_tools_and_a_read_only_one():
    names = [t.__name__ for t in tools_for(Turn(LearnerContext(), "hi"), TurnOutputs())]
    assert "check_maths" in names
    assert "check_maths" in READ_ONLY_TOOLS


def _built(outputs, checker):
    built = tools_for(Turn(LearnerContext(), "hi", maths=checker), outputs)
    return {tool.__name__: tool for tool in built}


def test_it_does_not_take_the_one_change_slot_of_a_turn():
    check, _ = checker_of({"ok": True})
    outputs = TurnOutputs()
    tools = _built(outputs, check)

    run(tools["check_maths"], ["x"])
    assert outputs.actions == []

    assert admit(outputs.actions, REBUILD, ROOM) == {"done": True}
    run(tools["check_maths"], ["y"])
    assert outputs.actions == list(REBUILD.actions)


def test_a_check_between_two_changes_leaves_the_second_refused_as_before():
    check, _ = checker_of({"ok": True})
    outputs = TurnOutputs()
    tools = _built(outputs, check)

    admit(outputs.actions, REBUILD, ROOM)
    assert run(tools["check_maths"], ["x"])["results"][0]["ok"] is True
    assert admit(outputs.actions, ADD, ROOM) == refusal(ONE_CHANGE)
    assert outputs.actions == list(REBUILD.actions)


class FakeResponse:
    def __init__(self, status, body):
        self.status = status
        self._body = body

    async def json(self):
        return self._body


class FakeBinding:
    def __init__(self, response=None, error=None, wait=0):
        self.calls = []
        self._response, self._error, self._wait = response, error, wait

    async def fetch(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self._wait:
            await asyncio.sleep(self._wait)
        if self._error:
            raise self._error
        return self._response


class FakeEnv:
    def __init__(self, binding):
        self.TUTOR = binding


def test_the_service_binding_is_asked_with_the_formulas_as_json():
    binding = FakeBinding(FakeResponse(200, {"results": [{"ok": True}]}))
    results = asyncio.run(tutor_worker_checker(FakeEnv(binding))(["x^2"]))

    assert results == [{"ok": True}]
    url, kwargs = binding.calls[0]
    assert url == "https://tutor/maths/check"
    assert kwargs["method"] == "POST"
    assert json.loads(kwargs["body"]) == {"formulas": ["x^2"]}


@pytest.mark.parametrize(
    "binding",
    [
        FakeBinding(FakeResponse(500, {})),
        FakeBinding(FakeResponse(413, {"detail": "too many"})),
        FakeBinding(FakeResponse(200, {"results": []})),
        FakeBinding(error=RuntimeError("no such service")),
    ],
)
def test_a_worker_that_fails_or_answers_wrongly_leaves_the_turn_unblocked(binding):
    tool = check_maths_tool(tutor_worker_checker(FakeEnv(binding)))
    assert run(tool, ["x"]) == UNAVAILABLE


def test_a_worker_that_does_not_answer_in_time_leaves_the_turn_unblocked(monkeypatch):
    monkeypatch.setattr(maths_check, "CHECK_TIMEOUT_SECONDS", 0.05)
    binding = FakeBinding(FakeResponse(200, {"results": [{"ok": True}]}), wait=5)
    tool = check_maths_tool(tutor_worker_checker(FakeEnv(binding)))
    assert run(tool, ["x"]) == UNAVAILABLE
