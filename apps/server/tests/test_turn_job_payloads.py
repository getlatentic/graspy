"""What a turn's last event carries for the app: the answer with its maths
repaired, whether the turn finished or the learner stopped it."""

from app.agent.tutor import TutorReply
from app.turns.job import reply_payload, words_payload

WRITTEN = r"Half is \frac12 and `$HOME/$USER` stays."
REPAIRED = r"Half is <latex-inline>\frac12</latex-inline> and `$HOME/$USER` stays."


def test_the_words_of_a_stopped_turn_are_repaired():
    assert words_payload(WRITTEN)["answer"] == REPAIRED


def test_a_finished_reply_is_carried_as_the_tutor_repaired_it():
    assert reply_payload(TutorReply(answer=REPAIRED))["answer"] == REPAIRED
