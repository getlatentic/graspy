"""A lesson made apart from any request: joined, not paid for twice."""

import asyncio

import pytest
from lesson_example import LESSON, SLIDE

from app.domains.lesson.lesson import FinishedLesson
from app.domains.lesson.prompts import PlanSummary
from app.learner.record import LearnerRecord
from app.learner.store import InMemoryLearnerStore
from app.lessons.makers import TaskLessonMaking
from app.lessons.making import STALE_MS, Job, LessonTarget, Making, started
from app.lessons.run import LessonRunner
from app.lessons.store import InMemoryLessonStore

TARGET = LessonTarget(
    plan_id="plan-1",
    subject_slug="mathematics",
    subject="Mathematics",
    topic_index=1,
    topic="Fractions",
    total_topics=3,
    country="Nigeria",
    language="English",
)
DEVICE = "device-1"


def job(attempt: int = 0, learner: str | None = DEVICE) -> str:
    return Job(learner=learner, target=TARGET, attempt=attempt).model_dump_json(
        by_alias=True
    )


def stored(status: str, attempt: int = 0, updated_at: int = 0) -> str:
    return Making(
        status=status, attempt=attempt, updated_at=updated_at
    ).model_dump_json(by_alias=True)


def test_nothing_there_starts_a_lesson_with_its_topic_and_no_slides():
    answer, run = started(None, job(), 10)

    making = Making.model_validate_json(answer)
    assert run
    assert (making.status, making.updated_at) == ("making", 10)
    assert making.lesson.title == "Fractions"
    assert making.lesson.slides == []


@pytest.mark.parametrize(
    ("there", "attempt", "now", "runs"),
    [
        pytest.param(stored("making", updated_at=0), 0, STALE_MS, False, id="live"),
        pytest.param(stored("making", updated_at=0), 0, STALE_MS + 1, True, id="lost"),
        pytest.param(stored("ready"), 5, 10**12, False, id="ready"),
        pytest.param(stored("failed", attempt=1), 1, 1, False, id="failed-same"),
        pytest.param(stored("failed", attempt=1), 2, 1, True, id="failed-again"),
        pytest.param(stored("failed"), 0, STALE_MS + 1, True, id="failed-long-ago"),
    ],
)
def test_a_lesson_is_made_again_only_when_it_failed_or_was_lost(
    there, attempt, now, runs
):
    answer, run = started(there, job(attempt), now)

    assert run is runs
    assert (answer == there) is not runs


class FakeService:
    """The lesson pipeline's events, held after the first slide until let go."""

    def __init__(self, success: bool = True, fail: bool = False):
        self.success, self.fail = success, fail
        self.go = asyncio.Event()
        self.requests = []

    async def events(self, request):
        self.requests.append(request)
        yield {"type": "status", "message": "planning"}
        yield {
            "type": "plan",
            "payload": PlanSummary(learning_objectives=["o"], key_points=["k"]),
        }
        yield {"type": "slide", "payload": SLIDE}
        await self.go.wait()
        if self.fail:
            raise RuntimeError("The model failed")
        yield {
            "type": "complete",
            "payload": FinishedLesson(success=self.success, lesson=LESSON),
        }


def making_with(service):
    lessons, learners = InMemoryLessonStore(), InMemoryLearnerStore()
    runner = LessonRunner(service, lessons, learners)
    return TaskLessonMaking(runner), lessons, learners


async def settled(making: TaskLessonMaking, key: str) -> Making:
    for _ in range(100):
        current = await making.progress(key)
        if current.status != "making":
            return current
        await asyncio.sleep(0)
    return current


async def test_a_lesson_arrives_slide_by_slide_and_is_kept_and_filed_once_whole():
    service = FakeService()
    making, lessons, learners = making_with(service)
    notes = "Recent mistakes: halves"

    first = await making.start("key", Job(learner=DEVICE, target=TARGET, notes=notes))
    await asyncio.sleep(0)
    joined = await making.start("key", Job(learner=DEVICE, target=TARGET))
    service.go.set()
    done = await settled(making, "key")

    assert first.status == "making"
    assert joined.lesson.slides == [SLIDE]
    assert joined.lesson.key_points == ["k"]
    assert joined.lesson.objectives == ["o"]
    assert (done.status, done.whole, done.lesson) == ("ready", True, LESSON)
    assert len(service.requests) == 1
    assert service.requests[0].learner_notes == notes
    assert await lessons.find(done.lesson_id) == LESSON
    record = await learners.load(DEVICE)
    assert record.lesson_on("plan-1", "mathematics", "Fractions") == done.lesson_id


async def test_a_lesson_missing_a_part_is_shown_but_not_kept():
    service = FakeService(success=False)
    making, _, learners = making_with(service)

    await making.start("key", Job(learner=DEVICE, target=TARGET))
    service.go.set()
    done = await settled(making, "key")

    assert (done.status, done.whole, done.lesson_id) == ("ready", False, None)
    assert await learners.load(DEVICE) == LearnerRecord()


async def test_a_failed_lesson_keeps_what_arrived_and_can_be_asked_for_again():
    service = FakeService(fail=True)
    making, _, _ = making_with(service)

    await making.start("key", Job(learner=DEVICE, target=TARGET))
    service.go.set()
    failed = await settled(making, "key")
    again = await making.start("key", Job(learner=DEVICE, target=TARGET, attempt=1))
    await settled(making, "key")

    assert failed.status == "failed"
    assert failed.lesson.slides == [SLIDE]
    assert again.status == "making"
    assert len(service.requests) == 2


def test_each_learner_has_their_own_lesson_on_a_topic():
    assert TARGET.key("device-1") != TARGET.key("device-2")
    assert TARGET.key("device-1") == TARGET.model_copy().key("device-1")
