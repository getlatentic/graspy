"""A provisional estimate of what a child knows, per skill, from evidence events.

This is not a calibrated model and says nothing a number should be quoted for: its weights are chosen, not
fitted, because there are no recordings of real children to fit them on. It exists so that everything that
will feed a fitted model (the skills, which answers speak for which, how much help sat behind each) is
exercised now, and so a fitted tracer (Bayesian knowledge tracing, performance factor analysis) can replace
it behind the same two calls: `trace` to fold events in, `estimate` to read a skill. Its output is a state
word, never a probability shown to anyone.
"""

from dataclasses import dataclass, field
from datetime import date

from .evidence_events import (
    LEVEL_INDEPENDENT,
    EvidenceEvent,
)

# What a right answer is worth towards a skill by how much help sat behind it; the more the teacher
# did, the less it shows the child can.
SUCCESS_WEIGHT = {0: 1.0, 1: 0.7, 2: 0.5, 3: 0.35, 4: 0.15, 5: 0.05}
# What a wrong answer counts against a skill: all of it when the child was alone, half when it came after help.
FAILURE_WEIGHT = {0: 1.0, 1: 1.0, 2: 0.6, 3: 0.5, 4: 0.5, 5: 0.5}
SUPPORTING = 0.5  # an answer counts half as much for a skill it only needs as for the one it shows
ALONE_DAYS = 2


@dataclass
class SkillState:
    successes: float = 0.0
    failures: float = 0.0
    alone_days: set[date] = field(default_factory=set)
    supported_days: set[date] = field(default_factory=set)
    answers: int = 0

    @property
    def score(self) -> float:
        """A smoothed share of the evidence that was success: a state's input, not a probability."""
        return (self.successes + 1) / (self.successes + self.failures + 2)


def trace(
    state: dict[str, SkillState], events: list[EvidenceEvent]
) -> dict[str, SkillState]:
    """Fold events into the state of every skill they speak for. Recordings nobody could hear carry nothing."""
    for event in events:
        if event.outcome == "unheard":
            continue
        for use in event.skills:
            skill = state.setdefault(use.skill, SkillState())
            share = 1.0 if use.role == "primary" else SUPPORTING
            skill.answers += 1
            if event.outcome == "correct":
                skill.successes += share * SUCCESS_WEIGHT[event.support_level]
                (
                    skill.alone_days
                    if event.support_level == LEVEL_INDEPENDENT
                    else skill.supported_days
                ).add(event.day)
            else:
                skill.failures += share * FAILURE_WEIGHT[event.support_level]
    return state


def estimate(state: dict[str, SkillState], skill_id: str) -> str:
    """Where the child stands on one skill, as a word: unknown, shaky, supported, alone once, or alone.

    Alone needs the skill shown without help on two days and the evidence leaning the right way; right
    answers only after help are `supported`, however many, because they show the child can follow."""
    skill = state.get(skill_id)
    if skill is None or skill.answers == 0:
        return "unknown"
    if len(skill.alone_days) >= ALONE_DAYS and skill.score >= 0.7:
        return "alone"
    if skill.alone_days and skill.score >= 0.5:
        return "alone_once"
    if skill.supported_days and not skill.alone_days and skill.score >= 0.5:
        return "supported"
    return "shaky"
