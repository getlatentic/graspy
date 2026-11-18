"""The tables of a grounded against ungrounded study: each criterion's mean per arm, the difference per topic with
a sign test, failures counted, how far the judge agrees with itself, and where a reading by hand differs."""

from __future__ import annotations

import json
import statistics
from collections import defaultdict
from math import comb
from pathlib import Path

CRITERIA = ("coverage", "correctness", "level_fit", "teachable", "no_invention")
ARMS = ("grounded", "ungrounded")
# How far apart two scores of one lesson may be and still count as agreeing.
AGREE_WITHIN = 1


def sign_test(wins: int, losses: int) -> float:
    """Two-sided exact p; ties are left out."""
    n = wins + losses
    if n == 0:
        return 1.0
    tail = sum(comb(n, k) for k in range(min(wins, losses) + 1)) / 2**n
    return min(1.0, 2 * tail)


def per_lesson(results: list[dict]) -> dict[str, dict[str, float]]:
    """Each lesson's criteria averaged over its repeats, with the share of objectives taught and the counts of
    wrong items and invented claims."""
    by_id: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        if not r["error"]:
            by_id[r["id"]].append(r)
    scored = {}
    for lesson, rs in by_id.items():
        scored[lesson] = {c: statistics.mean(r[c] for r in rs) for c in CRITERIA} | {
            "taught": statistics.mean(
                len({n for n in r["objectives_taught"] if 1 <= n <= r["objectives"]})
                / r["objectives"]
                for r in rs
            ),
            "wrong": statistics.mean(bool(r["wrong_items"]) for r in rs),
            "invented": statistics.mean(bool(r["invented_claims"]) for r in rs),
        }
    return scored


def agreement(results: list[dict]) -> float:
    """The share of a lesson's repeated scores within AGREE_WITHIN of each other, over every criterion."""
    by_id: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        if not r["error"]:
            by_id[r["id"]].append(r)
    close = total = 0
    for rs in by_id.values():
        for c in CRITERIA:
            values = [r[c] for r in rs]
            total += 1
            close += max(values) - min(values) <= AGREE_WITHIN
    return close / total


def by_topic(
    scored: dict[str, dict], key: dict[str, dict]
) -> dict[str, dict[str, dict]]:
    """topic -> arm -> the mean of the criteria over the topic's draws."""
    grouped: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for lesson, values in scored.items():
        grouped[key[lesson]["topic"]][key[lesson]["arm"]].append(values)
    return {
        topic: {
            arm: {m: statistics.mean(v[m] for v in lessons) for m in lessons[0]}
            for arm, lessons in arms.items()
        }
        for topic, arms in grouped.items()
    }


def _row(name: str, topics: dict[str, dict[str, dict]], metric: str) -> str:
    paired = [t for t in topics.values() if set(ARMS) <= set(t)]
    means = [statistics.mean(t[a][metric] for t in paired) for a in ARMS]
    diffs = [t["grounded"][metric] - t["ungrounded"][metric] for t in paired]
    wins, losses = sum(d > 0 for d in diffs), sum(d < 0 for d in diffs)
    return (
        f"{name:<13}{means[0]:>9.2f}{means[1]:>11.2f}{statistics.mean(diffs):>+9.2f}"
        f"{wins:>6}{losses:>7}{len(diffs) - wins - losses:>6}{sign_test(wins, losses):>9.3f}"
    )


def _counts(scored: dict[str, dict], key: dict[str, dict]) -> list[str]:
    lines = []
    for metric, label in (
        ("wrong", "lessons with a wrong item"),
        ("invented", "lessons with an invented claim"),
    ):
        shares = {
            a: [v[metric] for k, v in scored.items() if key[k]["arm"] == a]
            for a in ARMS
        }
        lines.append(
            f"{label}: "
            + ", ".join(f"{a} {sum(s):.1f} of {len(s)}" for a, s in shares.items())
        )
    return lines


def compare_with_hand(scored: dict, hand: dict, key: dict) -> list[str]:
    """Per criterion, the mean hand score minus the mean judge score on the lessons read by hand, and how often
    the two are within one point."""
    lines = [
        f"{'criterion':<13}{'hand':>6}{'judge':>7}{'hand-judge':>12}{'within 1':>10}"
    ]
    for c in CRITERIA:
        ids = [i for i in hand if i in scored]
        h = [hand[i][c] for i in ids]
        j = [scored[i][c] for i in ids]
        close = sum(abs(a - b) <= 1 for a, b in zip(h, j, strict=True))
        lines.append(
            f"{c:<13}{statistics.mean(h):>6.2f}{statistics.mean(j):>7.2f}"
            f"{statistics.mean(h) - statistics.mean(j):>+12.2f}{close:>7}/{len(ids)}"
        )
    for arm in ARMS:
        ids = [i for i in hand if i in scored and key[i]["arm"] == arm]
        for c in ("coverage", "correctness"):
            lines.append(
                f"  {arm:<11} {c:<12} hand {statistics.mean(hand[i][c] for i in ids):.2f}"
                f"  judge {statistics.mean(scored[i][c] for i in ids):.2f}  (n={len(ids)})"
            )
    return lines


def report(judged: Path, hand: Path | None, hand_key: Path | None) -> None:
    data = json.loads(judged.read_text())
    key, results = data["key"], data["results"]
    scored = per_lesson(results)
    failed = sum(1 for r in results if r["error"])
    topics = by_topic(scored, key)
    print(
        f"lessons judged: {len(scored)}  judge calls failed: {failed} of {len(results)}"
    )
    print(
        f"judge agrees with itself (within {AGREE_WITHIN} point over 3 repeats): {agreement(results):.0%}\n"
    )
    print(
        f"{'':<13}{'grounded':>9}{'ungrounded':>11}{'diff':>9}{'wins':>6}{'losses':>7}{'ties':>6}{'p':>9}"
    )
    for name in (*CRITERIA, "taught"):
        print(_row("objectives%" if name == "taught" else name, topics, name))
    print("\n".join(_counts(scored, key)))
    if hand and hand_key:
        hand_scores = json.loads(hand.read_text())
        print("\nBy hand against the judge, on the lessons read by hand:")
        print(
            "\n".join(
                compare_with_hand(scored, hand_scores, json.loads(hand_key.read_text()))
            )
        )
