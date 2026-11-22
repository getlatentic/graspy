"""What a stopped turn's last event carries for the app: the words the learner
saw, with their maths repaired and written as $ and $$, as a finished reply is
(a client reads $ and $$, not graspy's tags)."""

from app.turns.job import words_payload


def test_the_words_of_a_stopped_turn_have_their_maths_repaired_as_dollars():
    written = r"Half is \frac12 and \(x^2\) with `$HOME/$USER` kept."
    assert words_payload(written)["answer"] == (
        r"Half is $\frac12$ and $x^2$ with `$HOME/$USER` kept."
    )


def test_a_stopped_turn_with_no_maths_is_unchanged():
    assert words_payload("Half an answ")["answer"] == "Half an answ"
