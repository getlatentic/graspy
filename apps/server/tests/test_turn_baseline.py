"""The voice-turn baseline reads only counts and times, whatever the rows hold, and writes nothing."""

import importlib
import json
import sqlite3
import sys
from pathlib import Path

import pytest

VOICE_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts" / "voice"
sys.path.insert(0, str(VOICE_SCRIPTS))
baseline = importlib.import_module("turn_baseline")
d1_select = importlib.import_module("d1_select")
stage_logs = importlib.import_module("stage_logs")

HELP = baseline.authored_lines("needs_help")[0]
GROWNUP = baseline.authored_lines("needs_grownup")[0]
DAY = 86_400_000
T0 = 1_790_000_000_000


@pytest.fixture
def database():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE samples (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL);
        CREATE TABLE tutoring_turns (
            sample_id TEXT PRIMARY KEY, state TEXT, transcript TEXT, feedback TEXT, provider TEXT,
            latency_ms INTEGER, error_detail TEXT, updated_at INTEGER, verdict TEXT, heard_kind TEXT
        );
        """
    )
    return db


def add(
    db,
    sample,
    learner,
    at,
    state="complete",
    verdict=None,
    heard=None,
    feedback="fine",
    ms=500,
):
    db.execute("INSERT INTO samples VALUES (?, ?)", (sample, learner))
    db.execute(
        "INSERT INTO tutoring_turns VALUES (?, ?, 'SECRET WORDS', ?, 'nova', ?, 'SECRET ERROR', ?, ?, ?)",
        (sample, state, feedback, ms, at, verdict, heard),
    )


def reader(db):
    def read(sql):
        return [dict(row) for row in db.execute(d1_select.select_only(sql))]

    return read


def report(db, since=0, until=baseline.FAR_FUTURE_MS, logs=None):
    header = {
        "environment": "test",
        "database": "db",
        "since": "a",
        "until": "b",
        "release": "r",
        "taken": "t",
    }
    return baseline.render(baseline.collect(reader(db), since, until), logs, header)


def test_counts_by_state_verdict_heard_kind_and_safety(database):
    add(database, "a1", "kid1", T0, verdict="correct")
    add(database, "a2", "kid1", T0, verdict="unheard", heard="dont_know")
    add(
        database,
        "a3",
        "kid2",
        T0,
        verdict="unheard",
        heard="conversation",
        feedback=HELP,
    )
    add(
        database,
        "a4",
        "kid2",
        T0,
        verdict="unheard",
        heard="conversation",
        feedback=GROWNUP,
    )
    add(database, "a5", "kid3", T0, state="failed")
    data = baseline.collect(reader(database), 0, baseline.FAR_FUTURE_MS)
    assert data["states"] == {"complete": 4, "failed": 1}
    assert data["learners"] == 3
    assert {(r["verdict"], r["heard_kind"]): r["n"] for r in data["verdicts"]} == {
        ("correct", "none"): 1,
        ("unheard", "dont_know"): 1,
        ("unheard", "conversation"): 2,
    }
    assert data["needs"] == {"needs_help": 1, "needs_grownup": 1}
    assert "| 5 | 4 | 1 | 0 | 20.0 % | 3 |" in report(database)


def test_range_keeps_only_turns_last_updated_inside_it(database):
    add(database, "a1", "k", T0 - DAY)
    add(database, "a2", "k", T0)
    add(database, "a3", "k", T0 + DAY)
    assert baseline.collect(reader(database), T0, T0 + DAY)["states"] == {"complete": 1}


def test_recognition_times_are_the_columns_values(database):
    for index, ms in enumerate([100, 200, 300, 400, 5000]):
        add(database, f"a{index}", "k", T0, ms=ms)
    data = baseline.collect(reader(database), 0, baseline.FAR_FUTURE_MS)
    assert stage_logs.spread(data["recognition_ms"]) == {
        "n": 5,
        "median": 300,
        "p90": 5000,
        "max": 5000,
    }


def test_output_holds_no_words_learner_or_sample_ids(database):
    add(database, "sample-secret-1", "learner-secret-1", T0, state="failed")
    add(database, "sample-secret-2", "learner-secret-2", T0, feedback=HELP)
    text = report(database)
    for leaked in ("SECRET", "learner-secret", "sample-secret", HELP):
        assert leaked not in text


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM tutoring_turns",
        "UPDATE tutoring_turns SET state = 'x'",
        "SELECT 1; DROP TABLE samples",
        "INSERT INTO samples VALUES ('a', 'b')",
        "WITH x AS (SELECT 1) DELETE FROM samples",
    ],
)
def test_anything_but_one_select_is_refused(sql):
    with pytest.raises(ValueError):
        d1_select.select_only(sql)


def test_every_query_the_report_sends_is_one_select(database):
    sent = []

    def spy(sql):
        sent.append(sql)
        return reader(database)(sql)

    add(database, "a1", "k", T0)
    baseline.collect(spy, 0, baseline.FAR_FUTURE_MS)
    assert len(sent) == 7
    assert all(d1_select.select_only(sql) == sql.strip() for sql in sent)


def test_wrangler_output_after_its_banner_is_read():
    output = ' ⛅️ wrangler 4\n──\n[\n  {"results": [{"n": 3}], "success": true}\n]\n'
    assert d1_select.rows_of(output) == [{"n": 3}]
    with pytest.raises(RuntimeError):
        d1_select.rows_of('[\n  {"results": [], "success": false}\n]')


def line(turn, part, ms, **more):
    return json.dumps({"turn": turn, "part": part, "ms": ms, **more})


def test_stage_logs_give_whole_turns_parts_and_rule_activations():
    tail = "\n".join(
        [
            line("aaaaaa", "fetch_audio", 50),
            line("aaaaaa", "transcribe", 300),
            line("aaaaaa", "teach", 2000),
            line("aaaaaa", "mark", 1900),
            line("bbbbbb", "transcribe", 400),
            line("bbbbbb", "teach", 9000),
            line("cccccc", "transcribe", 400),
            json.dumps(
                {
                    "part": "observer-shadow",
                    "decidedBy": "rule",
                    "taken": "needs_help",
                    "heard": "SECRET",
                }
            ),
            json.dumps(
                {
                    "part": "observer-shadow",
                    "decidedBy": "router",
                    "taken": "answer_child",
                }
            ),
        ]
    )
    summary = stage_logs.summarize(stage_logs.log_lines(tail))
    assert summary["turns_in_logs"] == 3
    assert summary["whole_turn_ms"] == {
        "n": 2,
        "median": 5875,
        "p90": 9400,
        "max": 9400,
    }
    assert summary["parts"]["mark"]["n"] == 1
    assert summary["rule_activations"] == {"needs_help": 1}
    assert "SECRET" not in json.dumps(summary)


def test_tail_events_are_unwrapped():
    event = json.dumps({"logs": [{"message": [line("aaaaaa", "teach", 10)]}]})
    assert stage_logs.log_lines(event) == [
        {"turn": "aaaaaa", "part": "teach", "ms": 10}
    ]


def test_logs_section_says_when_it_was_not_read(database):
    assert "Not read" in report(database)
