"""Derives the learner's reading of a curriculum package from the package the teacher app ships.

The package (apps/teacher/src-tauri/resources/content) is the one source: an official edition converted to themes,
topics, subtopics and objectives, with its source document's digest and rights. The API needs only the outline, so
this writes that outline beside courses.json, which says which school classes and subject names each course is for.
A test derives it again and compares, so the two cannot drift.

    uv run python -m app.domains.curriculum.packages.export
"""

import base64
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).parent
REPOSITORY = HERE.parents[6]
COURSES = HERE / "courses.json"
OUTLINES = HERE / "outlines"
SCHEMA_VERSIONS = {1, 2}


def read_package(path: Path) -> tuple[dict, str]:
    """The package's payload and its SHA-256, as the teacher app computes it."""
    envelope = json.loads(path.read_text(encoding="utf-8"))
    if envelope.get("schemaVersion") not in SCHEMA_VERSIONS:
        raise ValueError(f"{path.name}: unsupported curriculum package version")
    payload = base64.b64decode(envelope["payload"], validate=True)
    return json.loads(payload), hashlib.sha256(payload).hexdigest()


def _children(nodes: list[dict], parent: str | None, kind: str) -> list[dict]:
    found = [n for n in nodes if n.get("parentCode") == parent and n["kind"] == kind]
    return sorted(found, key=lambda n: n["sequence"])


def _objectives(course: dict, subtopic: str) -> list[dict]:
    """The atomic objectives under a subtopic's performance objectives, in order."""
    performance = {
        n["code"] for n in course["nodes"] if n.get("parentCode") == subtopic
    }
    held = [
        o for o in course["objectives"] if o["nodeCode"] in performance | {subtopic}
    ]
    order = {n["code"]: n["sequence"] for n in course["nodes"]}
    held.sort(key=lambda o: (order.get(o["nodeCode"], 0), o["sequence"]))
    return [{"code": o["code"], "statement": o["statement"]} for o in held]


def outline(entry: dict) -> dict:
    """One course of a package as the API reads it: where it is from, who it is for, and its outline."""
    payload, digest = read_package(REPOSITORY / entry["package"])
    course = next(c for c in payload["courses"] if c["courseKey"] == entry["courseKey"])
    nodes = course["nodes"]
    themes = [
        {
            "code": theme["code"],
            "title": theme["title"],
            "topics": [
                {
                    "code": topic["code"],
                    "title": topic["title"],
                    "subtopics": [
                        {
                            "code": sub["code"],
                            "title": sub["title"],
                            "objectives": _objectives(course, sub["code"]),
                        }
                        for sub in _children(nodes, topic["code"], "subtopic")
                    ],
                }
                for topic in _children(nodes, theme["code"], "topic")
            ],
        }
        for theme in _children(nodes, None, "theme")
    ]
    return {
        "packageId": payload["packageId"],
        "packageRevision": payload.get("packageRevision", 1),
        "payloadSha256": digest,
        "title": payload["title"],
        "authority": entry["authority"],
        "framework": payload["framework"]["name"],
        "edition": payload["edition"],
        "effectiveFrom": payload.get("effectiveFrom"),
        "sourceUrl": payload["sourceUrl"],
        "country": payload["countryCode"],
        "courseKey": course["courseKey"],
        "courseTitle": course["title"],
        "subject": entry["subject"],
        "aliases": entry["aliases"],
        "levels": entry["levels"],
        "themes": themes,
    }


def outline_name(entry: dict) -> str:
    return f"{entry['courseKey']}.{Path(entry['package']).parent.name}.json"


def export() -> list[Path]:
    OUTLINES.mkdir(exist_ok=True)
    written = []
    for entry in json.loads(COURSES.read_text(encoding="utf-8")):
        path = OUTLINES / outline_name(entry)
        path.write_text(
            json.dumps(outline(entry), ensure_ascii=False, indent=1) + "\n",
            encoding="utf-8",
        )
        written.append(path)
    return written


if __name__ == "__main__":
    for path in export():
        print(path.relative_to(REPOSITORY))
