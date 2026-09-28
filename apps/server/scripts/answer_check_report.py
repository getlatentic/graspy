"""The table of an answer-check measurement: what the checks found in the
first drafts, what they did about it, and what the finished lessons show,
checked again. Then every repair, to be read for a false positive."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable

from app.domains.lesson.answers.verdict import Found, verdict

HEADING = (
    "| Class | Language | Lessons (whole) | Checks written | Computable | "
    "Right as written | Wrong key: re-marked | No right option: rewritten / "
    "taken out | Double right: trimmed / rewritten / taken out | Written again | "
    "Shown wrong after | Checks taken out |"
)


def _shown(lesson: dict) -> Iterable[tuple[str, list[str], int]]:
    for slide in lesson["slides"]:
        check = slide["assessment"]
        if check:
            yield check["prompt"], check["options"], check["answerIndex"]
    practice = lesson.get("practice")
    if practice:
        yield practice["question"], practice["options"], practice["answerIndex"]


def _after(done: list[dict]) -> tuple[int, int]:
    """Checks a learner is shown that the checks still find wrong, and slides
    shown without a check."""
    wrong = sum(
        verdict(*shown).found
        in (Found.WRONG_KEY, Found.NO_RIGHT_OPTION, Found.DOUBLE_RIGHT)
        for record in done
        for shown in _shown(record["lesson_wire"])
    )
    bare = sum(
        slide["assessment"] is None
        for record in done
        for slide in record["lesson_wire"]["slides"]
    )
    return wrong, bare


def _row(name: str, language: str, records: list[dict]) -> str:
    done = [r for r in records if not r["error"]]
    checks = [check for r in done for check in r["checks"]]
    by = Counter((check["found"], check["outcome"]) for check in checks)
    found = Counter(check["found"] for check in checks)
    wrong, bare = _after(done)
    cells = [
        name,
        language,
        f"{len(done)} ({sum(r['complete'] for r in done)})",
        str(len(checks)),
        str(len(checks) - found["not computable"]),
        str(found["right"]),
        f"{found['wrong key']}: {by['wrong key', 'rekeyed']}",
        (
            f"{found['no right option']}: {by['no right option', 'rewritten']} / "
            f"{by['no right option', 'dropped']}"
        ),
        (
            f"{found['double right']}: {by['double right', 'trimmed']} / "
            f"{by['double right', 'rewritten']} / {by['double right', 'dropped']}"
        ),
        str(sum(check["asked_again"] for check in checks)),
        str(wrong),
        str(bare),
    ]
    failed = len(records) - len(done)
    return (
        "| " + " | ".join(cells) + " |" + (f" {failed} draws failed" if failed else "")
    )


def _option_list(check: dict | None) -> str:
    if check is None:
        return "taken out"
    marked = [
        f"[{option}]" if at == check["answer_index"] else option
        for at, option in enumerate(check["options"])
    ]
    return " / ".join(marked)


def _changed(name: str, before: dict, after: dict | None) -> str:
    was = before[name]
    now = after[name] if after else was
    return f"{was!r}" + (f" -> {now!r}" if now != was else "")


def _finding(record: dict, check: dict) -> str:
    before, after = check["before"], check["after"]
    part = check["where"].split(" of ")[0]
    again = f" (rewrite: {check['rewrite_found']})" if check["asked_again"] else ""
    lines = [
        (
            f"- {record['class']} {record['language']} {record['topic']!r} draw "
            f"{record['draw']}, {part} ({check['worked']}): {check['found']} -> "
            f"{check['outcome']}{again}"
        ),
        f"  Q: {before['question']}",
        f"  before: {_option_list(before)}",
        f"  after:  {_option_list(after)}",
        f"  right feedback: {_changed('correct_feedback', before, after)}",
        f"  wrong feedback: {_changed('incorrect_feedback', before, after)}",
    ]
    if check["outcome"] == "rewritten":
        lines.append(f"  written again: {after['question']}")
    return "\n".join(lines)


def _findings(records: list[dict]) -> Iterable[str]:
    for record in records:
        for check in record.get("checks") or []:
            if check["outcome"] != "kept":
                yield _finding(record, check)


def _kinds(records: list[dict]) -> Counter:
    return Counter(
        check["worked"]
        for record in records
        for check in record.get("checks") or []
        if check["worked"]
    )


def report(runs: list[list[dict]]) -> None:
    records = [record for run in runs for record in run]
    print(HEADING)
    print("|---" * (HEADING.count("|") - 1) + "|")
    groups = sorted({(r["class"], r["language"]) for r in records})
    for name, language in groups:
        mine = [r for r in records if (r["class"], r["language"]) == (name, language)]
        print(_row(name, language, mine))
    print(_row("All", "all", records))
    print("\nComputable checks by kind:", dict(_kinds(records)))
    print("\nEvery repair:")
    for line in _findings(records):
        print(line)
