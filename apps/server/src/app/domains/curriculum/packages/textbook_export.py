"""Derives, for each topic of a held course, the textbook passages a lesson on it is written from.

The textbook (apps/teacher/src-tauri/resources/content/siyavula-*) is a SQLite corpus of excerpts, each linked to the
curriculum's subtopics with a role. A lesson prompt can carry only a few thousand characters of it, so the choice is
made here, once, and the file the Worker uploads holds only that choice: instruction first, then worked examples, then
the earlier work a topic builds on, then a few exercises.
"""

import re
import sqlite3
from pathlib import Path

# What one topic's passages may add up to, and the longest a single passage is kept.
TOPIC_BUDGET = 6000
PASSAGE_LIMIT = 1200
MAX_EXERCISES = 3

# The order a topic's passages are taken in; a passage's role says what it is for.
ROLE_ORDER = ("instruction", "worked_example", "foundation", "exercise")

_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_BLANK_LINES = re.compile(r"\n{3,}")


def attribution(corpus: Path) -> dict:
    """What the textbook's licence requires a lesson to say."""
    with sqlite3.connect(f"file:{corpus}?mode=ro", uri=True) as db:
        meta = dict(db.execute("SELECT key, value FROM corpus_metadata"))
    return {
        "title": meta["title"],
        "publisher": meta["publisher"],
        "sourceUrl": meta["source_url"],
        "licence": meta["licence_name"],
        "licenceUrl": meta["licence_url"],
        "attribution": meta["attribution"],
    }


def _text(role: str, prompt: str, content: str, retrieval: str) -> str:
    """A worked example's retrieval text carries its solution, which is what teaches; an exercise is its questions;
    everything else is its own text."""
    order = (
        (retrieval, prompt, content)
        if role == "worked_example"
        else (prompt, content, retrieval)
    )
    chosen = next((text.strip() for text in order if text.strip()), "")
    return _BLANK_LINES.sub("\n\n", _IMAGE.sub("", chosen)).strip()


def _shortened(text: str) -> str:
    """At most PASSAGE_LIMIT characters, made of whole paragraphs so a table or an equation is never cut through;
    empty when even the first paragraph is too long to keep whole."""
    kept: list[str] = []
    length = 0
    for paragraph in text.split("\n\n"):
        length += len(paragraph) + 2
        if length > PASSAGE_LIMIT + 2:
            break
        kept.append(paragraph)
    return "\n\n".join(kept)


def _linked(db: sqlite3.Connection, subtopics: list[str]) -> list[dict]:
    marks = ",".join("?" * len(subtopics))
    rows = db.execute(
        f"""SELECT s.role, r.record_id, r.title, r.chapter_title,
                   r.prompt_text, r.content_text, r.retrieval_text
            FROM subtopic_sources s JOIN textbook_records r USING (record_id)
            WHERE s.subtopic_id IN ({marks})
            ORDER BY s.subtopic_id, s.rank""",
        subtopics,
    ).fetchall()
    seen: set[str] = set()
    found = []
    for role, record, title, chapter, prompt, content, retrieval in rows:
        text = _shortened(_text(role, prompt, content, retrieval))
        if record in seen or not text:
            continue
        seen.add(record)
        found.append(
            {
                "id": record,
                "role": role,
                "title": title,
                "chapter": chapter,
                "text": text,
            }
        )
    return found


def _chosen(linked: list[dict]) -> list[dict]:
    """The passages that fit the topic's budget. Each role takes a turn in ROLE_ORDER, so a topic with many
    instruction passages still has its worked examples; the result is in ROLE_ORDER, then the textbook's order."""
    waiting = {
        role: [p for p in linked if p["role"] == role][
            : MAX_EXERCISES if role == "exercise" else None
        ]
        for role in ROLE_ORDER
    }
    taken: list[dict] = []
    spent = 0
    while any(waiting.values()):
        for role in ROLE_ORDER:
            if not waiting[role]:
                continue
            passage = waiting[role].pop(0)
            if spent + len(passage["text"]) <= TOPIC_BUDGET:
                taken.append(passage)
                spent += len(passage["text"])
    return sorted(taken, key=lambda p: ROLE_ORDER.index(p["role"]))


def passages(
    corpus: Path, subtopics_by_topic: dict[str, list[str]]
) -> dict[str, list[dict]]:
    """Each topic's chosen passages, from the subtopics under it; a topic nothing is linked to is left out."""
    with sqlite3.connect(f"file:{corpus}?mode=ro", uri=True) as db:
        found = {
            topic: _chosen(_linked(db, subtopics))
            for topic, subtopics in subtopics_by_topic.items()
            if subtopics
        }
    return {topic: chosen for topic, chosen in found.items() if chosen}
