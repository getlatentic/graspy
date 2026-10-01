"""Where a learner stands on each lesson plan, and the limits that decide when a lesson is left for tomorrow."""

from dataclasses import dataclass, field
from datetime import date

MASTERY_DAYS = 2
# A lesson passed only with help, on this many days, lets the lesson that needs it begin.
SUPPORTED_DAYS_TO_UNLOCK = 2
# A check of what the child already knows is asked this many times a day. A child who tried and got some of it
# is taught next; one who showed nothing of it is given the answer to say after the teacher, and asked once more.
RECALL_ATTEMPTS = 2
# An activity the child could not begin to do this many times running in a day is left for tomorrow: a child who
# has been shown, and shown again, and still cannot do it is not helped by a fourth try.
PAUSE_AFTER = 3
# What the child is asked to do alone, or to say after the teacher: any of these can leave the lesson for tomorrow.
PAUSING_EVENTS = ("elicit_performance", "assess_performance", "provide_guidance")
# The activities that are shown again, in the plan's guided practice, after a miss.
RETEACH_EVENTS = ("elicit_performance", "assess_performance")
# A lesson left for tomorrow on this many days comes after the other lessons that can be started, so the child is not
# sent back to the same failure first; when there is nothing else, it is offered again.
PAUSED_DAYS_LIMIT = 3
# A child who cannot be heard this many times running is sent home kindly, not marked wrong.
UNHEARD_LIMIT = 4


@dataclass
class PlanProgress:
    done_today: set[str] = field(default_factory=set)
    retry_today: set[str] = field(default_factory=set)
    guidance_owed: set[str] = field(default_factory=set)
    # Events missed twice running that a shorter step of the plan is owed before they are asked again.
    rung_owed: set[str] = field(default_factory=set)
    # Per list activity, the item its last wrong try broke at, after at least one item said rightly.
    resume_at: dict[str, str] = field(default_factory=dict)
    # Per check of what the lesson builds on, how many tries in a row drew nothing right from the child.
    blank_recall: dict[str, int] = field(default_factory=dict)
    # The checks whose answer was said after the teacher, and those asked again since and not yet answered.
    echoed: set[str] = field(default_factory=set)
    recheck_due: set[str] = field(default_factory=set)
    rechecked: set[str] = field(default_factory=set)
    # Per list activity, the item the child was last asked for before being told it ("probed"), whether they
    # had it, and the item that was then said for them to say after the teacher ("shown").
    probed: dict[str, str] = field(default_factory=dict)
    probe_right: dict[str, bool] = field(default_factory=dict)
    shown: dict[str, str] = field(default_factory=dict)
    # Per check, how many of the skill's small teaching questions have been got through, and misses at this one.
    remedy_done: dict[str, int] = field(default_factory=dict)
    remedy_misses: dict[str, int] = field(default_factory=dict)
    # Misses in a row today per activity, counted while the child makes no progress: a wrong answer with
    # some facts right, or a right answer, starts the count again.
    failed_today: dict[str, int] = field(default_factory=dict)
    paused_today: bool = False
    assessed_today: bool = False
    paused_days: set[date] = field(default_factory=set)
    last_decision: dict[str, str] = field(default_factory=dict)
    facts_owed: dict[str, frozenset[int]] = field(default_factory=dict)
    assessed_days: set[date] = field(default_factory=set)
    # The days the check was passed at the first try, with no help: the only days that show a lesson is known.
    independent_days: set[date] = field(default_factory=set)
    # The days the check was passed only after help: progress, but not a lesson learnt, and not complete.
    supported_days: set[date] = field(default_factory=set)
    supported_today: bool = False
    last_day: date | None = None

    @property
    def mastered(self) -> bool:
        return len(self.independent_days) >= MASTERY_DAYS

    @property
    def owes_a_check(self) -> bool:
        """Passed with help on an earlier day, not yet on enough days to let the next lesson begin, and never
        alone: its check is asked again, on its own. Once the next lesson is unlocked the lesson is only a
        review candidate, which the memory brings round sooner for having needed help."""
        return bool(self.supported_days) and not self.unlocks

    @property
    def unlocks(self) -> bool:
        """Whether a lesson that needs this one may be started: passed alone, or with help on two days, so a
        child who always needs a second try is slowed down, not stopped."""
        return (
            bool(self.assessed_days)
            or len(self.supported_days) >= SUPPORTED_DAYS_TO_UNLOCK
        )

    @property
    def reviewed_today(self) -> bool:
        """Assessed today a lesson that was assessed on an earlier day too."""
        return self.assessed_today and len(self.assessed_days) >= 2
