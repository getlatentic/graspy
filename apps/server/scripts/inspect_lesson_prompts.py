"""Prints every prompt and reply of one real lesson run.

Makes live model calls with the settings in .env:

    uv run python scripts/inspect_lesson_prompts.py
    uv run python scripts/inspect_lesson_prompts.py --language Yoruba --topic "Ìdá"
"""

import argparse
import asyncio

import dspy

from app.domains.lesson.service import LessonService
from app.llm.client import configure_dspy
from app.settings import get_settings


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print every prompt and reply of one real lesson run."
    )
    parser.add_argument("--country", default="Nigeria")
    parser.add_argument("--language", default="English")
    parser.add_argument("--subject", default="Mathematics")
    parser.add_argument("--topic", default="Linear Equations")
    parser.add_argument("--grade", default="JSS 2")
    return parser.parse_args()


async def main() -> None:
    options = arguments()
    configure_dspy(get_settings())
    try:
        await LessonService().generate_lesson(
            country=options.country,
            language=options.language,
            subject=options.subject,
            topic=options.topic,
            grade_level=options.grade,
        )
    finally:
        # A failed run still shows the prompts that led to the failure.
        dspy.inspect_history(n=len(dspy.settings.lm.history))


if __name__ == "__main__":
    asyncio.run(main())
