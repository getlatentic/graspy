"""The tutor: a DSPy ReAct agent that knows where the learner is."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import dspy
from dspy.streaming import StreamListener, StreamResponse
from dspy.utils.exceptions import AdapterParseError

from ..education.stage import stage_of
from ..learner.answers import PracticeAnswer
from ..learner.notes import NOTHING_YET
from .answer_gate import AnswerGate, verdicts_in
from .app_tools import AppCall, describe_calls
from .cards import Card
from .context import LearnerContext
from .labels import DATA_ONLY
from .memory import ConversationStore, Exchange
from .persona import WITHOUT_STAGE, persona
from .reply import Action
from .runaway import RETRY_TEMPERATURE, Runaway, RunawayWatch
from .streaming import AnswerDelta, AnswerRestart, Silent, ToolActivity, ToolFinished
from .summary import recalled
from .toolkit import Turn, TurnOutputs, tools_for
from .transcript import render
from .unanswered import NO_ANSWER

logger = logging.getLogger(__name__)

# Each step is a model call; a turn needing more than this is looping, not
# tutoring.
MAX_TOOL_STEPS = 6
MAX_FOLLOW_UPS = 1
NO_APP_CALLS = "None: the learner did nothing in the app with this message."


TUTOR_RULES = r"""Reply in the learner's language, matching the language of their message,
and never switch to English unprompted.

Draw examples from the learner's own country: its money, places, names,
food and markets, rather than unfamiliar foreign ones.

Be encouraging and patient. Explain rather than lecture, and prefer a
worked example to a definition. Keep to this conversation's topic unless
the learner takes it elsewhere. When their lesson on the topic is given,
they have read it: explain in line with it, and point them back to the
slide that covers what they ask. A big ambition is a good one:
never apologise for the learner's level or call something too hard for
them.

Use calculate for arithmetic instead of working sums out yourself, and show
the learner the result. Write mathematics in LaTeX between \( and \), or
between \[ and \] on a line of its own; never with dollar signs, which
mean money.

The learner's plan changes only through tools, and only when they ask:
- to switch to, go to or open a subject they have: open_subject. It never
  changes their plan.
- to go to, open or start the lesson of a topic they have: open_topic.
  Only words that name the lesson count, such as "take me to
  fractions", "open the fractions lesson", "start the lesson". Wanting
  to learn a topic is not asking for its lesson: "teach me", "explain",
  "how does ... work" and "what is" are questions for you, about this
  topic or another of theirs alike. Answer them here, and do not offer
  the lesson.
- to learn a lesson-sized topic that suits their grade and one of their
  subjects: answer, then add_topic.
- to study a school subject taught at their grade that they do not have,
  or to drop one: change_subjects. Switching to a subject they do not
  have means adding it, never dropping another.
- to learn something beyond their grade, such as a university subject:
  propose_path, then answer with a short taste of it that they can follow
  now, such as one question it answers, and tell them the path to it is
  below.
- to start their whole plan again: rebuild_plan.
Opening a topic or subject never leaves this conversation: the app shows
the learner a button to open it. Say it is ready below.

Call these straight away without asking whether they are sure: the app asks
before anything that clears progress, and shows a path before adding it.
When the app is asking the learner, tell them to look below.

When the learner asks to practise, to be tested or for questions to try,
use give_practice: multiple-choice questions on this conversation's
topic, at their level, as many as they ask for and one when they do not
say, all in one call. For reading or comprehension practice, or when
they ask for a passage with questions, use give_passage. The app shows
these as a card: your answer only introduces it. When a tool refuses
them, fix what it says and call it again, and never write the questions
in your answer meanwhile. When they tell you how they
did, build on it:
explain a mistake, or make the next questions a little harder. Their
record shows the mistakes they made before: aim explanations and
questions at the ones on this topic.

