"""The tables of a judged stage-writing comparison: wins, ties and losses of
the later run against the earlier, overall and per dimension, the mean 1 to
5 scores of each run, and how far the judge agrees with itself.

A pair is judged in both orders, A = before and A = after. A win or a loss
counts only when both orders agree; a disagreement is a tie, so a judge
that always prefers A, or always B, scores nothing but ties."""

from __future__ import annotations

import statistics
from collections import defaultdict
from itertools import groupby

DIMENSIONS = ("age_fit", "clarity", "scaffolding", "correctness", "local_relevance")
Orders = dict[str, dict]


def _pairs(records: list[dict], repeat: int) -> dict[str, Orders]:
    """Each pair's two orders, by the run in A; a pair with a failed call is
    left out, and counted."""
    pairs: dict[str, Orders] = defaultdict(dict)
    for r in records:
        if r["repeat"] == repeat:
            pairs[f"{r['source']}/{r['learner']}/{r['draw']}/{r['task']}"][
                r["a_is"]
            ] = r
    return {
        key: orders
        for key, orders in pairs.items()
        if len(orders) == 2 and not any(o["error"] for o in orders.values())
    }


def _agreed(signs: list[int]) -> str:
    if all(s > 0 for s in signs):
        return "win"
    if all(s < 0 for s in signs):
        return "loss"
    return "tie"


def overall(orders: Orders) -> str:
    """The later run's result: "win", "tie" or "loss"."""
    preferred = [o["preferred"] for o in orders.values()]
    return _agreed([{"after": 1, "before": -1, "tie": 0}[p] for p in preferred])


def on(orders: Orders, dimension: str) -> str:
    return _agreed(
        [
            o["scores"]["after"][dimension] - o["scores"]["before"][dimension]
            for o in orders.values()
        ]
    )


def score(orders: Orders, arm: str, dimension: str) -> float:
    """Its mean over both orders."""
    return statistics.fmean(o["scores"][arm][dimension] for o in orders.values())


def _count(results: list[str]) -> str:
    return "/".join(str(results.count(r)) for r in ("win", "tie", "loss"))


def _spread(values: list[float]) -> str:
    sd = statistics.stdev(values) if len(values) > 1 else 0.0
    return f"{statistics.fmean(values):.2f} ± {sd:.2f}"


def _groups(pairs: dict[str, Orders]):
    def group(key: str) -> tuple[str, str]:
        orders = pairs[key]
        first = next(iter(orders.values()))
        return first["learner"], first["kind"]

    ordered = sorted(
        pairs, key=lambda key: (_LEARNERS.get(group(key)[0], 9), group(key))
    )
    for (learner, kind), keys in groupby(ordered, key=group):
        yield learner, kind, [pairs[key] for key in keys]


_LEARNERS = {"Primary 2": 0, "Primary 5": 1, "JSS 1": 2, "SS 2": 3, "Unknown": 4}


def results_table(pairs: dict[str, Orders]) -> None:
    columns = ["Overall", *DIMENSIONS]
    print("After against before: wins/ties/losses (both orders must agree)\n")
    print("| Learner | Judged | Pairs | " + " | ".join(columns) + " |")
    print("|---" * (len(columns) + 3) + "|")
    for learner, kind, group in _groups(pairs):
        cells = [_count([overall(o) for o in group])]
        cells += [_count([on(o, d) for o in group]) for d in DIMENSIONS]
        print(f"| {learner} | {kind} | {len(group)} | " + " | ".join(cells) + " |")


def scores_table(pairs: dict[str, Orders]) -> None:
    print("\nMean score, 1 to 5 (mean ± sd over pairs): before → after\n")
    print("| Learner | Judged | " + " | ".join(DIMENSIONS) + " |")
    print("|---" * (len(DIMENSIONS) + 2) + "|")
    for learner, kind, group in _groups(pairs):
        cells = [
            f"{_spread([score(o, 'before', d) for o in group])} → "
            f"{_spread([score(o, 'after', d) for o in group])}"
            for d in DIMENSIONS
        ]
        print(f"| {learner} | {kind} | " + " | ".join(cells) + " |")


def self_agreement(records: list[dict]) -> None:
    """The pairs judged three more times: how often every repeat gave the
    same verdict, and how far a score moved between repeats."""
    repeats = [_pairs(records, n) for n in (1, 2, 3)]
    keys = set.intersection(*(set(r) for r in repeats))
    if not keys:
        return
    same = sum(len({overall(r[key]) for r in repeats}) == 1 for key in keys)
    calls = [(key, arm) for key in keys for arm in ("before", "after")]
    same_calls = sum(
        len({r[key][arm]["preferred"] for r in repeats}) == 1 for key, arm in calls
    )
    moves = [
        max(values) - min(values)
        for key, arm in calls
        for side in ("before", "after")
        for d in DIMENSIONS
        for values in [[r[key][arm]["scores"][side][d] for r in repeats]]
    ]
    print(
        f"\nJudge self-agreement over 3 repeats of {len(keys)} pairs: "
        f"same verdict for {same}/{len(keys)} pairs; same preference in "
        f"{same_calls}/{len(calls)} single calls; a score moved in "
        f"{sum(m > 0 for m in moves)}/{len(moves)} scores, at most by "
        f"{max(moves)}."
    )


def before_preferred(pairs: dict[str, Orders], limit: int = 3) -> None:
    losses = [o for o in pairs.values() if overall(o) == "loss"]
    print(f"\nPairs where the judge preferred before: {len(losses)}")
    for orders in losses[:limit]:
        first = orders["before"]
        print(f"- {first['learner']}, draw {first['draw']}, {first['kind']}: ")
        print(f"  {' '.join(first['reason'].split())}")


def report(records: list[dict]) -> None:
    pairs = _pairs(records, 0)
    failed = len(
        {
            (r["source"], r["learner"], r["draw"], r["task"])
            for r in records
            if r["error"]
        }
    )
    results_table(pairs)
    scores_table(pairs)
    self_agreement(records)
    before_preferred(pairs)
    print(f"\nPairs left out for a failed judge call: {failed}")
