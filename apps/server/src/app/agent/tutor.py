"""The tutor: a DSPy ReAct agent that knows where the learner is."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import dspy
from dspy.streaming import StreamListener, StreamResponse
from dspy.utils.exceptions import AdapterParseError

from ..caller import Caller
from ..domains.lesson.maths import reply_text
from ..domains.path.service import LearningPathService
from ..education.stage import stage_of
from ..learner.notes import NOTHING_YET
from .about_you import (
    answer_in,
    form_due,
    forms_shown,
    learner_with,
    surviving,
)
from .answer_gate import AnswerGate
from .app_tools import AppCall, describe_calls
from .cards import Card, DetailsCard
from .closing import (
    Answered,
    app_told,
    owed,
    verdicts_of,
    workshop_for,
)
from .context import LearnerContext
from .courses import earlier_path_in
from .labels import DATA_ONLY
from .memory import ConversationStore, Exchange
from .native_react import NativeReAct
from .path_answer import confirmed, path_answer
from .persona import WITHOUT_STAGE, persona
from .reply import Action, AddPaths
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
from .tutor_rules import TUTOR_RULES
from .unanswered import NO_ANSWER
from .workshop import GenerationBudget, PathPlanner

logger = logging.getLogger(__name__)

# Each step is a model call; a turn needing more than this is looping, not
# tutoring.
MAX_TOOL_STEPS = 6
MAX_FOLLOW_UPS = 1


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


class Tutor:
    def __init__(
        self, memory: ConversationStore, paths: PathPlanner | None = None
    ) -> None:
        self._memory = memory
        self._paths = paths or LearningPathService()

    async def stream(
        self,
        conversation_id: str,
        message: str,
        context: LearnerContext | None = None,
        calls: list[AppCall] | None = None,
        unanswered: list[str] | None = None,
        record: str = NOTHING_YET,
        turn: str | None = None,
        caller: Caller | None = None,
        budget: GenerationBudget | None = None,
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
        once per turn is not made to keep it twice by a turn run again. ``caller`` is who lessons are
        made for, and ``budget`` what the turn may spend making them and planning paths."""
        context = context or LearnerContext()
        form_answer = answer_in(message, context)
        if form_answer:
            context = learner_with(context, form_answer)
        # Without this turn's own exchange from a run before it was run again: the model and the
        # form's count read the conversation as it was when the turn began.
        earlier = await recalled(self._memory, conversation_id, turn)
        shown = [e.get("card", "") for e in earlier.exchanges]
        added = confirmed(path_answer(message, context), shown)
        missed_add = _missed_add(unanswered or [], context, shown, added)
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
            "app": app_told(calls, added),
            "skills_in_effect": rendered(ages),
            "message": message,
        }
        verdicts = verdicts_of(calls, earlier.exchanges)
        said = said_by_learner(context, inputs, earlier.exchanges, missed)
        # What the learner chose in a message whose turn failed is added now: it never reached them.
        saved = [a for a in (form_answer, missed_add, added) if a]
        this_turn = Turn(
            context,
            message,
            active,
            workshop_for(self._paths, caller, budget),
            earlier_path_in([e.get("card", "") for e in earlier.exchanges]),
            added,
        )
        async for item in _answered(this_turn, inputs, verdicts, said, saved):
            if isinstance(item, Answered):
                answered = item
            else:
                yield item
        answer, cards = await owed(answered, this_turn)
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
        await self._keep(conversation_id, exchanges, len(missed), turn)
        yield TutorReply(
            # Remembered as written, so the model's own history stays its words.
            answer=reply_text(answer),
            follow_ups=await safe_ones(
                clean_follow_ups(answered.prediction.follow_ups), said
            ),
            actions=answered.outputs.actions,
            cards=cards,
        )

    async def _keep(
        self,
        conversation_id: str,
        exchanges: list[Exchange],
        missed: int,
        turn: str | None,
    ) -> None:
        """The turn's exchanges, the learner's own message being the turn and the ones that failed
        before it its first."""
        for n, exchange in enumerate(exchanges):
            named = (
                None
                if turn is None
                else (turn if n == missed else f"{turn}:missed:{n}")
            )
            await self._memory.append(conversation_id, exchange, turn=named)


async def _answered(
    turn: Turn,
    inputs: dict,
    verdicts: tuple[bool, ...],
    said: Said,
    saved: list[Action],
) -> AsyncIterator[
    AnswerDelta | AnswerRestart | ToolActivity | ToolFinished | SkillLoaded | Answered
]:
    """An answer that runs away is withdrawn and written again, once, with
    some sampling."""
    for again in (False, True):
        try:
            async for item in _attempt(turn, inputs, verdicts, said, saved, again):
                yield item
            return
        except (Runaway, AdapterParseError) as error:
            if again:
                raise
            logger.warning("The answer ran away, so it is written again: %s", error)
            yield AnswerRestart()


async def _attempt(
    turn: Turn,
    inputs: dict,
    verdicts: tuple[bool, ...],
    said: Said,
    saved: list[Action],
    again: bool,
) -> AsyncIterator[AnswerDelta | ToolActivity | ToolFinished | SkillLoaded | Answered]:
    """Closing it stops the model. ``saved`` are the actions the learner's own answer has made."""
    outputs = TurnOutputs(actions=list(saved))
    agent = _streamed_agent(turn, outputs, again)
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
                    else Answered(item, outputs, screen.answer())
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


def _stopped_answer(screen: SafetyScreen, saved: list[Action]) -> Answered:
    """What the model goes on to write, call or suggest is not used; what the learner's own answer
    saved is, so far as it is safe to keep."""
    return Answered(
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


def _missed_add(
    unanswered: list[str],
    context: LearnerContext,
    shown: list[str],
    added: AddPaths | None,
) -> AddPaths | None:
    """The courses chosen in the latest message whose turn failed, less any this message chooses
    again: the choice is the learner's and is kept."""
    for text in reversed(unanswered):
        missed = confirmed(path_answer(text, context), shown)
        if missed is None:
            continue
        again = {p.subject.casefold() for p in added.paths} if added else set()
        paths = [p for p in missed.paths if p.subject.casefold() not in again]
        return AddPaths(paths=paths) if paths else None
    return None


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