If a tool fails, say plainly what you could not do. The learner reads the
answer exactly as you write it: open with the answer itself, and never
describe your own reasoning or the tools you used.
"""


class TutorTurn(dspy.Signature):
    __doc__ = f"{WITHOUT_STAGE}\n\n{TUTOR_RULES}"

    learner: str = dspy.InputField(
        desc=f"Who the learner is: grade, country and language. {DATA_ONLY}"
    )
    studying: str = dspy.InputField(
        desc="What this conversation is about: a topic of the learner's plan and "
        f"the lesson on it they have, or none. {DATA_ONLY}"
    )
    record: str = dspy.InputField(
        desc="What the learner has finished and the questions they recently "
        "got wrong. Use it to aim at what they find hard; never recite it. " + DATA_ONLY
    )
    # A text field rather than dspy.History: ReAct renders History against
    # each predictor's own output fields, so the step that chooses tools would
    # see the learner's earlier questions but never the tutor's answers.
    conversation: str = dspy.InputField(
        desc=f"Earlier exchanges in this conversation, oldest first. {DATA_ONLY}"
    )
    app: str = dspy.InputField(
        desc="What the learner did in the app with this message, such as "
        "answering a practice question: each call their tap made, and its result. "
        + DATA_ONLY
    )
    message: str = dspy.InputField(desc="The learner's new message")
    answer: str = dspy.OutputField(desc="The reply the learner reads")
    follow_ups: list[str] = dspy.OutputField(
        desc="The one short question the learner is most likely to ask next, in their language"
    )


@dataclass(frozen=True)
class TutorReply:
    answer: str
    follow_ups: list[str] = field(default_factory=list)
    actions: list[Action] = field(default_factory=list)
    cards: list[Card] = field(default_factory=list)


@dataclass(frozen=True)
class _Answered:
    prediction: dspy.Prediction
    outputs: TurnOutputs
    answer: str


class Tutor:
    def __init__(self, memory: ConversationStore) -> None:
        self._memory = memory

    async def stream(
        self,
        conversation_id: str,
        message: str,
        context: LearnerContext | None = None,
        calls: list[AppCall] | None = None,
        unanswered: list[str] | None = None,
        record: str = NOTHING_YET,
        turn: str | None = None,
    ) -> AsyncIterator[
        AnswerDelta | AnswerRestart | ToolActivity | ToolFinished | TutorReply
    ]:
        """Tools as they start, the answer as it is written, and last the
        finished reply. ``unanswered`` are the learner's messages whose turns
        failed, kept as exchanges with no answer. ``turn`` names the turn: a store that keeps an exchange
        once per turn is not made to keep it twice by a turn run again."""
        context = context or LearnerContext()
        earlier = await recalled(self._memory, conversation_id)
        missed = [Exchange(message=text, answer=NO_ANSWER) for text in unanswered or []]
        inputs = {
            "learner": context.describe_learner(),
            "studying": context.describe_studying(),
            "record": record,
            "conversation": render([*earlier.exchanges, *missed], earlier.summary),
            "app": describe_calls(calls) if calls else NO_APP_CALLS,
            "message": message,
        }
        # A tap marked in this turn; or the last one, when the learner asks about it next.
        verdicts = tuple(
            call.arguments.correct
            for call in calls or []
            if isinstance(call.arguments, PracticeAnswer)
        ) or verdicts_in(
            earlier.exchanges[-1].get("app", "") if earlier.exchanges else ""
        )
        async for item in _answered(context, inputs, verdicts):
            if isinstance(item, _Answered):
                answered = item
            else:
                yield item
        answer = answered.answer
        # Of two opens, or two cards, in one turn, the last counts.
        cards = answered.outputs.cards[-1:]
        exchanges = [*missed, remembered(message, answer, calls, cards)]
        for n, exchange in enumerate(exchanges):
            # The learner's own message is the turn; the ones that failed before are its first.
            named = (
                None
                if turn is None
                else (turn if n == len(missed) else f"{turn}:missed:{n}")
            )
            await self._memory.append(conversation_id, exchange, turn=named)
        yield TutorReply(
            answer=answer,
            follow_ups=clean_follow_ups(answered.prediction.follow_ups),
            actions=answered.outputs.actions[-1:],
            cards=cards,
        )


async def _answered(
    context: LearnerContext, inputs: dict, verdicts: tuple[bool, ...]
) -> AsyncIterator[
    AnswerDelta | AnswerRestart | ToolActivity | ToolFinished | _Answered
]:
    """An answer that runs away is withdrawn and written again, once, with
    some sampling."""
    for again in (False, True):
        try:
            async for item in _attempt(context, inputs, verdicts, again):
                yield item
            return
        except (Runaway, AdapterParseError) as error:
            if again:
                raise
            logger.warning("The answer ran away, so it is written again: %s", error)
            yield AnswerRestart()


async def _attempt(
    context: LearnerContext, inputs: dict, verdicts: tuple[bool, ...], again: bool
) -> AsyncIterator[AnswerDelta | ToolActivity | ToolFinished | _Answered]:
    """Closing it stops the model."""
    outputs = TurnOutputs()
    agent = _streamed_agent(Turn(context, inputs["message"]), outputs, again)
    watch = RunawayWatch()
    gate = AnswerGate(outputs, verdicts)
    finished = False
    items = agent(**inputs)
    try:
        async for item in items:
            if isinstance(item, StreamResponse):
                watch.add(item.chunk)
                if sent := gate.feed(item.chunk):
                    yield AnswerDelta(sent)
            elif isinstance(item, (ToolActivity, ToolFinished)):
                yield item
            elif isinstance(item, dspy.Prediction):
                finished = True
                unstreamed = "" if gate.fed else gate.feed(item.answer)
                if sent := unstreamed + gate.finish():
                    yield AnswerDelta(sent)
                if gate.breaches:
                    logger.warning(
                        "Sentences of the answer were dropped: %s",
                        sorted({breach.value for breach in gate.breaches}),
                    )
                yield _Answered(item, outputs, gate.answer())
    except BaseExceptionGroup as group:
        # streamify runs the turn in a task group; the caller wants the
        # model's own error, not the group around it.
        if len(group.exceptions) == 1:
            raise group.exceptions[0] from None
        raise
    finally:
        await _stopped(items)
    if not finished:
        raise RuntimeError("The tutor turn ended without an answer")


def signature_for(context: LearnerContext) -> type[dspy.Signature]:
    """The tutor for the learner's own stage of schooling."""
    learner = stage_of(context.grade_level)
    if learner is None:
        return TutorTurn
    return TutorTurn.with_instructions(f"{persona(learner)}\n\n{TUTOR_RULES}")


