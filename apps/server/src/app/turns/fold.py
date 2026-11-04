"""Where a turn has got to, read from the events of its chat.

A turn is one message and its answer. Its events carry the turn's id in `data["turn"]`:

    turn.started   {turn, job}            the turn was accepted; `job` is what is needed to run it
    user           {turn, text, app?}     the learner's message
    turn.resumed   {turn, run}            a run of the turn began (the first run too)
    text           {turn, run, text}      words of the answer, as they were written
    tool.started   {turn, run, tool}      a tool was called
    tool           {turn, run, tool}      the tool answered
    round.aborted  {turn, run, reason}    what the run wrote of the answer is withdrawn
    assistant      {turn, text, card?}    the answer, kept
    turn.finished  {turn, status, cause?, reply?}   status is "ok" or "failed"

A run that was cut off leaves no event saying so: the next `turn.resumed` is how it is known."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from ..chatlog.kinds import (
    ASSISTANT,
    ROUND_ABORTED,
    TEXT,
    TOOL,
    TOOL_STARTED,
    TURN_FINISHED,
    TURN_RESUMED,
    TURN_STARTED,
)
from ..chatlog.log import Event

# What a run keeps when it gets anywhere.
PROGRESS = frozenset({TEXT, TOOL_STARTED, TOOL, ASSISTANT})
FOLDED = (TURN_STARTED, TURN_RESUMED, TURN_FINISHED, ROUND_ABORTED, *PROGRESS)


@dataclass(frozen=True)
class TurnState:
    turn: str
    job: dict
    started_at: int
    finished: Event | None
    runs: int
    # Runs, most recent first, that kept nothing: the run that was cut off counts.
    stalled_runs: int
    progressed_at: int
    # Tools called in the last run that did not answer.
    open_tools: tuple[str, ...]
    last_cause: str
    # The last run wrote words of the answer that nothing has withdrawn.
    text_open: bool


def _note_run(stalled: int, progressed: bool) -> int:
    return 0 if progressed else stalled + 1


def folded(events: Iterable[Event]) -> dict[str, TurnState]:
    """The turns the events begin, in the order they began, each as far as the events say."""
    states: dict[str, dict] = {}
    for event in events:
        turn = event.data.get("turn")
        if not isinstance(turn, str):
            continue
        if event.kind == TURN_STARTED:
            states[turn] = {
                "job": event.data.get("job", {}),
                "started_at": event.at,
                "finished": None,
                "runs": 0,
                "stalled": 0,
                "progressed": False,
                "progressed_at": event.at,
                "open": [],
                "cause": "",
                "text": False,
            }
            continue
        state = states.get(turn)
        if state is None:
            continue
        if event.kind == TURN_FINISHED:
            state["finished"] = event
        elif event.kind == TURN_RESUMED:
            if state["runs"]:
                state["stalled"] = _note_run(state["stalled"], state["progressed"])
            state.update(runs=state["runs"] + 1, progressed=False, open=[], text=False)
        elif event.kind == ROUND_ABORTED:
            state["cause"] = str(event.data.get("reason", ""))
            state["text"] = False
        elif event.kind in PROGRESS:
            state["progressed"] = True
            state["progressed_at"] = event.at
            if event.kind == TEXT:
                state["text"] = True
            if event.kind == TOOL_STARTED:
                state["open"].append(str(event.data.get("tool", "")))
            elif (
                event.kind == TOOL and str(event.data.get("tool", "")) in state["open"]
            ):
                state["open"].remove(str(event.data.get("tool", "")))
    return {
        turn: TurnState(
            turn=turn,
            job=kept["job"],
            started_at=kept["started_at"],
            finished=kept["finished"],
            runs=kept["runs"],
            stalled_runs=(
                _note_run(kept["stalled"], kept["progressed"]) if kept["runs"] else 0
            ),
            progressed_at=kept["progressed_at"],
            open_tools=tuple(kept["open"]),
            last_cause=kept["cause"],
            text_open=kept["text"],
        )
        for turn, kept in states.items()
    }
