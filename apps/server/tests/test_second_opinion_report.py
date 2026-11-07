"""The report on Intron's second opinion reads tail events and bare lines and counts per 100 recordings."""

import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "second_opinion_report",
    Path(__file__).resolve().parents[1] / "scripts/second_opinion_report.py",
)
report_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report_module)


def opinion(first, outcome, ask_ms):
    return {
        "asr": "second_opinion",
        "first": first,
        "first_ms": 200,
        "ask_ms": ask_ms,
        "outcome": outcome,
        "used": outcome == "rescued",
    }


def tail_event(*lines):
    return json.dumps(
        {"outcome": "ok", "logs": [{"message": [json.dumps(line) for line in lines]}]},
        indent=4,
    )


def test_it_counts_per_100_recordings_and_what_a_limit_keeps():
    plain = [{"asr": "nova", "ms": 300}] * 96
    asked = [
        opinion("nova", "rescued", 900),
        opinion("nova", "rescued", 2600),
        opinion("nova", "no_number", 1500),
        opinion("nova", "timeout", 4000),
    ]
    text = tail_event(*plain[:50]) + "\n" + tail_event(*plain[50:], *asked)
    lines = report_module.asr_lines(text)
    assert len(lines) == 100
    out = report_module.report(lines)
    assert (
        "nova: 100 recordings | second opinion asked 4 (4.0 per 100) | rescued 2 (2.0 per 100)"
        in out
    )
    assert "no number 1 | timeout 1 | failed 0" in out
    assert "limit 1000 ms: keeps 1 of 2 rescues" in out
    assert (
        "limit 3000 ms: keeps 2 of 2 rescues; total wait 9000 ms over 4 asks" not in out
    )
    assert "limit 3000 ms: keeps 2 of 2 rescues; total wait 8000 ms over 4 asks" in out


def test_the_first_recognizers_are_kept_apart_and_nothing_prints_a_word():
    lines = [
        {"asr": "whisper", "ms": 1},
        opinion("whisper", "rescued", 800),
        {"asr": "nova", "ms": 1},
        {"transcript": "hello", "part": "other"},
    ]
    out = report_module.report(lines[:3])
    assert "whisper: 2 recordings" in out and "nova: 1 recordings" in out
    assert "hello" not in out


def test_it_says_so_where_there_is_nothing():
    assert report_module.report([]) == "no English recognition lines"
