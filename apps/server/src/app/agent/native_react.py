"""ReAct whose tool step travels as the model's native tool calls: the tools go
in the request's `tools` array and come back as `tool_calls`, not as text the
model writes into fields. The answer is still written by ReAct's own extract
step, so it streams as before."""

from __future__ import annotations

import json
import logging
from typing import Any

import dspy
from dspy.adapters.chat_adapter import ChatAdapter
from dspy.adapters.types.tool import ToolCallResults, ToolCalls
from dspy.utils.exceptions import (
    AdapterParseError,
    ContextWindowExceededError,
    LMProviderError,
    format_error_for_lm,
)

logger = logging.getLogger(__name__)

# Without it the gateway does not offer tools by default: gpt-oss on Bedrock
# called none in six turns.
TOOL_CHOICE = {"tool_choice": "auto"}
NO_MORE_TOOLS = "done"
# A step may call a few tools; a model that calls dozens is looping.
MAX_CALLS_PER_STEP = 3
# The same unreadable step twice ends the tool steps.
MAX_UNREADABLE_STEPS = 2
TOOL_STEP_RULES = (
    "You are an Agent working in two steps. This step only decides which tools "
    "to call: never write the learner's reply here. Before you call a tool, write "
    "one short sentence saying which situation in the message matches it. Load a "
    "teaching method only when the message is already the situation it names; one "
    "that would only help after your reply does not apply now. If a tool or a "
    "teaching method applies, call it now. Otherwise reply with exactly "
    f"`{NO_MORE_TOOLS}` and nothing else; the reply is written in the next step."
)


class ToolStepAdapter(ChatAdapter):
    """The adapter of a step with nothing to write but tool calls. A reply
    without one is the model saying it is done, so there is nothing to parse,
    and a reply that is empty is an error, not a reason to ask again in JSON."""

    def __init__(self) -> None:
        super().__init__(
            use_native_function_calling=True, use_json_adapter_fallback=False
        )

    def user_message_output_requirements(self, signature) -> str | None:
        return None

    def format_field_structure(self, signature) -> str:
        return (
            super()
            .format_field_structure(signature)
            .replace("[[ ## completed ## ]]", "")
        )

    def parse(self, signature, completion: str) -> dict[str, Any]:
        return {}


def _with_unique_ids(calls: ToolCalls, step: int) -> ToolCalls:
    """DSPy drops the results of a step whose call ids are missing, so every
    call has one, and no two share it."""
    seen: set[str] = set()
    made = []
    for n, call in enumerate(calls.tool_calls):
        if not call.id or call.id in seen:
            if call.id:
                logger.warning("A tool step repeated the call id %s", call.id)
            call = call.model_copy(update={"id": f"call_{step}_{n}"})
        seen.add(call.id)
        made.append(call)
    return ToolCalls(tool_calls=made)


def _limited(calls: ToolCalls) -> tuple[ToolCalls, str | None]:
    """The calls to run: the first few, without a call repeated exactly. What
    was left out is said in words for the model."""
    kept: list[ToolCalls.ToolCall] = []
    seen: set[str] = set()
    repeated = 0
    for call in calls.tool_calls:
        key = f"{call.name} {json.dumps(call.args, sort_keys=True, default=str)}"
        if key in seen:
            repeated += 1
        elif len(kept) < MAX_CALLS_PER_STEP:
            seen.add(key)
            kept.append(call)
    over = len(calls.tool_calls) - len(kept) - repeated
    notes = []
    if repeated:
        notes.append(f"{repeated} repeated call(s) were not run")
    if over:
        notes.append(
            f"{over} call(s) beyond the first {MAX_CALLS_PER_STEP} in a step were not run"
        )
    return ToolCalls(tool_calls=kept), "; ".join(notes) or None


def _optional(annotation: Any) -> Any:
    return annotation | None


