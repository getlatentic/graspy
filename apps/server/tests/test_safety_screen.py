"""The safety stage: blocks checked together and released in order, the first
that is not safe ends the answer, and a judge that fails is not a pass."""

import asyncio

import pytest

from app.agent import safety_judge, safety_screen
from app.agent.safety_screen import (
    PERSONAL_LINE,
    UNCHECKED_LINE,
    UNSAFE_LINE,
    SafetyScreen,
    safe_ones,
)
from app.agent.said import Said

NOBODY = Said("", "")


def judge_that(verdicts: dict[str, str], seen: list | None = None, delay: float = 0.0):
    async def judged(passage: str, before: str, said: Said) -> str:
        if seen is not None:
            seen.append((passage, before, said))
        await asyncio.sleep(delay)
        return verdicts.get(passage.strip(), "safe")

    return judged


async def sent_through(screen: SafetyScreen, *texts: str) -> str:
    out = ""
    for text in texts:
        screen.submit(text)
        out += await screen.released()
    return out + await screen.finish()


async def test_safe_blocks_come_out_whole_and_in_order(monkeypatch):
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, delay=0.01))
    screen = SafetyScreen(NOBODY)

    out = await sent_through(
        screen, "One is a number.\n\nTwo is ", "a number.\n\nThree."
    )

    assert out == "One is a number.\n\nTwo is a number.\n\nThree."
    assert screen.answer() == out
    assert screen.reason is None


async def test_the_first_unsafe_block_ends_the_answer(monkeypatch):
    monkeypatch.setattr(safety_judge, "judged", judge_that({"Bad one.": "unsafe"}))
    screen = SafetyScreen(NOBODY)

    out = await sent_through(
        screen, "Fine one.\n\nBad one.\n\nFine two.\n\nFine three."
    )

    assert out == "Fine one.\n\n" + UNSAFE_LINE
    assert screen.reason == "unsafe"
    assert "Fine two" not in screen.answer()


async def test_blocks_after_a_stop_are_not_even_checked(monkeypatch):
    seen: list = []
    monkeypatch.setattr(
        safety_judge, "judged", judge_that({"Bad one.": "unsafe"}, seen)
    )
    screen = SafetyScreen(NOBODY)

    await sent_through(screen, "Bad one.\n\n")
    await sent_through(screen, "Later one.\n\nMore.")

    assert [block for block, *_ in seen] == ["Bad one."]


async def test_a_paragraph_is_read_whole_by_the_judge(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))

    await sent_through(
        SafetyScreen(NOBODY), "A form has fields.\n| Name | Ada |\n| Phone | 080 |"
    )

    assert [block for block, *_ in seen] == [
        "A form has fields.\n| Name | Ada |\n| Phone | 080 |"
    ]


async def test_one_unsafe_sentence_stops_the_whole_block(monkeypatch):
    monkeypatch.setattr(safety_judge, "judged", judge_that({}))

    out = await sent_through(
        SafetyScreen(NOBODY), "Good. Tell me your phone number. Also good."
    )

    assert out == PERSONAL_LINE


async def test_a_long_paragraph_is_cut_at_a_sentence_end(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_screen, "MAX_BLOCK", 30)
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))

    out = await sent_through(
        SafetyScreen(NOBODY), "First sentence here. Second sentence here. Third sen"
    )

    assert [block.strip() for block, *_ in seen] == [
        "First sentence here. Second sentence here.",
        "Third sen",
    ]
    assert out == "First sentence here. Second sentence here. Third sen"


async def test_a_request_split_over_two_lines_is_still_a_request(monkeypatch):
    monkeypatch.setattr(safety_judge, "judged", judge_that({}))

    out = await sent_through(SafetyScreen(NOBODY), "What is your\nhome address?")

    assert out == PERSONAL_LINE


async def test_a_rule_stops_a_block_without_asking_the_judge(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))

    out = await sent_through(SafetyScreen(NOBODY), "What is your home address?")

    assert out == PERSONAL_LINE
    assert seen == []


async def test_a_judge_that_fails_is_not_a_pass(monkeypatch):
    async def broken(passage: str, before: str, said: Said) -> str:
        raise RuntimeError("down")

    monkeypatch.setattr(safety_judge, "judged", broken)

    assert await sent_through(SafetyScreen(NOBODY), "Hello there.") == UNCHECKED_LINE


