"""The safety stage of the answer a child reads. The answer is read a block at a
time (a paragraph, a list or a table, up to MAX_BLOCK characters): the rules read
each sentence of the block, and the judge reads the block, because a table row or
a list item says nothing alone. The first block that is not safe ends the answer,
so nothing after it is sent, and one fixed line closes what was sent. Blocks are
checked at the same time and released in order, so the learner waits for the last
one only. Nothing is retried: the same words would be asked again."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

from . import safety_judge
from .safety_rules import unsafe_in
from .said import Said

logger = logging.getLogger(__name__)

# A judge that has not answered in this long is a judge that failed.
JUDGE_SECONDS = 6.0
# Blocks checked at one moment in one answer.
CHECKS_AT_ONCE = 4
# A paragraph with no blank line is cut at a sentence end once it is this long.
MAX_BLOCK = 700
# Text with no sentence end or line break is cut anywhere once it is this long.
HARD_BLOCK = 2100
# The most of the reply before a block that the judge reads.
BEFORE_CHARS = 600

UNCHECKED = "unchecked"
# "Mrs. Okafor" is one name, not two sentences.
_SENTENCE_END = re.compile(
    r"(?<=[.!?])(?<!\bMr\.)(?<!\bMrs\.)(?<!\bMs\.)(?<!\bDr\.)(?<!\bProf\.)(?<!\bSt\.)\s+|\n+"
)
_BLANK_LINE = re.compile(r"\n[ \t]*\n\s*")

UNSAFE_LINE = (
    "I cannot help with that. If something is worrying you, tell a grown-up you trust. "
    "I can help with your lesson."
)
PERSONAL_LINE = (
    "I do not ask for or use personal details, like your name, address and phone number. "
    "Ask me about your lesson instead."
)
UNCHECKED_LINE = (
    "I could not check that reply, so I have not shown it. Please ask again."
)
_PERSONAL = {"asks_personal", "invents_personal"}


def line_for(reason: str) -> str:
    if reason == UNCHECKED:
        return UNCHECKED_LINE
    return PERSONAL_LINE if reason in _PERSONAL else UNSAFE_LINE


async def reason_not_to_send(text: str, said: Said, before: str = "") -> str | None:
    """Why the text may not be sent: a rule's name, `unsafe` from the judge, or
    `unchecked` when the judge could not say. None when it may."""
    for sentence in filter(None, _sentences(text)):
        found = unsafe_in(sentence, said.text)
        if found is not None:
            return found.value
    if not any(character.isalpha() for character in text):
        return None
    try:
        async with asyncio.timeout(JUDGE_SECONDS):
            verdict = await _judged_twice(text, before[-BEFORE_CHARS:], said)
    except Exception as error:  # noqa: BLE001 - fail closed on any failure of the judge
        # The error's name only: a parse error carries the judge's words.
        logger.warning("The safety judge did not answer: %s", type(error).__name__)
        return UNCHECKED
    return None if verdict == "safe" else verdict


async def _judged_twice(text: str, before: str, said: Said) -> str:
    """One more try for a call that failed, inside the same time limit."""
    try:
        return await safety_judge.judged(text, before, said)
    except Exception:  # noqa: BLE001 - the second try reports what the first did not
        return await safety_judge.judged(text, before, said)


@dataclass
class _Block:
    text: str
    check: asyncio.Task[str | None]


class SafetyScreen:
    def __init__(self, said: Said) -> None:
        self._said = said
        self._open = ""
        self._written = ""
        self._queue: list[_Block] = []
        self._room = asyncio.Semaphore(CHECKS_AT_ONCE)
        self._sent: list[str] = []
        self.reason: str | None = None

    def submit(self, text: str) -> None:
        """Takes in text; each block it completes starts being checked."""
        if self.reason is not None:
            return
        self._open += text
        for block in _completed(self._open):
            self._start(block)
            self._open = self._open[len(block) :]

    async def released(self) -> str:
        """The blocks, from the first, whose check has finished and that are safe."""
        # A check that needs no model has finished once the loop has run it.
        await asyncio.sleep(0)
        return await self._release(wait=False)

    async def finish(self) -> str:
        """The rest, once checked; and, when a block was not safe, the fixed line."""
        if self.reason is None and self._open:
            self._start(self._open)
            self._open = ""
        text = await self._release(wait=True)
        if self.reason is None:
            return text
        return text + self._keep(line_for(self.reason))

    def answer(self) -> str:
        return "".join(self._sent).strip()

    def close(self) -> None:
        """Stops the checks still running, for a turn that ends before it is finished."""
        for block in self._queue:
            block.check.cancel()
        self._queue = []
        self._open = ""

    def _start(self, block: str) -> None:
        check = asyncio.create_task(self._check(block, self._written))
        self._queue.append(_Block(block, check))
        self._written += block

    async def _release(self, *, wait: bool) -> str:
        out: list[str] = []
        while (
            self._queue
            and self.reason is None
            and (wait or self._queue[0].check.done())
        ):
            head = self._queue.pop(0)
            reason = await head.check
            if reason is None:
                out.append(self._keep(head.text))
            else:
                self.reason = reason
                self.close()
        return "".join(out)

    async def _check(self, block: str, before: str) -> str | None:
        async with self._room:
            return await reason_not_to_send(block.strip(), self._said, before)

    def _keep(self, text: str) -> str:
        self._sent.append(text)
        return text


def _sentences(text: str) -> list[str]:
    return [piece.strip() for piece in _SENTENCE_END.split(text)]


def _completed(text: str) -> list[str]:
    """The blocks the text already holds whole: each ends at a blank line, or,
    when it has grown past MAX_BLOCK, at a sentence end. The rest is still
    being written."""
    blocks, start = [], 0
    while True:
        blank = _BLANK_LINE.search(text, start)
        stop = blank.end() if blank else None
        if stop is None and len(text) - start >= MAX_BLOCK:
            stop = _cut(text, start)
        if stop is None and len(text) - start >= HARD_BLOCK:
            stop = start + HARD_BLOCK
        if stop is None:
            return blocks
        blocks.append(text[start:stop])
        start = stop


def _cut(text: str, start: int) -> int | None:
    """The end of the last whole sentence in the text from start, if it has one."""
    ends = [
        end.end()
        for end in _SENTENCE_END.finditer(text, start)
        if end.end() < len(text)
    ]
    return ends[-1] if ends else None


async def safe_ones(texts: list[str], said: Said) -> list[str]:
    """The texts, such as suggested questions, that may be shown."""
    reasons = await asyncio.gather(*(reason_not_to_send(text, said) for text in texts))
    return [text for text, reason in zip(texts, reasons, strict=True) if reason is None]
