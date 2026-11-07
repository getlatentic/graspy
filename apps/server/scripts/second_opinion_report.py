"""What Intron's second opinion is worth, from the tutor API's logs.

    npx wrangler tail graspy-web-api-staging --format json > tail.json   (or a Workers Logs export)
    uv run python scripts/second_opinion_report.py tail.json [more.json ...]

Counts the recordings a first recognizer heard (a recording that went straight to Intron, or that no first recognizer
answered, logs no line). Reads the English recognition lines `{"asr": "nova"|"whisper"|"intron_sync"}` and `{"asr": "second_opinion", "first",
"first_ms", "ask_ms", "outcome", "used"}`. Of every 100 English recordings: how many Intron was asked about, how many
it rescued (read a number the first recognizer had lost), what the asks cost in time, and what a shorter limit would
have kept. Prints counts and times only; the log holds no words."""

from __future__ import annotations

import json
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

FIRST_RECOGNIZERS = ("nova", "whisper", "intron_sync")
LIMITS_MS = (1000, 1500, 2000, 3000, 4000)


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


def asr_lines(text: str) -> list[dict]:
    """The recognition lines in a tail or an export: bare lines, or the `message`s of tail events' logs."""
    found: list[dict] = []

    def take(value) -> None:
        if isinstance(value, dict) and "asr" in value:
            found.append(value)

    for value in json_values(text):
        logs = value.get("logs") if isinstance(value, dict) else None
        if not isinstance(logs, list):
            take(value)
            continue
        for log in logs:
            for message in (log or {}).get("message", []):
                if isinstance(message, str):
                    for inner in json_values(message):
                        take(inner)
    return found


def _quantile(sorted_ms: list[int], p: float) -> int:
    return sorted_ms[min(len(sorted_ms) - 1, int(len(sorted_ms) * p))]


def _per_100(count: int, of: int) -> float:
    return round(100 * count / of, 1)


def report(lines: list[dict]) -> str:
    """Per first recognizer, the per-100 table and the effect of each limit on the rescues."""
    turns: Counter = Counter()
    asked: dict[str, list[dict]] = defaultdict(list)
    for line in lines:
        if line["asr"] == "second_opinion":
            first = line.get("first", "unknown")
            asked[first].append(line)
            # A second opinion that is used ends the recording's logging; one that is not is followed by the first recognizer's own line.
            if line.get("used"):
                turns[first] += 1
        elif line["asr"] in FIRST_RECOGNIZERS:
            turns[line["asr"]] += 1
    if not turns and not asked:
        return "no English recognition lines"
    out: list[str] = []
    for first in sorted(set(turns) | set(asked)):
        own = asked.get(first, [])
        n = turns[first] or 1
        outcomes = Counter(line.get("outcome", "unknown") for line in own)
        out.append(
            f"{first}: {n} recordings | second opinion asked {len(own)} ({_per_100(len(own), n)} per 100) | "
            f"rescued {outcomes['rescued']} ({_per_100(outcomes['rescued'], n)} per 100) | "
            f"no number {outcomes['no_number']} | timeout {outcomes['timeout']} | failed {outcomes['failed']}"
        )
        if own:
            ms = sorted(line.get("ask_ms") or 0 for line in own)
            out.append(
                f"    ask time: median {int(statistics.median(ms))} ms, p90 {_quantile(ms, 0.9)} ms, max {ms[-1]} ms"
            )
            rescued = [
                line.get("ask_ms") or 0
                for line in own
                if line.get("outcome") == "rescued"
            ]
            for limit in LIMITS_MS:
                kept = sum(ms_ <= limit for ms_ in rescued)
                waited = sum(min(line.get("ask_ms") or 0, limit) for line in own)
                out.append(
                    f"    limit {limit} ms: keeps {kept} of {len(rescued)} rescues; total wait {waited} ms over {len(own)} asks"
                )
    return "\n".join(out)


def main(paths: list[str]) -> None:
    if not paths:
        raise SystemExit("usage: second_opinion_report.py <tail.json> [more.json ...]")
    lines = [line for path in paths for line in asr_lines(Path(path).read_text())]
    print(report(lines))


if __name__ == "__main__":
    main(sys.argv[1:])