async def test_a_judge_that_is_too_slow_is_not_a_pass(monkeypatch):
    monkeypatch.setattr(safety_screen, "JUDGE_SECONDS", 0.05)
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, delay=1.0))

    assert await sent_through(SafetyScreen(NOBODY), "Hello there.") == UNCHECKED_LINE


async def test_a_block_with_no_words_is_not_sent_to_the_judge(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))

    out = await sent_through(SafetyScreen(NOBODY), "\\( 3 + 4 = 7 \\)\n")

    assert out == "\\( 3 + 4 = 7 \\)\n"
    assert seen == []


async def test_the_judge_reads_the_reply_before_the_block(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))

    await sent_through(SafetyScreen(NOBODY), "Never share these:\n\n* Your address")

    assert [(block, before) for block, before, _ in seen] == [
        ("Never share these:", ""),
        ("* Your address", "Never share these:\n\n"),
    ]


async def test_the_judge_reads_what_the_learner_said(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))

    await sent_through(SafetyScreen(Said("I am Ada", "Class JSS 1")), "Hello Ada.")

    assert [(block, said.message) for block, _, said in seen] == [
        ("Hello Ada.", "I am Ada")
    ]


async def test_blocks_are_checked_at_the_same_time(monkeypatch):
    running = peak = 0

    async def judged(passage: str, before: str, said: Said) -> str:
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.02)
        running -= 1
        return "safe"

    monkeypatch.setattr(safety_judge, "judged", judged)

    await sent_through(
        SafetyScreen(NOBODY),
        "A one.\n\nB two.\n\nC three.\n\nD four.\n\nE five.\n\nF six.",
    )

    assert 1 < peak <= safety_screen.CHECKS_AT_ONCE


async def test_closing_stops_the_checks(monkeypatch):
    started = asyncio.Event()
    stopped = []

    async def judged(passage: str, before: str, said: Said) -> str:
        started.set()
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            stopped.append(passage)
            raise
        return "safe"

    monkeypatch.setattr(safety_judge, "judged", judged)
    screen = SafetyScreen(NOBODY)
    screen.submit(
        "One here.\n\nTwo here.\n\nThree here.\n\nFour here.\n\nFive here.\n\nSix."
    )
    await started.wait()

    screen.close()
    await asyncio.sleep(0)

    assert sorted(stopped) == sorted(
        ["One here.", "Two here.", "Three here.", "Four here."]
    )
    assert screen._queue == []


async def test_only_the_texts_that_are_safe_are_shown(monkeypatch):
    monkeypatch.setattr(safety_judge, "judged", judge_that({"Bad?": "unsafe"}))

    assert await safe_ones(["Good?", "Bad?", "Add me on Instagram?"], NOBODY) == [
        "Good?"
    ]


@pytest.mark.parametrize(
    ("reason", "line"),
    [
        ("unsafe", UNSAFE_LINE),
        ("abuse", UNSAFE_LINE),
        ("contact", UNSAFE_LINE),
        ("asks_personal", PERSONAL_LINE),
        ("invents_personal", PERSONAL_LINE),
        ("unchecked", UNCHECKED_LINE),
    ],
)
def test_every_reason_has_its_line(reason, line):
    assert safety_screen.line_for(reason) == line


async def test_a_judge_that_fails_once_is_asked_again(monkeypatch):
    calls = 0

    async def flaky(passage: str, before: str, said: Said) -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("busy")
        return "safe"

    monkeypatch.setattr(safety_judge, "judged", flaky)

    assert await sent_through(SafetyScreen(NOBODY), "Hello there.") == "Hello there."
    assert calls == 2


async def test_the_log_names_the_error_and_never_its_words(monkeypatch, caplog):
    async def broken(passage: str, before: str, said: Said) -> str:
        raise ValueError("the judge said: cook crack cocaine")

    monkeypatch.setattr(safety_judge, "judged", broken)

    await sent_through(SafetyScreen(NOBODY), "Hello there.")

    assert "ValueError" in caplog.text
    assert "cocaine" not in caplog.text


async def test_text_with_no_end_is_cut_at_a_hard_limit(monkeypatch):
    seen: list = []
    monkeypatch.setattr(safety_screen, "MAX_BLOCK", 10)
    monkeypatch.setattr(safety_screen, "HARD_BLOCK", 30)
    monkeypatch.setattr(safety_judge, "judged", judge_that({}, seen))
    screen = SafetyScreen(NOBODY)

    screen.submit("x" * 70)
    await screen.released()

    assert [len(block) for block, *_ in seen] == [30, 30]
