"""A read-only report of how the web voice lessons' turns are doing, to compare any later change with.

    uv run python scripts/voice/turn_baseline.py production --release f2234ae
    uv run python scripts/voice/turn_baseline.py staging --since 2026-10-06 --until 2026-10-13 --logs tail.json

Reads one D1 database with SELECT statements only (through wrangler's own login) and prints counts and times:
turns by state, by day, by provider, by verdict and heard kind; recognition time; how often the safety rule
answered a need. With `--logs` (a `wrangler tail --format json` capture or a Workers Logs export of the API and the
tutor), also the time from recording to reply by turn id, per part, and the rule activations the logs show.
The output holds no transcript, no audio, no learner and no line a child said: the queries select counts and
times, and the safety count compares the teacher's own line with the authored ones.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from d1_select import Reader, wrangler_reader
from stage_logs import spread, summarize_files

DATABASES = {"production": "graspy", "staging": "graspy-staging"}
PHRASEBOOK = Path(__file__).resolve().parents[4] / "content" / "teacher-phrasebook.json"
LATENCY_CAP = 200_000


FAR_FUTURE_MS = 4_102_444_800_000


def start_ms(day: date | None, default: int) -> int:
    """Midnight UTC of the day in milliseconds, or `default` where no day was given."""
    if day is None:
        return default
    return int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp() * 1000)


def _sql_text(line: str) -> str:
    return "'" + line.replace("'", "''") + "'"


def authored_lines(key: str) -> list[str]:
    """The teacher's own lines of one kind in the phrasebook: the only text the safety count compares with."""
    return json.loads(PHRASEBOOK.read_text())[key]


def _in(column: str, lines: list[str]) -> str:
    return f"{column} IN ({', '.join(_sql_text(line) for line in lines)})"


def collect(read: Reader, since_ms: int, until_ms: int) -> dict:
    """Every count and time in the report, from one database, for turns last updated in [since_ms, until_ms)."""

    def within(column: str = "updated_at") -> str:
        return f"{column} >= {int(since_ms)} AND {column} < {int(until_ms)}"

    span = within()
    needs_help = authored_lines("needs_help")
    needs_grownup = authored_lines("needs_grownup")
    return {
        "states": {
            r["state"]: r["n"]
            for r in read(
                f"SELECT state, COUNT(*) AS n FROM tutoring_turns WHERE {span} GROUP BY state"
            )
        },
        "days": read(
            "SELECT strftime('%Y-%m-%d', updated_at / 1000, 'unixepoch') AS day, COUNT(*) AS turns, "
            f"SUM(state = 'failed') AS failed FROM tutoring_turns WHERE {span} GROUP BY day ORDER BY day"
        ),
        "learners": read(
            "SELECT COUNT(DISTINCT s.owner_id) AS n FROM tutoring_turns t JOIN samples s ON s.id = t.sample_id "
            f"WHERE {within('t.updated_at')}"
        )[0]["n"],
        "verdicts": read(
            "SELECT COALESCE(verdict, 'none') AS verdict, COALESCE(heard_kind, 'none') AS heard_kind, "
            f"COUNT(*) AS n FROM tutoring_turns WHERE state = 'complete' AND {span} "
            "GROUP BY verdict, heard_kind ORDER BY n DESC"
        ),
        "providers": read(
            "SELECT COALESCE(provider, 'none') AS provider, COUNT(*) AS n FROM tutoring_turns "
            f"WHERE state = 'complete' AND {span} GROUP BY provider ORDER BY n DESC"
        ),
        "recognition_ms": [
            r["latency_ms"]
            for r in read(
                "SELECT latency_ms FROM tutoring_turns WHERE state = 'complete' "
                f"AND {span} ORDER BY latency_ms LIMIT {LATENCY_CAP}"
            )
        ],
        "needs": read(
            f"SELECT COALESCE(SUM({_in('feedback', needs_help)}), 0) AS needs_help, "
            f"COALESCE(SUM({_in('feedback', needs_grownup)}), 0) AS needs_grownup "
            f"FROM tutoring_turns WHERE state = 'complete' AND {span}"
        )[0],
    }


def _table(head: list[str], rows: list[list]) -> list[str]:
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    return lines + ["| " + " | ".join(str(cell) for cell in row) + " |" for row in rows]


def _share(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f} %" if whole else "-"


