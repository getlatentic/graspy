"""What a practice prompt asks for, in the shape the teacher agent marks against.

Every kind of answer a learner can give reaches the same teacher: one number, a whole times table,
a list said in order, or a word. The agent needs to know which of those it is, and what counts as
right, because it holds the markers now. This is the only place that translation happens, so the
Worker keeps the curriculum and the agent keeps the judging.
"""

from .exercises import (
    FactAnswerExercise,
    SequenceExercise,
    SingleAnswerExercise,
    SpokenAnswerExercise,
    TimesTableExercise,
)
from .spoken_numbers import spellings

SEVEN, EIGHT = 7, 8


def expectation(activity) -> dict:
    """How this prompt is marked, and the item the learner's memory of it is filed under."""
    if isinstance(activity, FactAnswerExercise):
        return _fact(activity.table, activity.multiplier)
    if isinstance(activity, SingleAnswerExercise):
        return _fact(SEVEN, EIGHT)
    if isinstance(activity, TimesTableExercise):
        recitation = activity.recitation
        return {
            "kind": "recitation",
            "item": f"table-{recitation.table}",
            "table": recitation.table,
            "multipliers": list(recitation.multipliers),
        }
    if isinstance(activity, SequenceExercise):
        listed = {
            "kind": "sequence",
            "item": activity.memory_item or activity.prompt_id,
            "items": [_item(item) for item in activity.items],
        }
        for name in ("more", "before"):
            if getattr(activity, name):
                listed[name] = [_item(item) for item in getattr(activity, name)]
        return listed
    if isinstance(activity, SpokenAnswerExercise):
        return {
            "kind": "fact",
            "item": activity.expected[0],
            "accept": sorted(
                {
                    spelling
                    for answer in activity.expected
                    for spelling in spellings(answer)
                }
            ),
        }
    raise ValueError(f"no marking is defined for {type(activity).__name__}")


def _item(item) -> dict:
    return {"id": item.id, "spoken": list(item.spoken)}


def _fact(table: int, multiplier: int) -> dict:
    return {"kind": "fact", "item": f"{table}x{multiplier}"}
