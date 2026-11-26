"""A turn's plans and lessons are spent from the generation budget of the source the request came from."""

from dataclasses import replace

import pytest
from test_a2a import FakeTutor
from workshops import Limited, keeping

from app.turns.job import TurnJob, tutor_stream


async def budget_of(job: TurnJob, limiter=None):
    tutor = FakeTutor()
    shop = replace(keeping(), generate=limiter)
    _ = [item async for item in tutor_stream(tutor, shop, job)]
    [budget] = tutor.budgets
    return budget


def job(**fields) -> TurnJob:
    return TurnJob(chat="chat-1", turn="turn-1", message="hi", **fields)


async def test_the_budget_is_that_of_the_address_the_edge_saw():
    limiter = Limited(allowed=5)

    budget = await budget_of(job(source="203.0.113.7", owner="visitor:v1"), limiter)

    assert budget.limiter is limiter
    assert budget.key == "203.0.113.7"
    assert await budget.spend()
    assert limiter.keys == ["203.0.113.7"]


async def test_a_signed_in_learner_is_counted_for_themselves_not_their_network():
    budget = await budget_of(job(learner="learner-1", source="203.0.113.7"))

    assert budget.key == "learner-1"


@pytest.mark.parametrize(
    "fields",
    [{"owner": "visitor:v1"}, {}],
    ids=["a-visitor-id-is-not-an-address", "nobody"],
)
async def test_with_no_address_and_no_learner_nothing_is_made(fields):
    """A key the client chose would be a fresh budget each time."""
    limiter = Limited(allowed=5)

    budget = await budget_of(job(**fields), limiter)

    assert budget.key is None
    assert not await budget.spend()
    assert limiter.keys == []


async def test_where_no_budget_is_bound_there_is_no_limit():
    budget = await budget_of(job(source="203.0.113.7"), None)

    assert budget.limiter is None
    assert await budget.spend()


async def test_a_spent_budget_refuses():
    limiter = Limited(allowed=0)

    budget = await budget_of(job(source="203.0.113.7"), limiter)

    assert not await budget.spend()
