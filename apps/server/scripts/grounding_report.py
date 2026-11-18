"""The tables of a grounded against ungrounded study: each criterion's mean per arm, the difference per topic with
a sign test, a signed-rank test and Holm's correction across the criteria, failures counted, how far the judge agrees
with itself, and where a second reader differs."""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from math import comb
from pathlib import Path

CRITERIA = ("coverage", "correctness", "level_fit", "teachable", "no_invention")
METRICS = (*CRITERIA, "taught")
ARMS = ("grounded", "ungrounded")
SCORES = range(1, 6)
# A lesson needs this many scores from the judge before it says anything of the judge's agreement with itself.
MIN_REPEATS = 2
# Differences closer than this are ties; they differ only by the float error of averaging.
TIE_BELOW = 1e-9


def sign_test(wins: int, losses: int) -> float:
    """Two-sided exact p; ties are left out."""
    n = wins + losses
    if n == 0:
        return 1.0
    tail = sum(comb(n, k) for k in range(min(wins, losses) + 1)) / 2**n
    return min(1.0, 2 * tail)


def signed_rank_test(diffs: list[float]) -> float:
    """Two-sided exact Wilcoxon p on the differences; ties between them get their average rank, zeros are left out.
    Ranks are doubled so the sums stay whole numbers."""
    nonzero = sorted((abs(d), d > 0) for d in diffs if abs(d) >= TIE_BELOW)
    if not nonzero:
        return 1.0
    doubled: list[int] = []
    first = 0
    while first < len(nonzero):
        last = first
        while (
            last + 1 < len(nonzero)
            and abs(nonzero[last + 1][0] - nonzero[first][0]) < TIE_BELOW
        ):
            last += 1
        doubled += [first + last + 2] * (last - first + 1)
        first = last + 1
    ways = Counter({0: 1})
    for rank in doubled:
        grown = Counter(ways)
        for total, n in ways.items():
            grown[total + rank] += n
        ways = grown
    observed = sum(r for r, (_, up) in zip(doubled, nonzero, strict=True) if up)
    every = 2 ** len(doubled)
    low = sum(n for total, n in ways.items() if total <= observed) / every
    high = sum(n for total, n in ways.items() if total >= observed) / every
    return min(1.0, 2 * min(low, high))


def holm(ps: list[float]) -> list[float]:
    """Holm's step-down adjustment, in the order given."""
    order = sorted(range(len(ps)), key=ps.__getitem__)
    adjusted = [0.0] * len(ps)
    running = 0.0
    for place, i in enumerate(order):
        running = max(running, min(1.0, (len(ps) - place) * ps[i]))
        adjusted[i] = running
    return adjusted


def _judgments(results: list[dict]) -> dict[str, list[dict]]:
    by_id: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        if not r["error"]:
            by_id[r["id"]].append(r)
    return by_id


def per_lesson(results: list[dict]) -> dict[str, dict[str, float]]:
    """Each lesson's criteria averaged over its repeats, with the share of objectives taught and the counts of
    wrong items and invented claims."""
    scored = {}
    for lesson, rs in _judgments(results).items():
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


def weighted_kappa(first: list[int], second: list[int]) -> float | None:
    """Quadratic weighted kappa of two lists of 1 to 5 scores; None where the scores never vary."""
    n = len(first)
    seen, a, b = (
        Counter(zip(first, second, strict=True)),
        Counter(first),
        Counter(second),
    )
    weight = lambda i, j: (i - j) ** 2
    observed = sum(weight(i, j) * seen[i, j] for i in SCORES for j in SCORES)
    expected = sum(weight(i, j) * a[i] * b[j] / n for i in SCORES for j in SCORES)
    return None if expected == 0 else 1 - observed / expected


def self_agreement(results: list[dict]) -> list[str]:
    """Per criterion, over the lessons with MIN_REPEATS scores or more: the share whose scores are all equal and the
    kappa of the first two scores. A judge at the top of the scale agrees with itself almost by default, so the kappa
    is the number to read."""
    kept = [rs for rs in _judgments(results).values() if len(rs) >= MIN_REPEATS]
    if not kept:
        return [f"judge against itself: no lesson has {MIN_REPEATS} scores"]
    lines = [f"judge against itself, {len(kept)} lessons with {MIN_REPEATS}+ repeats"]
    for c in CRITERIA:
        same = sum(len({r[c] for r in rs}) == 1 for rs in kept) / len(kept)
        kappa = weighted_kappa([rs[0][c] for rs in kept], [rs[1][c] for rs in kept])
        text = "no variation" if kappa is None else f"{kappa:.2f}"
        lines.append(f"  {c:<13} all repeats equal {same:.0%}   weighted kappa {text}")
    return lines


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


