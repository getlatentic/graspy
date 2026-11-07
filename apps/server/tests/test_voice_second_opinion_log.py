"""The second opinion is logged with what it cost and whether it rescued the answer, never with a word the child said."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.voice.exercises import SpokenAnswerExercise
from app.voice.speech import nova_asr, whisper_asr
from app.voice.speech.second_opinion import wants_a_second_opinion
from app.voice.speech.whisper_asr import transcribe_english

CHILD_WORDS = "chainsaw"


class Ai:
    def __init__(self, nova_text=CHILD_WORDS, whisper_text=CHILD_WORDS, delay=0.0):
        self.nova_text, self.whisper_text, self.delay = nova_text, whisper_text, delay

    async def run(self, model, inputs):
        await asyncio.sleep(self.delay)
        if model == nova_asr.NOVA_MODEL:
            return {
                "results": {
                    "channels": [{"alternatives": [{"transcript": self.nova_text}]}]
                }
            }
        return {"text": self.whisper_text}


def intron(answer, delay=0.0):
    async def ask(audio, language, api_key, file_name, hedge=True):
        await asyncio.sleep(delay)
        if isinstance(answer, Exception):
            raise answer
        return answer, 900

    return ask


def wanted(text):
    return wants_a_second_opinion(SpokenAnswerExercise("p", "m", ("ten", "10")), text)


@pytest.fixture(autouse=True)
def no_browser_runtime(monkeypatch):
    monkeypatch.setattr(nova_asr, "nova_request", lambda audio: {"audio": audio})


async def turn(capsys, asr, ask, ai=None):
    env = SimpleNamespace(AI=ai or Ai(), ENGLISH_ASR=asr)
    await transcribe_english(env, b"a", "key", "s.wav", ask, wanted)
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    return next(line for line in lines if line["asr"] == "second_opinion"), lines


@pytest.mark.asyncio
@pytest.mark.parametrize("asr", ["nova", "whisper"])
async def test_a_rescue_is_logged_with_the_first_recognizer_and_the_ask_alone_timed(
    capsys, asr
):
    line, _ = await turn(capsys, asr, intron("10.", delay=0.05))
    assert (line["first"], line["outcome"], line["used"]) == (asr, "rescued", True)
    assert 40 <= line["ask_ms"] < 2000


@pytest.mark.asyncio
async def test_the_ask_is_timed_without_the_first_recognizer(capsys):
    line, _ = await turn(capsys, "nova", intron("10.", delay=0.05), Ai(delay=0.3))
    assert line["first_ms"] >= 300
    assert line["ask_ms"] < 280


@pytest.mark.asyncio
async def test_a_second_opinion_that_changed_nothing_is_logged_as_that(capsys):
    line, _ = await turn(capsys, "nova", intron("Chinsa"))
    assert (line["outcome"], line["used"]) == ("no_number", False)


@pytest.mark.asyncio
async def test_a_second_opinion_given_up_on_and_one_that_failed_are_told_apart(
    capsys, monkeypatch
):
    monkeypatch.setattr(whisper_asr, "SECOND_OPINION_SECONDS", 0.01)
    line, _ = await turn(capsys, "nova", intron("10.", delay=1))
    assert (line["outcome"], line["used"]) == ("timeout", False)
    assert line["ask_ms"] < 900
    line, _ = await turn(capsys, "nova", intron(RuntimeError("HTTP 429")))
    assert (line["outcome"], line["used"]) == ("failed", False)


@pytest.mark.asyncio
async def test_a_timeout_of_introns_own_client_is_a_failure_not_the_deadline(capsys):
    line, _ = await turn(capsys, "nova", intron(TimeoutError("read timed out")))
    assert (line["outcome"], line["used"]) == ("failed", False)


@pytest.mark.asyncio
async def test_the_log_holds_no_word_the_child_said(capsys):
    _, lines = await turn(capsys, "nova", intron("10."))
    assert CHILD_WORDS not in json.dumps(lines)
    assert "10." not in json.dumps(lines)
