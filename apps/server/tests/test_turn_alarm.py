"""A chat's Durable Object: told of a turn, it sets its alarm; the alarm runs the turns, and is left set
or cleared according to what is left to do."""

from app.agent.toolkit import TOOLS
from app.agent.tools_known import READ_ONLY_TOOLS
from app.turns.alarm import CHAT_KEY, ChatTurnAlarm


class Storage:
    def __init__(self) -> None:
        self.values: dict = {}
        self.alarm_at: int | None = None

    async def get(self, key):
        return self.values.get(key)

    async def put(self, key, value):
        self.values[key] = value

    async def getAlarm(self):
        return self.alarm_at

    async def setAlarm(self, at):
        self.alarm_at = at

    async def deleteAlarm(self):
        self.alarm_at = None


class Runner:
    """Answers `advance` from a list, and clears or sets the alarm as the real runner does."""

    def __init__(self, waits, schedule) -> None:
        self.waits = list(waits)
        self.schedule = schedule
        self.chats: list[str] = []

    async def advance(self, chat):
        self.chats.append(chat)
        wait = self.waits.pop(0)
        if wait is None:
            await self.schedule(None)
        return wait


def alarm_with(storage, waits, now=1000):
    runners: list[Runner] = []

    def runner_for(schedule):
        runner = Runner(waits, schedule)
        runners.append(runner)
        return runner

    return ChatTurnAlarm(storage, runner_for, lambda: now), runners


async def test_telling_the_object_of_a_turn_rings_the_alarm_now():
    storage = Storage()
    alarm, _ = alarm_with(storage, [])

    await alarm.wake("c1")

    assert storage.values[CHAT_KEY] == "c1"
    assert storage.alarm_at == 1000


async def test_an_alarm_already_due_sooner_is_left_alone():
    storage = Storage()
    storage.alarm_at = 900
    alarm, _ = alarm_with(storage, [])

    await alarm.wake("c1")

    assert storage.alarm_at == 900


async def test_a_watchdog_alarm_further_off_is_brought_forward():
    storage = Storage()
    storage.alarm_at = 31_000
    alarm, _ = alarm_with(storage, [])

    await alarm.wake("c1")

    assert storage.alarm_at == 1000


async def test_the_alarm_runs_turns_until_none_is_left_and_clears_itself():
    storage = Storage()
    storage.values[CHAT_KEY] = "c1"
    storage.alarm_at = 1000
    alarm, runners = alarm_with(storage, [0, 0, None])

    await alarm.alarm()

    assert runners[0].chats == ["c1"] * 3
    assert storage.alarm_at is None


async def test_a_turn_to_retry_later_leaves_the_alarm_at_its_time():
    storage = Storage()
    storage.values[CHAT_KEY] = "c1"
    alarm, runners = alarm_with(storage, [2000])

    await alarm.alarm()

    assert runners[0].chats == ["c1"]
    assert storage.alarm_at == 3000


async def test_an_alarm_for_an_object_that_was_never_told_of_a_chat_does_nothing():
    storage = Storage()
    alarm, runners = alarm_with(storage, [])

    await alarm.alarm()

    assert runners == []


def test_every_tool_the_tutor_has_is_known_to_be_read_only():
    """A resumed turn calls its tools again, so a tool that changes anything outside the turn must
    write `tool.started` before it leaves and be left out of this set (apps/server/src/app/turns/rules.py)."""
    assert {spec.name for spec in TOOLS} == READ_ONLY_TOOLS
