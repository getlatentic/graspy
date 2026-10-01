"""The teacher: one of the offered steps, chosen by the model on Workers AI by number, with a reason.

The steps are offered by `sequencing` from what the learner has done (see `progress`). The model can only pick
a step it was offered, and marking never passes through it.
"""

import asyncio
import json
from dataclasses import dataclass
from datetime import date

from .evidence import Evidence
from .sequencing import Option, Variant

MODEL = "@cf/openai/gpt-oss-120b"
DECISION_TIMEOUT_SECONDS = 20


class TeacherChoiceError(RuntimeError):
    """The model chose a step the code did not offer, or answered in the wrong shape."""


@dataclass(frozen=True)
class Choice:
    plan_id: str
    event_id: str
    reason: str
    facts: tuple[int, ...] = ()
    variant: Variant | None = None

    @property
    def resume(self) -> str | None:
        return self.variant[1] if self.variant and self.variant[0] == "repair" else None

    @property
    def echo(self) -> bool:
        return bool(self.variant and self.variant[0] == "echo")


def decision_schema(options: list[Option]) -> dict:
    """The only answer shape the teacher may give: one numbered step, and why."""
    return {
        "type": "object",
        "properties": {
            "step": {"type": "integer", "minimum": 1, "maximum": len(options)},
            "reason": {"type": "string"},
        },
        "required": ["step", "reason"],
    }


def decision_prompt(
    options: list[Option], evidence: list[Evidence], today: date, language: str
) -> str:
    """Everything the teacher may consider, and the numbered steps it may pick from."""
    recent = [
        f"{item.day.isoformat()} {item.plan_id} {item.event_id} {item.decision or 'said'}"
        for item in evidence[-12:]
    ]
    offered = [
        f"{number}. {option.why}" for number, option in enumerate(options, start=1)
    ]
    return (
        "You are Aunty Chioma, a patient primary-school teacher in Nigeria, teaching in "
        f"{language}. Today is {today.isoformat()}. Choose the number of the step to take next. "
        "Prefer reviewing something learnt on an earlier day before starting new material.\n\n"
        "What this learner has done, oldest first:\n"
        + ("\n".join(recent) or "(nothing yet)")
        + "\n\n"
        "Steps:\n" + "\n".join(offered) + "\n\n"
        'Answer with JSON: {"step": <number>, "reason": "<one short sentence>"}'
    )


def _answer(reply: dict) -> dict:
    """The JSON object the model was told to produce, from Workers AI's chat reply."""
    choices = reply.get("choices") if isinstance(reply, dict) else None
    content = choices[0]["message"]["content"] if choices else None
    try:
        return json.loads(content) if isinstance(content, str) else content
    except (ValueError, KeyError, IndexError, TypeError) as error:
        raise TeacherChoiceError("the teacher model returned no decision") from error


def parse_choice(reply: dict, options: list[Option]) -> Choice:
    """Any answer that is not one of the numbered steps, in the expected shape, is refused."""
    answer = _answer(reply)
    if not isinstance(answer, dict):
        raise TeacherChoiceError("the teacher model returned no decision")
    step = answer.get("step")
    if not isinstance(step, int) or not 1 <= step <= len(options):
        raise TeacherChoiceError("the teacher model chose a step that was not offered")
    reason = answer.get("reason")
    chosen = options[step - 1]
    return Choice(
        chosen.plan_id,
        chosen.event_id,
        reason.strip() if isinstance(reason, str) else chosen.why,
        chosen.facts,
        chosen.variant,
    )


async def choose(
    client, options: list[Option], evidence: list[Evidence], today: date, language: str
) -> Choice:
    """A single offered step needs no model; several do."""
    if not options:
        raise TeacherChoiceError("no step can be offered to this learner")
    if len(options) == 1:
        first = options[0]
        return Choice(
            first.plan_id,
            first.event_id,
            first.why,
            first.facts,
            first.variant,
        )
    prompt = decision_prompt(options, evidence, today, language)
    return parse_choice(await client.decide(prompt, decision_schema(options)), options)


class TeacherModel:
    """The teacher's choice runs on Workers AI, beside the recognizer, with no key of its own."""

    def __init__(self, ai):
        self.ai = ai

    async def decide(self, prompt: str, schema: dict) -> dict:
        if self.ai is None:
            raise TeacherChoiceError("the Workers AI binding is not configured")
        reply = await asyncio.wait_for(
            self.ai.run(
                MODEL,
                {
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_schema", "json_schema": schema},
                    "temperature": 0,
                    "max_tokens": 200,
                },
            ),
            timeout=DECISION_TIMEOUT_SECONDS,
        )
        return reply.to_py() if hasattr(reply, "to_py") else reply
