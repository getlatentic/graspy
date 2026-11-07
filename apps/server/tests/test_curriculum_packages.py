from app.domains.curriculum.packages import courses, held_course
from app.domains.curriculum.packages.export import outlines
from app.domains.curriculum.packages.outlines import OUTLINES
from app.education.catalogue import systems


def test_the_outlines_are_what_the_packages_give_now():
    assert OUTLINES == outlines(), (
        "outlines.py is stale: run python -m app.domains.curriculum.packages.export"
    )


def test_each_course_is_for_classes_the_catalogue_has():
    known = {
        (system.id, level.id)
        for system in systems().values()
        for level in system.levels
    }
    for course in courses():
        assert course.levels <= known, course.source.package_id


def test_nerdc_jss1_mathematics_keeps_every_objective_of_its_edition():
    course = held_course("NG", "jss-1", "Mathematics")
    assert course is not None
    assert (course.source.authority, course.source.edition) == (
        "NERDC",
        "September 2025",
    )
    assert len(course.topics()) == 24
    assert course.objectives() == 158


def test_a_subject_is_matched_by_its_names_and_a_class_exactly():
    assert held_course("NG", "jss-1", "Maths") is not None
    assert held_course("NG", "jss-1", "general-mathematics") is not None
    assert held_course("NG", "jss-1", "Basic Science") is None
    assert held_course("NG", "jss-2", "Mathematics") is None
    assert held_course(None, "jss-1", "Mathematics") is None


def test_coverage_shows_the_held_curriculum_and_how_the_voice_lessons_are_grounded():
    from app.domains.curriculum.coverage import coverage

    rows = {(row["system"], row["level"], row["subject"]): row for row in coverage()}
    jss1 = rows["NG", "jss-1", "mathematics"]
    assert (jss1["curriculum"]["authority"], jss1["topics"], jss1["objectives"]) == (
        "NERDC",
        24,
        158,
    )
    primary = rows["NG", "primary-4", "mathematics"]
    assert primary["curriculum"] is None
    assert primary["voiceLessons"]["cited"] + primary["voiceLessons"]["ungrounded"] > 0


def test_coverage_is_served():
    from fastapi.testclient import TestClient

    from app.factory import create_app
    from app.settings import Settings

    client = TestClient(
        create_app(
            Settings(
                aws_bearer_token_bedrock="bedrock-test",
                session_secret="s",
                _env_file=None,
            )
        )
    )
    response = client.get("/api/curriculum/coverage")
    assert response.status_code == 200
    assert any(row["curriculum"] for row in response.json())


def test_the_passages_are_what_the_textbook_gives_now():
    from app.domains.curriculum.packages.export import topic_passages
    from app.domains.curriculum.packages.passages import PASSAGES

    assert PASSAGES == topic_passages(), (
        "passages.py is stale: run python -m app.domains.curriculum.packages.export"
    )


def test_every_topic_of_the_held_course_has_passages_that_fit_a_prompt():
    from app.domains.curriculum.packages.textbook_export import (
        MAX_EXERCISES,
        PASSAGE_LIMIT,
        ROLE_ORDER,
        TOPIC_BUDGET,
    )

    course = held_course("NG", "jss-1", "Mathematics")
    assert course is not None
    for title in course.topics():
        topic = course.topic(title)
        assert topic is not None and topic.objectives and topic.passages, title
        texts = [p.text for p in topic.passages]
        assert sum(map(len, texts)) <= TOPIC_BUDGET, title
        assert all(0 < len(text) <= PASSAGE_LIMIT for text in texts), title
        assert all(text.count("$$") % 2 == 0 for text in texts), title
        roles = [p.role for p in topic.passages]
        assert roles == sorted(roles, key=ROLE_ORDER.index), title
        assert roles.count("exercise") <= MAX_EXERCISES, title
        assert "![" not in "".join(texts), title


def test_a_topic_is_found_by_its_title_however_it_is_written():
    course = held_course("NG", "jss-1", "Mathematics")
    assert course is not None
    assert course.topic("fractions").code == course.topic("Fractions").code
    assert course.topic("Algebra") is None


def test_each_role_takes_a_turn_so_worked_examples_are_not_crowded_out():
    from app.domains.curriculum.packages.textbook_export import TOPIC_BUDGET, _chosen

    def passage(role, number):
        return {"id": f"{role}-{number}", "role": role, "text": "x" * 1000}

    linked = [passage("instruction", n) for n in range(10)] + [
        passage("worked_example", n) for n in range(3)
    ]
    chosen = _chosen(linked)

    assert sum(len(p["text"]) for p in chosen) <= TOPIC_BUDGET
    assert sum(p["role"] == "worked_example" for p in chosen) == 3


def test_no_two_topics_of_a_course_share_a_title_once_written_as_a_slug():
    from app.utils.slug import slugify

    course = held_course("NG", "jss-1", "Mathematics")
    assert course is not None
    slugs = [slugify(title) for title in course.topics()]
    assert len(slugs) == len(set(slugs))


def test_a_passage_too_long_to_keep_whole_is_left_out_not_kept_empty():
    from app.domains.curriculum.packages.textbook_export import (
        PASSAGE_LIMIT,
        _shortened,
    )

    assert _shortened("x" * (PASSAGE_LIMIT + 1)) == ""


def test_a_linked_passage_whose_text_is_left_empty_by_shortening_is_not_kept():
    import sqlite3

    from app.domains.curriculum.packages.textbook_export import PASSAGE_LIMIT, _linked

    db = sqlite3.connect(":memory:")
    db.executescript(
        """
        CREATE TABLE textbook_records (record_id, title, chapter_title, prompt_text, content_text, retrieval_text);
        CREATE TABLE subtopic_sources (subtopic_id, record_id, role, rank);
        """
    )
    for record, text in (("long", "x" * (PASSAGE_LIMIT + 1)), ("short", "A fraction.")):
        db.execute(
            "INSERT INTO textbook_records VALUES (?, ?, 'Chapter', '', ?, '')",
            (record, record, text),
        )
        db.execute(
            "INSERT INTO subtopic_sources VALUES ('s', ?, 'instruction', ?)",
            (record, 1 if record == "long" else 2),
        )

    assert [p["id"] for p in _linked(db, ["s"])] == ["short"]
