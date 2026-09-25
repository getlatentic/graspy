"""The subjects offered to a learner, against a stand-in model."""

import json

from stand_in import inputs, stand_in

from app.domains.subjects.service import SubjectService

ANSWERS = [
    {
        "reasoning": "r",
        "subjects": [{"id": "mathematics", "label": "Ìṣirò", "recommended": True}],
    },
]


async def test_the_stream_gives_the_subjects_for_the_learners_class():
    lm, context = stand_in(ANSWERS)

    with context:
        events = [
            json.loads(event)
            async for event in SubjectService().generate_stream(
                "Nigeria", "Yoruba", "JSS 1 (Junior Secondary School), Nigeria"
            )
        ]

    assert events == [
        {"type": "status", "message": "Analyzing curriculum standards..."},
        {
            "type": "subjects",
            "subjects": [{"id": "mathematics", "label": "Ìṣirò", "recommended": True}],
        },
    ]
    assert inputs(lm, 0) == {
        "country": "Nigeria",
        "language": "Yoruba",
        "grade_level": "JSS 1 (Junior Secondary School), Nigeria",
    }
