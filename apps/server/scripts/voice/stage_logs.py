"""Latency by turn, and safety-rule activations, from the Workers' log lines.

The lines are `{"turn": <last six characters of the sample id>, "part": ..., "ms": ...}` from the API and the
tutor, and `{"part": "observer-shadow", "decidedBy": ..., "taken": ...}` from the tutor. Only part names, actions
and times are read; the lines that may hold a child's words are never copied into the report.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

# The API's own stages, one after another in a turn: their sum is what the child waited. The tutor's parts run
# inside "teach", so they are listed beside it and never added to it.
API_STAGES = ("fetch_audio", "detect_language", "transcribe", "teach")


def json_values(text: str):
    """Every JSON object in text that holds them one after another, as `wrangler tail` leaves them, or one to a line."""
    decoder, at = json.JSONDecoder(), 0
    while (at := text.find("{", at)) >= 0:
        try:
            value, at = decoder.raw_decode(text, at)
        except ValueError:
            at += 1
            continue
        yield value


def log_lines(text: str) -> list[dict]:
    """The log lines in a tail or an export: bare lines, or the `message`s of tail events' logs."""
    found: list[dict] = []
    for value in json_values(text):
        logs = value.get("logs") if isinstance(value, dict) else None
        if not isinstance(logs, list):
            found.append(value)
            continue
        for log in logs:
            for message in (log or {}).get("message", []):
                if isinstance(message, str):
                    found.extend(json_values(message))
    return [line for line in found if isinstance(line, dict) and "part" in line]


def quantile(sorted_values: list[int], p: float) -> int:
    return sorted_values[min(len(sorted_values) - 1, int(len(sorted_values) * p))]


def spread(values: list[int]) -> dict:
    """Count, median, p90 and max, or just a zero count where there are none."""
    if not values:
        return {"n": 0}
    ordered = sorted(values)
    return {
        "n": len(ordered),
        "median": round(statistics.median(ordered)),
        "p90": quantile(ordered, 0.9),
        "max": ordered[-1],
    }


def _timed(lines: list[dict]) -> list[dict]:
    return [
        line
        for line in lines
        if isinstance(line.get("turn"), str)
        and isinstance(line.get("part"), str)
        and isinstance(line.get("ms"), int | float)
    ]


def summarize(lines: list[dict]) -> dict:
    """Per-part times, whole-turn times where a turn shows every API stage it passed through, and how often the
    safety rule answered a need."""
    timed = _timed(lines)
    by_part: dict[str, list[int]] = defaultdict(list)
    by_turn: dict[str, dict[str, int]] = defaultdict(dict)
    for line in timed:
        by_part[line["part"]].append(round(line["ms"]))
        if line["part"] in API_STAGES:
            by_turn[line["turn"]][line["part"]] = round(line["ms"])
    whole = [
        sum(stages.values())
        for stages in by_turn.values()
        if "transcribe" in stages and "teach" in stages
    ]
    rule = Counter(
        str(line.get("taken"))
        for line in lines
        if line.get("part") == "observer-shadow" and line.get("decidedBy") == "rule"
    )
    return {
        "turns_in_logs": len(by_turn),
        "whole_turn_ms": spread(whole),
        "parts": {part: spread(values) for part, values in sorted(by_part.items())},
        "rule_activations": dict(sorted(rule.items())),
    }


def summarize_files(paths: list[Path]) -> dict:
    return summarize([line for path in paths for line in log_lines(path.read_text())])
