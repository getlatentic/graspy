"""Write the contract a learner's devices share their tutor conversations by,
for the web app and the Android app to check themselves against.

What a device sends (``sent``) holds a thread of each kind of message, as
either app keeps it; what a device reads back (``changes``) is that thread as
the real store returns it. Both apps' tests read the file this writes: each
builds ``sent`` from its own copy of the conversation and takes ``changes``
into it.

    uv run python scripts/export_thread_contract.py           # write
    uv run python scripts/export_thread_contract.py --check   # fail if stale
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from app.agent.cards import ResultMeta
from app.agent.practice import PracticeQuestion, give_practice
from app.local_d1 import LocalD1
from app.threads.store import ThreadStore
from app.threads.wire import SentThreads

APPS = Path(__file__).resolve().parents[2]
TARGETS = (
    APPS / "web/src/lib/threads/thread-contract.json",
    APPS / "mobile/app/src/test/resources/thread-contract.json",
)
OWNER = "account:uid123/aaaaaaaaaaaa"

PRACTICE = give_practice(
    instruction="Write the fraction as a decimal.",
    questions=[
        PracticeQuestion(
            question="Convert \\(\\frac{1}{4}\\) to a decimal.",
            working="1 ÷ 4 = 0.25",
            options=["0.4", "0.25"],
            answer_index=1,
            correct_feedback="1 ÷ 4 = 0.25.",
            incorrect_feedback="Divide 1 by 4.",
            check="1/4",
        )
    ],
).card
# The view's key fixed, so the file is.
CARD = PRACTICE.model_copy(
    update={
        "tool_result": PRACTICE.tool_result.model_copy(
            update={"meta": ResultMeta(view_uuid="9b8a7f6e5d4c4b3a8f2e1d0c9b8a7f6e")}
        )
    }
).model_dump(by_alias=True, exclude_none=True)

ANSWERED = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "answer_practice",
        "arguments": {"question": "Convert 1/4 to a decimal.", "chosenIndex": 1},
    },
}

SENT = {
    "threads": [
        {
            "id": "thread-5d1f3a52-8c4e-4f7e-9d0a-2b6c7e8f9a01",
            "scope": {
                "kind": "topic",
                "planId": "plan-1",
                "subjectSlug": "mathematics",
                "topic": "Fractions",
            },
            "agentContextId": "context-7b2e",
            "preview": "What is a quarter as a decimal?",
            "createdAt": 1_790_000_000_000,
            "updatedAt": 1_790_000_060_000,
            "messages": [
                {
                    "id": "msg-1790000000000-a1b2c3d4e",
                    "type": "user",
                    "content": "What is a quarter as a decimal?",
                    "timestamp": 1_790_000_000_000,
                    "editedAt": 1_790_000_000_000,
                    "metadata": {"appCalls": [ANSWERED]},
                },
                {
                    "id": "msg-1790000030000-f5e6d7c8b",
                    "type": "system",
                    "content": "A quarter is 0.25. Try this one.",
                    "timestamp": 1_790_000_030_000,
                    "editedAt": 1_790_000_050_000,
                    "metadata": {
                        "followUps": ["What is a half as a decimal?"],
                        "card": CARD,
                        "viewCalls": [ANSWERED],
                    },
                },
                {
                    "id": "msg-1790000040000-9a8b7c6d5",
                    "type": "system",
                    "content": "A quarter is",
                    "timestamp": 1_790_000_040_000,
                    "editedAt": 1_790_000_040_000,
                    "metadata": {"stopped": True},
                },
                {
                    "id": "msg-1790000060000-0f1e2d3c4",
                    "type": "complete",
                    "content": "Decimals is ready for you.",
                    "timestamp": 1_790_000_060_000,
                    "editedAt": 1_790_000_060_000,
                    "metadata": {
                        "link": {
                            "label": "Open lesson",
                            "to": {
                                "type": "lesson",
                                "subjectSlug": "mathematics",
                                "topicIndex": 3,
                            },
                        }
                    },
                },
            ],
        },
        {
            "id": "thread-0c9d8e7f-6a5b-4c3d-2e1f-0a9b8c7d6e5f",
            "scope": {"kind": "general", "planId": "plan-1"},
            "createdAt": 1_790_000_070_000,
            "updatedAt": 1_790_000_070_000,
            "messages": [
                {
                    "id": "msg-1790000070000-1a2b3c4d5",
                    "type": "user",
                    "content": "Can you add Physics?",
                    "timestamp": 1_790_000_070_000,
                    "editedAt": 1_790_000_070_000,
                }
            ],
        },
        {
            "id": "thread-7e6d5c4b-3a2f-1e0d-9c8b-7a6f5e4d3c2b",
            "scope": {
                "kind": "subject",
                "planId": "plan-1",
                "subjectSlug": "mathematics",
            },
            "createdAt": 1_790_000_080_000,
            "updatedAt": 1_790_000_080_000,
            "messages": [
                {
                    "id": "msg-1790000080000-6f7e8d9c0",
                    "type": "complete",
                    "content": "Your subjects have changed.",
                    "timestamp": 1_790_000_080_000,
                    "editedAt": 1_790_000_080_000,
                    "metadata": {
                        "link": {"label": "See subjects", "to": {"type": "subjects"}}
                    },
                },
                {
                    "id": "msg-1790000080001-5e4d3c2b1",
                    "type": "complete",
                    "content": "Mathematics is ready for you.",
                    "timestamp": 1_790_000_080_001,
                    "editedAt": 1_790_000_080_001,
                    "metadata": {
                        "link": {
                            "label": "Open subject",
                            "to": {"type": "subject", "subjectSlug": "mathematics"},
                        }
                    },
                },
            ],
        },
    ]
}


async def _changes() -> dict:
    threads = ThreadStore(LocalD1())
    await threads.keep(OWNER, SentThreads.model_validate(SENT).threads)
    return (await threads.changes(OWNER, 0, None, None)).model_dump(by_alias=True)


def contract() -> str:
    wire = {"sent": SENT, "changes": asyncio.run(_changes())}
    return json.dumps(wire, indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    text = contract()
    for target in TARGETS:
        if "--check" not in sys.argv[1:]:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        elif not target.exists() or json.loads(
            target.read_text(encoding="utf-8")
        ) != json.loads(text):
            raise SystemExit(
                f"{target} is stale; run scripts/export_thread_contract.py"
            )


if __name__ == "__main__":
    main()
