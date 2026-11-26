"""The tutor: a DSPy ReAct agent that knows where the learner is."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import dspy
from dspy.streaming import StreamListener, StreamResponse
from dspy.utils.exceptions import AdapterParseError

from ..domains.lesson.maths import reply_text
from ..education.stage import stage_of
from ..learner.answers import PracticeAnswer
from ..learner.notes import NOTHING_YET
from .about_you import (
    DEFAULT_LINE,
    answer_in,
    form_card,
    form_due,
    forms_shown,
    lacks_class,
    learner_with,
    surviving,
)
from .answer_gate import AnswerGate, verdicts_in
from .app_tools import AppCall, describe_calls
from .cards import Card, DetailsCard
from .context import LearnerContext
from .decision import withdraw_offers
from .labels import DATA_ONLY
from .memory import ConversationStore, Exchange
from .native_react import NativeReAct
from .persona import WITHOUT_STAGE, persona
from .reply import Action
from .runaway import RETRY_TEMPERATURE, Runaway, RunawayWatch
from .safety_screen import SafetyScreen, safe_ones
from .said import Said, said_by
from .skills.active import in_effect, rendered, stamped
from .skills.registry import catalogue
from .streaming import (
    AnswerDelta,
    AnswerRestart,
    Silent,
    SkillLoaded,
    ToolActivity,
    ToolFinished,
)
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
- to learn one lesson-sized topic that suits their grade and sits in one
  of their subjects: answer, then add_topic.
- to study a school subject taught at their grade that they do not have,
  or to drop one: change_subjects. Switching to a subject they do not
  have means adding it, never dropping another.
- to take up any other new course, such as a university subject or a field
  like quantum computing: propose_path, whether or not a subject is open.
  A course is its own subject and never a topic of the open one, so a
  request for several courses is one propose_path call with one goal for
  each. Then answer with a short taste of the first that they can follow
  now, such as one question it answers, and tell them the path to it is
  below. Never before their class is known, and never in the same message
  as a question for them to tap.
- to start their whole plan again: rebuild_plan.
A message gets one change to their plan; every new course they name goes in
one propose_path call.
Opening a topic or subject never leaves this conversation: the app shows
the learner a button to open it. Say it is ready below.

Call these straight away without asking whether they are sure: the app asks
before anything that clears progress, and shows a path before adding it.
When the app is asking the learner, tell them to look below.

One decision at a time. When a message asks the learner something with a
card (ask_about_you or give_choice), the card is the whole of it: write one short
line, offer nothing else with it (no course, subject, lesson or practice) and
never say anything is ready. The app shows the card alone and refuses what you
offered with it. Offer it in your next message, once they have answered, and
keep that message short, moving forward rather than asking again.

A learner with no subjects yet is asked by the app what they would like to
learn. What they name is their goal. Lessons are in English, so never offer
another language. Every course and subject is written for the learner's
class, so nothing is offered before the class is saved, however they describe
themselves: "for students" is not a class. When the class is not known, call
ask_about_you straight away, with one short line that names no course and never
says anything is ready: the form asks their country and class together, and the
learner confirms the country it starts on. Never ask either in words, and never
their age, until the conversation shows they ignored the form: then ask once in
words, and take what they say. Their answer arrives as "Country: ... Class: ...", which the app saves
for them: in that same message take up what they asked for as above, propose_path
for a course or change_subjects for a school subject, so it follows their class.
When they answer Undergraduate or Graduate with no course the app could read,
it saves their country only: ask what they study in words, then save it with
set_details. When they instead tell you their class in words, save it with
set_details, with the country and, for Undergraduate or Graduate, the course;
it is refused for a country or class the app does not have, and then you ask
which in words. When they must pick between a few clear
alternatives, ask with give_choice rather than listing them in your answer, and
wait for their tap.

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
    skills_in_effect: str = dspy.InputField(
        desc="Teaching methods you loaded in the last few turns, which still apply: "
        "follow them, and do not load them again."
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
    # Ended by the safety check, which nothing else of the turn is added to.
    stopped: bool = False


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
        AnswerDelta
        | AnswerRestart
        | ToolActivity
        | ToolFinished
        | SkillLoaded
        | TutorReply
    ]:
        """Tools as they start, the answer as it is written, and last the
        finished reply. ``unanswered`` are the learner's messages whose turns
        failed, kept as exchanges with no answer. ``turn`` names the turn: a store that keeps an exchange
        once per turn is not made to keep it twice by a turn run again."""
        context = context or LearnerContext()
        form_answer = answer_in(message, context)
        if form_answer:
            context = learner_with(context, form_answer)
        # Without this turn's own exchange from a run before it was run again: the model and the
        # form's count read the conversation as it was when the turn began.
        earlier = await recalled(self._memory, conversation_id, turn)
        context = context.model_copy(
            update={"forms_due": form_due(list(earlier.exchanges))}
        )
        history = list(earlier.exchanges)
        for text in unanswered or []:
            missed_one = Exchange(message=text, answer=NO_ANSWER)
            history.append(stamped(missed_one, history, context.topic))
        missed = history[len(earlier.exchanges) :]
        ages = in_effect(history, context.topic)
        active = tuple(ages)
        inputs = {
            "learner": context.describe_learner(),
            "studying": context.describe_studying(),
            "record": record,
            "conversation": render([*earlier.exchanges, *missed], earlier.summary),
            "app": describe_calls(calls) if calls else NO_APP_CALLS,
            "skills_in_effect": rendered(ages),
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
        said = said_by_learner(context, inputs, earlier.exchanges, missed)
        saved = [form_answer] if form_answer else []
        async for item in _answered(context, inputs, verdicts, said, active, saved):
            if isinstance(item, _Answered):
                answered = item
            else:
                yield item
        answer = answered.answer
        # Of two opens, or two cards, in one turn, the last counts.
        cards = answered.outputs.cards[-1:]
        if (
            not answered.stopped
            and context.forms_due
            and lacks_class(context, cards, answered.outputs.actions)
        ):
            cards = [form_card(context)]
            # The form is the whole of its turn: whatever else was accepted is withdrawn.
            withdraw_offers(answered.outputs.actions, cards)
            answer = answer.strip() or DEFAULT_LINE
        forms = (
            forms_shown(list(earlier.exchanges))
            + any(isinstance(card, DetailsCard) for card in cards)
            if context.needs_class()
            else 0
        )
        exchanges = [
            *missed,
            stamped(
                remembered(message, answer, calls, cards, forms),
                history,
                context.topic,
                answered.outputs.skills,
            ),
        ]
        for n, exchange in enumerate(exchanges):
            # The learner's own message is the turn; the ones that failed before are its first.
            named = (
                None
                if turn is None
                else (turn if n == len(missed) else f"{turn}:missed:{n}")
            )
            await self._memory.append(conversation_id, exchange, turn=named)
        yield TutorReply(
            # Remembered as written, so the model's own history stays its words.
            answer=reply_text(answer),
            follow_ups=await safe_ones(
                clean_follow_ups(answered.prediction.follow_ups), said
            ),
            actions=answered.outputs.actions,
            cards=cards,
        )


async def _answered(
    context: LearnerContext,
    inputs: dict,
    verdicts: tuple[bool, ...],
    said: Said,
    active: tuple[str, ...],
    saved: list[Action],
) -> AsyncIterator[
    AnswerDelta | AnswerRestart | ToolActivity | ToolFinished | SkillLoaded | _Answered
]:
    """An answer that runs away is withdrawn and written again, once, with
    some sampling."""
    for again in (False, True):
        try:
            async for item in _attempt(
                context, inputs, verdicts, said, active, saved, again
            ):
                yield item
            return
        except (Runaway, AdapterParseError) as error:
            if again:
                raise
            logger.warning("The answer ran away, so it is written again: %s", error)
            yield AnswerRestart()


async def _attempt(
    context: LearnerContext,
    inputs: dict,
    verdicts: tuple[bool, ...],
    said: Said,
    active: tuple[str, ...],
    saved: list[Action],
    again: bool,
) -> AsyncIterator[AnswerDelta | ToolActivity | ToolFinished | SkillLoaded | _Answered]:
    """Closing it stops the model. ``saved`` are the actions the learner's own answer has made."""
    outputs = TurnOutputs(actions=list(saved))
    agent = _streamed_agent(Turn(context, inputs["message"], active), outputs, again)
    watch = RunawayWatch()
    gate = AnswerGate(outputs, verdicts)
    screen = SafetyScreen(said)
    finished = False
    items = agent(**inputs)
    announced = 0
    try:
        async for item in items:
            for name in outputs.skills[announced:]:
                yield SkillLoaded(name)
            announced = len(outputs.skills)
            if isinstance(item, StreamResponse):
                watch.add(item.chunk)
                screen.submit(gate.feed(item.chunk))
                if sent := await screen.released():
                    yield AnswerDelta(sent)
                if screen.reason:
                    finished = True
                    yield AnswerDelta(await screen.finish())
                    _log_stopped(gate, screen)
                    # What the model goes on to write, call or suggest is not used.
                    yield _stopped_answer(screen, saved)
                    return
            elif isinstance(item, (ToolActivity, ToolFinished)):
                yield item
            elif isinstance(item, dspy.Prediction):
                finished = True
                unstreamed = "" if gate.fed else gate.feed(item.answer)
                screen.submit(unstreamed + gate.finish())
                if sent := await screen.finish():
                    yield AnswerDelta(sent)
                _log_stopped(gate, screen)
                yield (
                    _stopped_answer(screen, saved)
                    if screen.reason
                    else _Answered(item, outputs, screen.answer())
                )
    except BaseExceptionGroup as group:
        # streamify runs the turn in a task group; the caller wants the
        # model's own error, not the group around it.
        if len(group.exceptions) == 1:
            raise group.exceptions[0] from None
        raise
    finally:
        screen.close()
        await _stopped(items)
    if not finished:
        raise RuntimeError("The tutor turn ended without an answer")