def _streamed_agent(turn: Turn, outputs: TurnOutputs, again: bool):
    agent = dspy.ReAct(
        signature_for(turn.context),
        tools=tools_for(turn, outputs),
        max_iters=MAX_TOOL_STEPS,
    )
    if again:
        agent.set_lm(dspy.settings.lm.copy(temperature=RETRY_TEMPERATURE))
    listener = StreamListener(
        signature_field_name="answer",
        predict=agent.extract.predict,
        predict_name="extract.predict",
    )
    return dspy.streamify(
        agent,
        stream_listeners=[listener],
        status_message_provider=Silent(),
        is_async_program=True,
    )


async def _stopped(items: AsyncIterator) -> None:
    """streamify's task group reports a close as a group of GeneratorExit:
    the close working, not an error."""
    try:
        await items.aclose()
    except BaseExceptionGroup as group:
        if not all(isinstance(error, GeneratorExit) for error in group.exceptions):
            raise


def clean_follow_ups(follow_ups: list[str] | None) -> list[str]:
    cleaned = [
        item.strip()
        for item in follow_ups or []
        if isinstance(item, str) and item.strip()
    ]
    return list(dict.fromkeys(cleaned))[:MAX_FOLLOW_UPS]


def remembered(
    message: str, answer: str, calls: list[AppCall] | None, cards: list[Card]
) -> Exchange:
    exchange = Exchange(message=message, answer=answer)
    if calls:
        exchange["app"] = describe_calls(calls)
    if cards:
        exchange["card"] = cards[-1].describe()
    return exchange
