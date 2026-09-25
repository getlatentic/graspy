"""Curriculum generation: each subject's topics under its own slug."""

import json

import pytest
from stand_in import inputs, stand_in

from app.domains.curriculum.prompts import CurriculumSubjectInput
from app.domains.curriculum.service import (
    CurriculumService,
    normalize_subjects,
    pair_topics,
)

MATHS = CurriculumSubjectInput(id="mathematics", label="Ìṣirò")
ENGLISH = CurriculumSubjectInput(id="english-language", label="Èdè Gẹ̀ẹ́sì")


def topics_answer(topics: dict) -> dict:
    return {"reasoning": "r", "topics": topics}


def curriculum_answer(*items: tuple[str, str, list[str]]) -> dict:
    return {
        "reasoning": "r",
        "curriculum": [
            {"subject_slug": slug, "subject_label": label, "topics": topics}
            for slug, label, topics in items
        ],
    }


def translation_answer(*topics: str) -> dict:
    return {"reasoning": "r", "translated_topics": list(topics)}


@pytest.mark.parametrize(
    ("generated", "expected"),
    [
        (
            {"english-language": ["Grammar"], "mathematics": ["Fractions"]},
            {"mathematics": ["Fractions"], "english-language": ["Grammar"]},
        ),
        (
            {"Èdè Gẹ̀ẹ́sì": ["Grammar"], "Ìṣirò": ["Fractions"]},
            {"mathematics": ["Fractions"], "english-language": ["Grammar"]},
        ),
        (
            {"Maths": ["Fractions"], "English": ["Grammar"]},
            {"mathematics": ["Fractions"], "english-language": ["Grammar"]},
        ),
        (
            {"English": ["Grammar"], "mathematics": ["Fractions"]},
            {"mathematics": ["Fractions"], "english-language": ["Grammar"]},
        ),
        (
            {"mathematics": ["Fractions"], "Music": ["Rhythm"], "Art": ["Colour"]},
            {"mathematics": ["Fractions"]},
        ),
    ],
    ids=[
        "reordered-ids",
        "keyed-by-label",
        "renamed-in-order",
        "one-renamed",
        "unpairable-extras",
    ],
)
def test_topics_reach_the_subject_they_were_written_for(generated, expected):
    paired = pair_topics([MATHS, ENGLISH], generated)

    assert paired == expected
    assert list(paired) == list(expected), (
        "topics follow the order of the chosen subjects"
    )


def test_topics_that_match_no_subject_are_reported_when_dropped(caplog):
    pair_topics(
        [MATHS, ENGLISH],
        {"mathematics": ["Fractions"], "Music": ["Rhythm"], "Art": ["Colour"]},
    )

    assert caplog.messages == [
        "Dropped topics under 2 key(s) that match no chosen subject"
    ]


def test_a_label_cannot_take_the_key_of_another_subjects_id():
    physics = CurriculumSubjectInput(id="physics", label="Science")
    science = CurriculumSubjectInput(id="science", label="General Science")

    paired = pair_topics(
        [physics, science], {"science": ["Cells"], "physics": ["Motion"]}
    )

    assert paired == {"physics": ["Motion"], "science": ["Cells"]}


@pytest.mark.parametrize(
    ("subject", "expected"),
    [
        ("Ìṣirò | mathematics", ("mathematics", "Ìṣirò")),
        ("Mathematics", ("Mathematics", "Mathematics")),
    ],
    ids=["label-and-id", "bare-name"],
)
def test_each_shape_the_app_sends_is_understood(subject, expected):
    (normalized,) = normalize_subjects([subject])

    assert (normalized.id, normalized.label) == expected


def test_repeated_subjects_are_dropped():
    normalized = normalize_subjects(["Mathematics", "mathematics", "Maths|mathematics"])

    assert [(subject.id, subject.label) for subject in normalized] == [
        ("Mathematics", "Mathematics")
    ]


def asked(lm, call: int) -> dict:
    """What one call was asked, with the subject list parsed."""
    fields = inputs(lm, call)
    if "input_subjects" in fields:
        fields["input_subjects"] = json.loads(fields["input_subjects"])
    return fields


