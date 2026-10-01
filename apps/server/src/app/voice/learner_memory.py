"""What a learner still remembers of each lesson, kept by the tutor agent.

Retention used to run on a fixed ladder: review a lesson one, three and seven days after it was
first passed. That spaced a lesson the learner sailed through exactly as often as one they scraped,
and a failed assessment changed nothing at all. The agent replaces the ladder with a memory model —
every assessment moves that lesson's stability, and the lesson comes back on the day the model says
recall has slipped, whether that is the second day or the twentieth.

Only assessments are remembered. Practice turns repeat within a lesson by design, and counting them
would make a lesson look solid because the learner drilled it, not because they can recall it.

One agent instance holds one child, so a shared phone never mixes two children's memories.
"""

import asyncio
import json
from urllib.parse import quote

from .curriculum import load_plans

LEARNER_ORIGIN = "https://tutor/agents/learner"
ASSESSMENT = "assess_performance"
# Transcription (90 s) and language detection come first, and the app gives up on marking at 150 s.
TEACH_TIMEOUT_SECONDS = 30

VERDICT_OF = {"correct": "correct", "try_again": "wrong", "not_understood": "unheard"}
DECISION_OF = {
    "correct": "correct",
    "nearly": "correct",
    "wrong": "try_again",
    "unheard": "not_understood",
}


class LearnerMemoryError(RuntimeError):
    """The tutor agent could not be reached or answered in a shape this worker does not accept."""


async def _ask(env, learner: str, action: str, body: dict) -> dict:
    """One request to this learner's own agent instance, named by the path.

    The host is a placeholder: a service binding routes on the worker, never on the name.
    """
    response = await env.TUTOR.fetch(
        f"{LEARNER_ORIGIN}/{quote(learner, safe='')}/{action}",
        method="POST",
        headers={"Content-Type": "application/json"},
        body=json.dumps(body),
    )
    if response.status != 200:
        raise LearnerMemoryError(f"the tutor agent answered HTTP {response.status}")
    return await response.json()


def assessed_plan(metadata: dict, language: str = "en") -> str | None:
    """The lesson this turn assessed, or None when the turn was practice rather than assessment."""
    plan = load_plans(language).get(str(metadata.get("plan_id")))
    if plan is None:
        return None
    event = next((e for e in plan.events if e.id == metadata.get("event_id")), None)
    return plan.id if event is not None and event.event == ASSESSMENT else None


async def remember_assessment(
    env,
    learner: str,
    sample_id: str,
    metadata: dict,
    decision: str,
    alone: bool = True,
) -> None:
    """Tell the agent how an assessment went, so the lesson's next review moves with it.

    A pass that took help is remembered as that, not as knowing it: the lesson is due for review sooner. The sample names the answer, and one answer moves a lesson once however often this is called,
    so a turn re-requested after a lost reply is repaired rather than counted twice.
    """
    plan_id = assessed_plan(metadata)
    verdict = VERDICT_OF.get(decision)
    if plan_id is None or verdict is None:
        return
    if verdict == "correct" and not alone:
        verdict = "helped"
    await _ask(
        env,
        learner,
        "record",
        {
            "lesson": str(metadata.get("learner_class")),
            "item": plan_id,
            "verdict": verdict,
            "turn": sample_id,
        },
    )


async def teach_turn(env, learner: str, sample_id: str, lesson: str, ask: dict) -> dict:
    """Hand one answer to the teacher: the model marks it through a tool and says something back.

    The line the child hears is composed here, about this answer, rather than chosen from a list of
    sentences written in advance. The verdict the model was given is the same one this learner's
    memory records, so the teacher cannot praise a turn it is about to file as a miss.

    The lesson is the plan, so what the learner remembers of each fact is filed under the lesson it
    belongs to; how solid the lesson itself is stays a separate record under their class.
    """
    try:
        reply = await asyncio.wait_for(
            _ask(
                env, learner, "teach", {"lesson": lesson, "ask": ask, "turn": sample_id}
            ),
            timeout=TEACH_TIMEOUT_SECONDS,
        )
    except TimeoutError as error:
        raise LearnerMemoryError("the tutor agent did not answer in time") from error
    return reply | {"decision": DECISION_OF[reply["verdict"]]}


async def weakened_lessons(
    env, learner: str, learner_class: str | None
) -> tuple[str, ...]:
    """The learner's passed lessons whose recall has slipped, weakest first.

    Asking for a sitting with no new material offers the agent's own answer to "what is due" —
    the retention threshold stays the agent's to hold, so it is never written down twice.
    """
    if learner_class is None:
        return ()
    answer = await _ask(env, learner, "sitting", {"lesson": learner_class, "items": []})
    return tuple(answer.get("due", ()))


async def forget_memory(env, learner: str) -> None:
    """Everything the tutor agent holds for this learner, for a learner being removed."""
    await _ask(env, learner, "forget", {})
