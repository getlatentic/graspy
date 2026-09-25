from __future__ import annotations

import json
from collections.abc import AsyncIterator

import dspy

from .prompts import GenerateSubjects


class SubjectService:
    def __init__(self):
        self.module = dspy.ChainOfThought(GenerateSubjects)

    async def generate_stream(
        self, country: str, language: str, grade_level: str
    ) -> AsyncIterator[str]:
        yield json.dumps(
            {"type": "status", "message": "Analyzing curriculum standards..."}
        )

        prediction = await self.module.acall(
            country=country, language=language, grade_level=grade_level
        )
        yield json.dumps(
            {
                "type": "subjects",
                "subjects": [s.model_dump() for s in prediction.subjects],
            }
        )
