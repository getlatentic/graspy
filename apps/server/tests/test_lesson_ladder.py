"""The help a wrong answer to a lesson's check is given, least first."""

import pytest

from app.lessons.ladder import Help, next_help


@pytest.mark.parametrize(
    ("options", "answer", "wrong", "expected"),
    [
        (4, 0, {1}, Help("cue")),
        (4, 0, {1, 2}, Help("narrow", (0, 3))),
        (4, 0, {1, 2, 3}, Help("told")),
        (5, 2, {0, 1}, Help("narrow", (2, 3))),
        (5, 2, {0, 1, 3}, Help("told")),
        (3, 0, {1}, Help("cue")),
        (3, 0, {1, 2}, Help("told")),
        (2, 0, {1}, Help("told")),
        (4, 3, {0, 1}, Help("narrow", (2, 3))),
    ],
)
def test_the_next_help_gives_a_little_more_each_time(options, answer, wrong, expected):
    assert next_help(options, answer, wrong) == expected


def test_a_repeated_wrong_choice_is_not_a_second_try():
    assert next_help(4, 0, [1, 1]) == Help("cue")
