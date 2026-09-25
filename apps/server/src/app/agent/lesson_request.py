"""Whether the learner asked for a topic's lesson, or to be taught here.

The step that chooses the tutor's tools takes "teach me fractions" for a
request for the lesson in 9 turns of 32, whatever its instructions say. Asked
on its own, the model tells them apart every time (0 of 56 and 48 of 48,
measured in English, Yoruba and Arabic).
"""

from __future__ import annotations

from functools import cache

import dspy


class AsksForLesson(dspy.Signature):
    """Whether the learner asks to go to the app's lesson screen for a topic, rather than to
    be taught here in the chat.

    True only when they name the lesson or going to it: "take me to fractions", "open the
    fractions lesson", "start the lesson", "continue the lesson", "go to fractions".
    False when they want to learn, even a whole topic: "teach me fractions", "I want to learn
    fractions", "explain fractions", "how do fractions work", "what is a fraction". The
    tutor teaches those here; it opens a lesson only when asked for the lesson."""

    message: str = dspy.InputField(desc="The learner's message")
    asks_for_lesson: bool = dspy.OutputField()


@cache
def _judge() -> dspy.Predict:
    # Built on first use: building draws a random id, which Worker startup
    # refuses.
    return dspy.Predict(AsksForLesson)


async def asks_for_lesson(message: str) -> bool:
    return bool((await _judge().acall(message=message)).asks_for_lesson)