def _comparison(topics: dict[str, dict[str, dict]], metric: str) -> dict:
    paired = [t for t in topics.values() if set(ARMS) <= set(t)]
    diffs = [t["grounded"][metric] - t["ungrounded"][metric] for t in paired]
    wins = sum(d >= TIE_BELOW for d in diffs)
    losses = sum(d <= -TIE_BELOW for d in diffs)
    return {
        "means": [statistics.mean(t[a][metric] for t in paired) for a in ARMS],
        "diff": statistics.mean(diffs),
        "wins": wins,
        "losses": losses,
        "ties": len(diffs) - wins - losses,
        "sign": sign_test(wins, losses),
        "rank": signed_rank_test(diffs),
    }


def _table(topics: dict[str, dict[str, dict]]) -> list[str]:
    rows = {m: _comparison(topics, m) for m in METRICS}
    adjusted = holm([row["sign"] for row in rows.values()])
    lines = [
        (
            f"{'':<13}{'grounded':>9}{'ungrounded':>11}{'diff':>8}{'wins':>6}{'losses':>7}{'ties':>6}"
            f"{'sign p':>8}{'rank p':>8}{'Holm p':>8}"
        )
    ]
    for (metric, r), holm_p in zip(rows.items(), adjusted, strict=True):
        name = "objectives%" if metric == "taught" else metric
        lines.append(
            f"{name:<13}{r['means'][0]:>9.2f}{r['means'][1]:>11.2f}{r['diff']:>+8.2f}"
            f"{r['wins']:>6}{r['losses']:>7}{r['ties']:>6}"
            f"{r['sign']:>8.3f}{r['rank']:>8.3f}{holm_p:>8.3f}"
        )
    return lines


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


def compare_with_reader(
    scored: dict, reader: dict, key: dict, judged_key: dict
) -> list[str]:
    """Per criterion, the mean second-reader score minus the mean judge score on the lessons both scored, how often
    they give the same score and how often they are within one point."""
    lines = [
        f"{'criterion':<13}{'reader':>7}{'judge':>7}{'reader-judge':>13}{'same':>7}{'within 1':>10}"
    ]
    ids = [i for i in reader if i in scored]
    for i in ids:
        mine = {k: key[i][k] for k in ("arm", "topic", "draw")}
        theirs = {k: judged_key[i][k] for k in ("arm", "topic", "draw")}
        if mine != theirs:
            raise ValueError(f"{i} in the sample key is not the lesson judged as {i}")
    if not ids:
        return ["the reader scored none of the judged lessons"]
    for c in CRITERIA:
        r = [reader[i][c] for i in ids]
        j = [scored[i][c] for i in ids]
        same = sum(round(b) == a for a, b in zip(r, j, strict=True))
        close = sum(abs(a - b) <= 1 for a, b in zip(r, j, strict=True))
        lines.append(
            f"{c:<13}{statistics.mean(r):>7.2f}{statistics.mean(j):>7.2f}"
            f"{statistics.mean(r) - statistics.mean(j):>+13.2f}{same:>5}/{len(ids)}{close:>7}/{len(ids)}"
        )
    for arm in ARMS:
        of_arm = [i for i in ids if key[i]["arm"] == arm]
        if not of_arm:
            continue
        for c in ("coverage", "correctness"):
            lines.append(
                f"  {arm:<11} {c:<12} reader {statistics.mean(reader[i][c] for i in of_arm):.2f}"
                f"  judge {statistics.mean(scored[i][c] for i in of_arm):.2f}  (n={len(of_arm)})"
            )
    return lines


def _section(title: str, scored: dict[str, dict], key: dict[str, dict]) -> list[str]:
    topics = by_topic(scored, key)
    paired = sum(1 for t in topics.values() if set(ARMS) <= set(t))
    return [
        f"{title}: {len(scored)} lessons, {paired} of {len(topics)} topics with both arms",
        *_table(topics),
        *_counts(scored, key),
        "",
    ]


def report(judged: Path, reader: Path | None, reader_key: Path | None) -> None:
    data = json.loads(judged.read_text())
    key, results = data["key"], data["results"]
    scored = per_lesson(results)
    failed = sum(1 for r in results if r["error"])
    print(f"judge: {data['meta']}")
    print(
        f"lessons judged: {len(scored)}  judge calls failed: {failed} of {len(results)}"
    )
    for arm in ARMS:
        mine = [i for i in scored if key[i]["arm"] == arm]
        unfinished = sum(1 for i in mine if not key[i]["complete"])
        print(f"  {arm}: {len(mine)} lessons judged, {unfinished} unfinished")
    print("\n".join(self_agreement(results)), end="\n\n")
    finished = {i: v for i, v in scored.items() if key[i]["complete"]}
    print("\n".join(_section("All judged lessons", scored, key)))
    print("\n".join(_section("Finished lessons only", finished, key)))
    if reader and reader_key:
        print("Second reader against the judge, on the lessons the reader scored:")
        reads = json.loads(reader.read_text())
        shown = json.loads(reader_key.read_text())["lessons"]
        print("\n".join(compare_with_reader(scored, reads, shown, key)))