class NativeReAct(dspy.ReAct):
    """dspy.ReAct with native tool calls. A step that calls no tool ends the
    loop, where ReAct asks for a `finish` call, and no thought is asked for."""

    def __init__(self, signature, tools, max_iters: int = 20) -> None:
        super().__init__(signature, tools, max_iters)
        del self.tools["finish"]
        self.react = dspy.Predict(self._tool_step_signature())

    def _tool_step_signature(self) -> type[dspy.Signature]:
        fields: dict[str, Any] = {
            name: (
                _optional(field.annotation),
                dspy.InputField(desc=field.json_schema_extra.get("desc")),
            )
            for name, field in self.signature.input_fields.items()
        }
        fields["history"] = (dspy.History, dspy.InputField())
        fields["tools"] = (list[dspy.Tool], dspy.InputField())
        fields["tool_calls"] = (dspy.ToolCalls, dspy.OutputField())
        instructions = f"{self.signature.instructions}\n{TOOL_STEP_RULES}"
        return dspy.Signature(fields, instructions)

    def forward(self, **input_args):
        raise RuntimeError("NativeReAct is async-only: call acall.")

    async def aforward(self, **input_args):
        max_iters = input_args.pop("max_iters", self.max_iters)
        pending = {
            name: input_args[name]
            for name in self.signature.input_fields
            if name in input_args
        }
        history = dspy.History(messages=[])
        trajectory: dict[str, Any] = {}
        unreadable = 0
        for step in range(max_iters):
            try:
                calls = await self._tool_calls(history, pending)
            except ContextWindowExceededError as error:
                logger.warning(
                    "Ending the tool steps: %s",
                    format_error_for_lm(error, traceback_frames=5),
                )
                break
            except (AdapterParseError, LMProviderError, ValueError) as error:
                # A call the model wrote that cannot be read, such as one with no
                # name: the step is asked again, and twice ends the tool steps.
                if (
                    isinstance(error, LMProviderError)
                    and type(error) is not LMProviderError
                ):
                    raise  # auth, billing, rate limits, timeouts and the like
                unreadable += 1
                logger.warning(
                    "A tool step could not be read (%d): %s",
                    unreadable,
                    format_error_for_lm(error, traceback_frames=5),
                )
                if unreadable >= MAX_UNREADABLE_STEPS:
                    break
                continue
            unreadable = 0
            if not calls.tool_calls:
                break
            calls, not_run = _limited(calls)
            values, failed = await self._run(calls)
            if not_run:
                values[-1] = {"result": values[-1], "not_run": not_run}
            results = ToolCallResults.from_tool_calls_and_values(calls, values, failed)
            history.messages.append(
                {
                    **pending,
                    "tool_calls": calls.model_copy(
                        update={"tool_call_results": results}
                    ),
                }
            )
            pending = {}
            for n, (call, result) in enumerate(
                zip(calls.tool_calls, results.tool_call_results, strict=True)
            ):
                key = f"{step}_{n}"
                trajectory[f"tool_name_{key}"] = call.name
                trajectory[f"tool_args_{key}"] = call.args
                trajectory[f"observation_{key}"] = result.value
        extract = await self._async_call_with_potential_trajectory_truncation(
            self.extract, trajectory, **input_args
        )
        return dspy.Prediction(trajectory=trajectory, **extract)

    async def _tool_calls(self, history: dspy.History, pending: dict) -> ToolCalls:
        with dspy.context(adapter=ToolStepAdapter()):
            step = await self.react.acall(
                history=history,
                tools=list(self.tools.values()),
                config=TOOL_CHOICE,
                **pending,
            )
        calls = step.tool_calls
        if calls is None:
            return ToolCalls(tool_calls=[])
        return _with_unique_ids(calls, len(history.messages))

    async def _run(self, calls: ToolCalls) -> tuple[list[Any], list[bool]]:
        values: list[Any] = []
        failed: list[bool] = []
        for call in calls.tool_calls:
            try:
                if call.name not in self.tools:
                    raise ValueError(f"There is no tool named {call.name}")
                values.append(await self.tools[call.name].acall(**call.args))
                failed.append(False)
            except Exception as error:  # noqa: BLE001 - the model is told what failed
                values.append(
                    f"Execution error in {call.name}: {format_error_for_lm(error, traceback_frames=5)}"
                )
                failed.append(True)
        return values, failed

    def truncate_trajectory(self, trajectory):
        """The oldest tool call goes: its name, arguments and observation."""
        keys = list(trajectory)
        if len(keys) <= 3:
            raise ContextWindowExceededError(
                message="The trajectory is too long for the context window, and holds only one tool call."
            )
        for key in keys[:3]:
            trajectory.pop(key)
        return trajectory
