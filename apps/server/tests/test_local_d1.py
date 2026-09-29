"""The D1 stand-in refuses what D1 refuses, so a test cannot pass on a value the Worker would choke on."""

import pytest

from app.local_d1 import MAX_BOUND_INTEGER, LocalD1


@pytest.mark.parametrize(
    "value", [MAX_BOUND_INTEGER + 1, -(MAX_BOUND_INTEGER + 1), 2**63]
)
def test_an_integer_past_what_pyodide_passes_as_a_number_is_refused(value):
    with pytest.raises(OverflowError):
        LocalD1().prepare("SELECT ?1").bind(value)


def test_epoch_milliseconds_and_the_largest_safe_bound_are_bound():
    bound = (
        LocalD1()
        .prepare("SELECT ?1 AS a, ?2 AS b")
        .bind(1_800_000_000_000, MAX_BOUND_INTEGER)
    )

    assert bound.rows() == [{"a": 1_800_000_000_000, "b": MAX_BOUND_INTEGER}]
