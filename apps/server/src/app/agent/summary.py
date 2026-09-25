"""The summary a long conversation's oldest exchanges are folded into."""

from __future__ import annotations

import logging
from functools import cache

import dspy

from .memory import KEPT_AFTER_FOLD, MAX_EXCHANGES, Conversation, ConversationStore
from .transcript import render

logger = logging.getLogger(__name__)

# Long enough to hold a learner's level, their mistakes and what they asked
# for; short enough to cost less than the exchanges it replaces.
MAX_SUMMARY_WORDS = 200


class SummariseConversation(dspy.Signature):
    """Update the summary of a tutoring conversation with the exchanges that
    are about to be dropped from it. Keep what a tutor needs to go on
    teaching this learner: what they asked about and understood, the
    mistakes they made, practice questions and how they did, what they said
    about themselves and how they like to learn. Write in the language the
    conversation is in. Leave out greetings and anything already covered."""

    summary: str = dspy.InputField(desc="The summary so far; empty at first")
    exchanges: str = dspy.InputField(desc="The exchanges to fold in, oldest first")
    updated: str = dspy.OutputField(
        desc=f"The whole updated summary, at most {MAX_SUMMARY_WORDS} words"
    )


@cache
def _summariser() -> dspy.Predict:
    # Built on first use: building draws a random id, which a Worker refuses
    # while it starts.
    return dspy.Predict(SummariseConversation)


async def summarised(summary: str, exchanges: str) -> str:
    prediction = await _summariser().acall(summary=summary, exchanges=exchanges)
    words = str(prediction.updated).split()
    return " ".join(words[: MAX_SUMMARY_WORDS * 2])


async def recalled(memory: ConversationStore, conversation_id: str) -> Conversation:
    """Past MAX_EXCHANGES, the oldest are folded into the summary first. A
    fold that fails costs the summary its update, not the learner a turn."""
    conversation = await memory.load(conversation_id)
    if len(conversation.exchanges) <= MAX_EXCHANGES:
        return conversation
    dropped = len(conversation.exchanges) - KEPT_AFTER_FOLD
    try:
        summary = await summarised(
            conversation.summary, render(conversation.exchanges[:dropped])
        )
        await memory.fold(conversation_id, summary, dropped)
    except Exception:
        logger.warning("Folding conversation %s failed", conversation_id, exc_info=True)
        return Conversation(
            conversation.summary, conversation.exchanges[-MAX_EXCHANGES:]
        )
    return Conversation(summary, conversation.exchanges[dropped:])