async def test_chosen_subjects_keep_the_clients_names_and_slugs():
    lm, context = stand_in(
        [
            topics_answer(
                {"Maths": ["Fractions", "Fractions", "Ratios"], "English": ["Grammar"]}
            )
        ]
    )

    with context:
        result = await CurriculumService().generate(
            "Nigeria", "English", "JSS 1", ["Mathematics", "English Language"]
        )

    assert result == {
        "subjects": [
            {"name": "Mathematics", "slug": "mathematics"},
            {"name": "English Language", "slug": "english-language"},
        ],
        "topics": {
            "mathematics": ["Fractions", "Ratios"],
            "english-language": ["Grammar"],
        },
    }
    assert asked(lm, 0) == {
        "country": "Nigeria",
        "language": "English",
        "grade_level": "JSS 1",
        "input_subjects": [
            {"id": "Mathematics", "label": "Mathematics"},
            {"id": "English Language", "label": "English Language"},
        ],
    }


async def test_a_whole_curriculum_lists_each_subject_once_under_a_clean_slug():
    lm, context = stand_in(
        [
            curriculum_answer(
                ("Basic Science", "Basic Science", ["Living things"]),
                ("basic-science", "Basic Science", ["Duplicate"]),
                ("Civic Education", "Civic Education", []),
            )
        ]
    )

    with context:
        result = await CurriculumService().generate("Nigeria", "English", "JSS 1")

    assert result == {
        "subjects": [
            {"name": "Basic Science", "slug": "basic-science"},
            {"name": "Civic Education", "slug": "civic-education"},
        ],
        "topics": {"basic-science": ["Living things"]},
    }
    assert asked(lm, 0) == {
        "country": "Nigeria",
        "language": "English",
        "grade_level": "JSS 1",
        "input_subjects": [],
    }


async def test_yoruba_topics_are_written_in_english_then_translated_per_subject():
    # One translation answer for two subjects: translating the empty list
    # would exhaust DummyLM and fail the run.
    lm, context = stand_in(
        [
            topics_answer({"mathematics": ["Fractions"], "english-language": []}),
            translation_answer("Ìdá"),
        ]
    )

    with context:
        result = await CurriculumService().generate(
            "Nigeria",
            "Yoruba",
            "JSS 1",
            ["Ìṣirò|mathematics", "Èdè Gẹ̀ẹ́sì|english-language"],
        )

    assert result["topics"] == {"mathematics": ["Ìdá"], "english-language": []}
    assert asked(lm, 0)["language"] == "English"
    assert asked(lm, 1) == {
        "topics": '["Fractions"]',
        "subject": "Ìṣirò",
        "target_language": "Yoruba",
    }


async def test_a_whole_yoruba_curriculum_is_translated_too():
    lm, context = stand_in(
        [
            curriculum_answer(("mathematics", "Ìṣirò", ["Fractions"])),
            translation_answer("Ìdá"),
        ]
    )

    with context:
        result = await CurriculumService().generate("Nigeria", "Yoruba", "Primary 4")

    assert result == {
        "subjects": [{"name": "Ìṣirò", "slug": "mathematics"}],
        "topics": {"mathematics": ["Ìdá"]},
    }
    assert asked(lm, 0) == {
        "country": "Nigeria",
        "language": "English",
        "grade_level": "Primary 4",
        "input_subjects": [],
    }


async def test_the_stream_reports_progress_then_the_result():
    lm, context = stand_in([topics_answer({"mathematics": ["Fractions"]})])

    with context:
        events = [
            json.loads(event)
            async for event in CurriculumService().generate_stream(
                "Ghana", "English", "JHS 1", ["Mathematics"]
            )
        ]

    assert events == [
        {"type": "status", "message": "Designing curriculum..."},
        {
            "type": "result",
            "subjects": [{"name": "Mathematics", "slug": "mathematics"}],
            "topics": {"mathematics": ["Fractions"]},
        },
    ]
    assert (asked(lm, 0)["country"], asked(lm, 0)["grade_level"]) == ("Ghana", "JHS 1")
