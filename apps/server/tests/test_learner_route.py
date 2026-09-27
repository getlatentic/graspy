from app.agent.memory import InMemoryConversationStore
from app.caller import Caller, Keeping
from app.education.route import ClassAsk
from app.learner.route import learner_route
from app.learner.store import InMemoryLearnerStore
from app.lessons.makers import TaskLessonMaking
from app.lessons.store import InMemoryLessonStore
from app.local_d1 import LocalD1
from app.threads.store import ThreadStore


class NamedOnlyStore(InMemoryLearnerStore):
    """As the production store: every learner it reads is named."""

    async def plan(self, learner: str) -> str | None:
        if learner is None:
            raise TypeError("A learner's plan is read by name")
        return await super().plan(learner)


async def never_run(_job, _save):
    raise AssertionError("A route never makes a lesson")


def no_learner() -> Caller:
    keeping = Keeping(
        learners=NamedOnlyStore(),
        lessons=InMemoryLessonStore(),
        making=TaskLessonMaking(never_run),
        conversations=InMemoryConversationStore(),
        threads=ThreadStore(LocalD1()),
    )
    return Caller(None, keeping)


async def test_a_session_with_no_learner_is_routed_by_the_class_it_names():
    nursery = ClassAsk(system="NG", level="nursery-1")

    routed = await learner_route(nursery, no_learner())

    assert routed["structuredContent"] == {"voiceOnly": True}


async def test_a_session_with_no_learner_and_no_class_learns_by_slides_and_voice():
    routed = await learner_route(ClassAsk(), no_learner())

    assert routed["structuredContent"] == {"voiceOnly": False}