def _stopped_answer(screen: SafetyScreen, saved: list[Action]) -> _Answered:
    """What the model goes on to write, call or suggest is not used; what the learner's own answer
    saved is, so far as it is safe to keep."""
    return _Answered(
        dspy.Prediction(answer="", follow_ups=[]),
        TurnOutputs(actions=surviving(saved)),
        screen.answer(),
        stopped=True,
    )


def _log_stopped(gate: AnswerGate, screen: SafetyScreen) -> None:
    """What stopped a sentence, never the sentence."""
    if gate.breaches:
        logger.warning(
            "Sentences of the answer were dropped: %s",
            sorted({breach.value for breach in gate.breaches}),
        )
    if screen.reason:
        logger.warning("The answer was ended by the safety check: %s", screen.reason)


def said_by_learner(
    context: LearnerContext,
    inputs: dict,
    exchanges: list[Exchange],
    missed: list[Exchange],
) -> Said:
    earlier = [exchange["message"] for exchange in reversed([*missed, *exchanges])]
    return said_by(
        inputs["message"],
        context.describe_learner(),
        inputs["app"],
        context.describe_studying(),
        earlier,
    )


def signature_for(context: LearnerContext) -> type[dspy.Signature]:
    """The tutor for the learner's own stage of schooling, told of its skills.
    The catalogue is read here, not at import: Worker startup reads no files."""
    learner = stage_of(context.grade_level)
    instructions = (
        TutorTurn.instructions
        if learner is None
        else f"{persona(learner)}\n\n{TUTOR_RULES}"
    )
    return TutorTurn.with_instructions(f"{instructions}\n\n{catalogue()}")


def _streamed_agent(turn: Turn, outputs: TurnOutputs, again: bool):
    react = NativeReAct if dspy.settings.lm.supports_function_calling else dspy.ReAct
    agent = react(
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
    message: str,
    answer: str,
    calls: list[AppCall] | None,
    cards: list[Card],
    forms: int = 0,
) -> Exchange:
    exchange = Exchange(message=message, answer=answer)
    if forms:
        exchange["forms"] = forms
    if calls:
        exchange["app"] = describe_calls(calls)
    if cards:
        exchange["card"] = cards[-1].describe()
    return exchange