def _times(label: str, stats: dict) -> list:
    if not stats["n"]:
        return [label, 0, "-", "-", "-"]
    return [label, stats["n"], stats["median"], stats["p90"], stats["max"]]


def render(data: dict, logs: dict | None, header: dict) -> str:
    states = data["states"]
    total = sum(states.values())
    complete = states.get("complete", 0)
    out = [
        f"# Voice turns: {header['environment']}",
        "",
        f"- Database: `{header['database']}`, read-only (SELECT only)",
        f"- Turns last updated: {header['since']} to {header['until']} (UTC)",
        f"- Release: {header['release']}",
        f"- Taken: {header['taken']}",
        "",
        "## Turns",
        "",
        *_table(
            ["Turns", "Complete", "Failed", "Processing", "Failed share", "Learners"],
            [
                [
                    total,
                    complete,
                    states.get("failed", 0),
                    states.get("processing", 0),
                    _share(states.get("failed", 0), total),
                    data["learners"],
                ]
            ],
        ),
        "",
        *_table(
            ["Day (UTC)", "Turns", "Failed"],
            [[d["day"], d["turns"], d["failed"]] for d in data["days"]],
        ),
        "",
        "## What each completed turn was marked",
        "",
        "Verdict and heard kind are empty for turns from before migration 0020. An `unheard` verdict is no try.",
        "",
        *_table(
            ["Verdict", "Heard kind", "Turns", "Share of complete"],
            [
                [r["verdict"], r["heard_kind"], r["n"], _share(r["n"], complete)]
                for r in data["verdicts"]
            ],
        ),
        "",
        "## Recognition",
        "",
        *_table(
            ["Recognizer", "Turns"],
            [[r["provider"], r["n"]] for r in data["providers"]],
        ),
        "",
        *_table(
            ["Time (ms)", "Turns", "Median", "p90", "Max"],
            [_times("Recognition, from the database", spread(data["recognition_ms"]))],
        ),
        "",
        "## Safety rule",
        "",
        "Completed turns whose reply is one of the authored need lines (a line the phrasebook held when the turn ran).",
        "",
        *_table(
            ["Needs help (toilet, water)", "Needs a grown-up"],
            [[data["needs"]["needs_help"], data["needs"]["needs_grownup"]]],
        ),
        "",
        "## Time from recording to reply, from the logs",
        "",
    ]
    out += _render_logs(logs)
    return "\n".join(out) + "\n"


def _render_logs(logs: dict | None) -> list[str]:
    if logs is None:
        return [
            "Not read: no `--logs` given. Stage times are in the Workers' logs only, not in the database."
        ]
    rule = (
        ", ".join(f"{action}: {n}" for action, n in logs["rule_activations"].items())
        or "none logged"
    )
    return [
        f"Turns seen in the logs: {logs['turns_in_logs']}. Whole turn = fetch_audio + detect_language + transcribe + teach.",
        "",
        *_table(
            ["Time (ms)", "Lines", "Median", "p90", "Max"],
            [_times("Whole turn", logs["whole_turn_ms"])]
            + [_times(part, stats) for part, stats in logs["parts"].items()],
        ),
        "",
        f"Rule activations logged (only where the observer shadows): {rule}.",
    ]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("environment", choices=sorted(DATABASES))
    parser.add_argument(
        "--since",
        type=date.fromisoformat,
        help="first day, UTC; default the first turn",
    )
    parser.add_argument(
        "--until", type=date.fromisoformat, help="day after the last, UTC; default now"
    )
    parser.add_argument(
        "--logs", type=Path, nargs="*", default=[], help="tail or export files"
    )
    parser.add_argument(
        "--release",
        default="unstated",
        help="the commit or release the numbers belong to",
    )
    parser.add_argument("--out", type=Path, help="also write the report here")
    return parser.parse_args(argv)


def main(argv: list[str]) -> None:
    args = parse_args(argv)
    database = DATABASES[args.environment]
    data = collect(
        wrangler_reader(database),
        start_ms(args.since, 0),
        start_ms(args.until, FAR_FUTURE_MS),
    )
    report = render(
        data,
        summarize_files(args.logs) if args.logs else None,
        {
            "environment": args.environment,
            "database": database,
            "since": args.since or "the first turn",
            "until": args.until or "now",
            "release": args.release,
            "taken": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        },
    )
    print(report, end="")
    if args.out:
        args.out.write_text(report)


if __name__ == "__main__":
    main(sys.argv[1:])
