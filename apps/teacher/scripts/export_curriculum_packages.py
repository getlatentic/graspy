"""Audit and export deterministic Graspy curriculum packages.

The donor files remain outside this repository. Release output is permitted
only when explicit source metadata records an affirmative redistribution
decision. This prevents an internally consistent dataset from being mistaken
for a current or redistribution-cleared curriculum edition.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sqlite3
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


DONOR_ROOT_VARIABLE = "PLAN_TO_TUTOR_ROOT"
DEFAULT_CORPUS = (
    Path(__file__).resolve().parents[1]
    / "src-tauri/resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3"
)

SUPPORTED_BLOOM_LEVELS = {
    "remember",
    "understand",
    "apply",
    "analyze",
    "evaluate",
    "create",
}
SUPPORTED_SOURCE_ROLES = {
    "foundation",
    "instruction",
    "worked_example",
    "exercise",
}
SUPPORTED_LINKAGE_STATES = {"mapped", "needs_review", "no_records"}
REPRESENTATION_TERMS = (
    "represent",
    "representation",
    "diagram",
    "graph",
    "table",
    "chart",
    "number line",
    "clock",
    "plot",
    "illustrate",
)


@dataclass(frozen=True)
class DatasetPaths:
    themes: Path
    topics: Path
    knowledge_components: Path
    linkage_directory: Path

    @classmethod
    def from_root(cls, root: Path) -> "DatasetPaths":
        return cls(
            themes=root / "curriculum/jss1_themes.json",
            topics=root / "curriculum/jss1_topics_enriched.json",
            knowledge_components=root
            / "curriculum/jss1_knowledge_components.json",
            linkage_directory=root / "ao_textbook_linkage/manual",
        )

    def source_files(self) -> list[Path]:
        linkage_files = sorted(
            path
            for path in self.linkage_directory.glob("*.json")
            if path.name not in {"manifest.json", "review_triage.json"}
        )
        return [self.themes, self.topics, self.knowledge_components, *linkage_files]


def donor_path(relative: str) -> Path | None:
    root = os.getenv(DONOR_ROOT_VARIABLE)
    return Path(root) / relative if root else None


def require_source_paths(
    parser: argparse.ArgumentParser, arguments: argparse.Namespace, *names: str
) -> None:
    for name in names:
        flag = "--" + name.replace("_", "-")
        path = getattr(arguments, name)
        if path is None:
            parser.error(
                f"{flag} is required. Pass it, or set {DONOR_ROOT_VARIABLE} "
                "to a plan-to-tutor checkout that contains dataset/processed."
            )
        if not path.exists():
            parser.error(f"{flag} {path} does not exist.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-root", type=Path, default=donor_path("dataset/processed")
    )
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--revision-overlay", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--audit-output", type=Path)
    arguments = parser.parse_args()
    require_source_paths(parser, arguments, "dataset_root", "corpus")
    return arguments


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Required curriculum source is missing: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Curriculum source is not valid JSON: {path}") from error


def required_text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be non-empty text.")
    return " ".join(value.split())


def required_list(value: object, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list.")
    return value


def classify_knowledge_type(description: str, bloom_level: str) -> str:
    """Classify reviewed curriculum outcomes into the lesson-planning taxonomy."""
    normalized_description = required_text(
        description, "knowledge-component description"
    ).casefold()
    normalized_bloom_level = required_text(
        bloom_level, "knowledge-component Bloom level"
    ).casefold()
    if normalized_bloom_level not in SUPPORTED_BLOOM_LEVELS:
        raise ValueError(
            f"Unsupported knowledge-component Bloom level {normalized_bloom_level}."
        )
    if any(term in normalized_description for term in REPRESENTATION_TERMS):
        return "representation"
    if normalized_bloom_level in {"apply", "analyze", "evaluate", "create"}:
        return "procedure"
    return "concept"


def linkage_files(directory: Path) -> list[Path]:
    files = sorted(
        path
        for path in directory.glob("*.json")
        if path.name not in {"manifest.json", "review_triage.json"}
    )
    if not files:
        raise ValueError(f"No curriculum-to-textbook linkage rows found in {directory}.")
    return files


def load_linkage_rows(directory: Path) -> list[dict[str, Any]]:
    rows = [read_json(path) for path in linkage_files(directory)]
    if any(not isinstance(row, dict) for row in rows):
        raise ValueError("Every linkage row must be a JSON object.")
    rows.sort(key=lambda row: required_text(row.get("subtopic_id"), "subtopic id"))
    return rows


def corpus_record_ids(path: Path) -> set[str]:
    if not path.is_file():
        raise ValueError(f"The packaged textbook corpus is missing: {path}")
    connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        integrity = connection.execute("PRAGMA quick_check").fetchone()
        if integrity != ("ok",):
            raise ValueError("The packaged textbook corpus failed its integrity check.")
        return {
            row[0]
            for row in connection.execute(
                "SELECT record_id FROM textbook_records ORDER BY record_id"
            )
        }
    finally:
        connection.close()


def content_digest(paths: Iterable[Path], root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda candidate: candidate.relative_to(root).as_posix()):
        relative_path = path.relative_to(root).as_posix()
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def load_dataset(paths: DatasetPaths) -> tuple[list[Any], list[Any], list[Any], list[Any]]:
    themes = required_list(read_json(paths.themes), "themes")
    topics = required_list(read_json(paths.topics), "topics")
    components = required_list(
        read_json(paths.knowledge_components), "knowledge components"
    )
    rows = load_linkage_rows(paths.linkage_directory)
    return themes, topics, components, rows


def audit_dataset(
    paths: DatasetPaths,
    valid_record_ids: set[str],
    source_link_corrections: dict[tuple[str, str], str] | None = None,
) -> dict[str, Any]:
    source_link_corrections = source_link_corrections or {}
    themes, topics, components, rows = load_dataset(paths)
    theme_ids = unique_text_values(themes, "key", "theme")
    topic_ids = unique_text_values(topics, "topic_key", "topic")
    subtopics = [
        subtopic
        for topic in topics
        for subtopic in required_list(topic.get("subtopics"), "topic subtopics")
    ]
    subtopic_ids = unique_text_values(subtopics, "subtopic_id", "subtopic")
    performance_objective_ids = performance_objectives(subtopics)
    component_ids = unique_text_values(components, "kc_code", "knowledge component")

    if any(required_text(topic.get("theme_key"), "topic theme") not in theme_ids for topic in topics):
        raise ValueError("A topic refers to an unknown theme.")
    component_subtopics = {
        required_text(component.get("subtopic_id"), "knowledge-component subtopic")
        for component in components
    }
    if not component_subtopics <= subtopic_ids:
        raise ValueError("A knowledge component refers to an unknown subtopic.")

    rows_by_subtopic: dict[str, dict[str, Any]] = {}
    atomic_objective_ids: set[str] = set()
    atomic_objective_count = 0
    source_link_count = 0
    objectives_with_sources = 0
    linked_subtopics: set[str] = set()
    linkage_states: Counter[str] = Counter()
    applied_source_link_corrections: set[tuple[str, str]] = set()

    for row in rows:
        subtopic_id = required_text(row.get("subtopic_id"), "linkage subtopic")
        if subtopic_id not in subtopic_ids:
            raise ValueError(f"Linkage row refers to unknown subtopic: {subtopic_id}")
        if subtopic_id in rows_by_subtopic:
            raise ValueError(f"Duplicate linkage row for subtopic: {subtopic_id}")
        rows_by_subtopic[subtopic_id] = row
        state = required_text(row.get("status"), "linkage status")
        if state not in SUPPORTED_LINKAGE_STATES:
            raise ValueError(f"Unsupported linkage status: {state}")
        linkage_states[state] += 1

        shared_records = required_list(
            row.get("shared_foundation_record_ids") or [], "shared source records"
        )
        validate_record_ids(shared_records, valid_record_ids, subtopic_id)
        source_link_count += len(shared_records)
        if shared_records:
            linked_subtopics.add(subtopic_id)

        for objective in required_list(
            row.get("atomic_objectives") or [], "atomic objectives"
        ):
            atomic_objective_count += 1
            objective_id = required_text(objective.get("ao_id"), "atomic objective id")
            if objective_id in atomic_objective_ids:
                raise ValueError(f"Duplicate atomic objective id: {objective_id}")
            atomic_objective_ids.add(objective_id)
            performance_id = required_text(
                objective.get("curriculum_objective_id"),
                "atomic objective performance-objective id",
            )
            if performance_id not in performance_objective_ids:
                raise ValueError(
                    f"Atomic objective {objective_id} refers to unknown performance objective {performance_id}."
                )
            bloom_level = required_text(
                objective.get("bloom_level"), "atomic objective Bloom level"
            )
            if bloom_level not in SUPPORTED_BLOOM_LEVELS:
                raise ValueError(
                    f"Atomic objective {objective_id} has unsupported Bloom level {bloom_level}."
                )
            links = required_list(objective.get("record_links") or [], "source links")
            record_ids = [link.get("record_id") for link in links]
            validate_record_ids(record_ids, valid_record_ids, objective_id)
            for link in links:
                record_id = required_text(link.get("record_id"), "source-link record id")
                role = required_text(link.get("role"), "source-link role")
                if role not in SUPPORTED_SOURCE_ROLES:
                    raise ValueError(f"Unsupported source-link role: {role}")
                required_text(link.get("method"), "source-link method")
                rationale = link.get("rationale")
                correction_key = (objective_id, record_id)
                if not isinstance(rationale, str) or not rationale.strip():
                    rationale = source_link_corrections.get(correction_key)
                    if rationale is not None:
                        applied_source_link_corrections.add(correction_key)
                required_text(rationale, "source-link rationale")
            source_link_count += len(links)
            if links:
                objectives_with_sources += 1
                linked_subtopics.add(subtopic_id)

    if set(rows_by_subtopic) != subtopic_ids:
        missing = sorted(subtopic_ids - set(rows_by_subtopic))
        raise ValueError(f"Missing linkage rows for subtopics: {', '.join(missing)}")

    unused_corrections = sorted(
        set(source_link_corrections) - applied_source_link_corrections
    )
    if unused_corrections:
        raise ValueError(
            "Revision overlay contains unused source-link corrections: "
            + ", ".join(f"{objective}/{record}" for objective, record in unused_corrections)
        )

    for component in components:
        bloom_level = required_text(
            component.get("bloom_level"), "knowledge-component Bloom level"
        )
        if bloom_level not in SUPPORTED_BLOOM_LEVELS:
            raise ValueError(
                f"Knowledge component has unsupported Bloom level: {bloom_level}"
            )

    return {
        "themes": len(theme_ids),
        "topics": len(topic_ids),
        "subtopics": len(subtopic_ids),
        "performanceObjectives": len(performance_objective_ids),
        "atomicObjectives": atomic_objective_count,
        "knowledgeComponents": len(component_ids),
        "sourceLinks": source_link_count,
        "atomicObjectivesWithSources": objectives_with_sources,
        "atomicObjectivesWithoutSources": atomic_objective_count
        - objectives_with_sources,
        "subtopicsWithSources": len(linked_subtopics),
        "subtopicsWithoutSources": len(subtopic_ids - linked_subtopics),
        "linkageStates": dict(sorted(linkage_states.items())),
        "sourceLinkCorrections": len(applied_source_link_corrections),
    }


def unique_text_values(
    documents: list[dict[str, Any]], key: str, label: str
) -> set[str]:
    values = [required_text(document.get(key), f"{label} id") for document in documents]
    if len(values) != len(set(values)):
        raise ValueError(f"Duplicate {label} id.")
    return set(values)


def performance_objectives(subtopics: list[dict[str, Any]]) -> set[str]:
    identifiers: set[str] = set()
    for subtopic in subtopics:
        subtopic_id = required_text(subtopic.get("subtopic_id"), "subtopic id")
        objectives = required_list(
            subtopic.get("performance_objectives"), "performance objectives"
        )
        for index, objective in enumerate(objectives, start=1):
            required_text(objective, "performance objective")
            identifier = f"{subtopic_id}-po{index:02d}"
            if identifier in identifiers:
                raise ValueError(f"Duplicate performance objective id: {identifier}")
            identifiers.add(identifier)
    return identifiers


def validate_record_ids(
    values: Iterable[object], valid_record_ids: set[str], owner: str
) -> None:
    for value in values:
        record_id = required_text(value, "textbook record id")
        if record_id not in valid_record_ids:
            raise ValueError(f"{owner} refers to unknown textbook record {record_id}.")


def build_curriculum_payload(
    paths: DatasetPaths,
    valid_record_ids: set[str],
    metadata: dict[str, Any],
    dataset_root: Path,
    revision_overlay: dict[str, Any] | None = None,
) -> dict[str, Any]:
    corrections = revision_source_link_corrections(revision_overlay)
    audit = audit_dataset(paths, valid_record_ids, corrections)
    assert_release_metadata(metadata)
    themes, topics, components, rows = load_dataset(paths)
    rows_by_subtopic = {row["subtopic_id"]: row for row in rows}
    objective_codes_by_subtopic = {
        required_text(row.get("subtopic_id"), "subtopic id"): [
            required_text(atomic.get("ao_id"), "atomic objective id")
            for atomic in required_list(
                row.get("atomic_objectives"), "subtopic atomic objectives"
            )
        ]
        for row in rows
    }

    nodes: list[dict[str, Any]] = []
    objectives: list[dict[str, Any]] = []
    source_links: list[dict[str, Any]] = []
    objective_codes_with_sources: set[str] = set()

    topic_sequence_by_theme: Counter[str] = Counter()
    for theme_index, theme in enumerate(themes, start=1):
        theme_id = required_text(theme.get("key"), "theme id")
        nodes.append(
            package_node(
                theme_id,
                None,
                "theme",
                required_text(theme.get("title"), "theme title"),
                None,
                theme_index,
                {},
            )
        )

    for topic in topics:
        theme_id = required_text(topic.get("theme_key"), "topic theme")
        topic_id = required_text(topic.get("topic_key"), "topic id")
        topic_sequence_by_theme[theme_id] += 1
        nodes.append(
            package_node(
                topic_id,
                theme_id,
                "topic",
                required_text(topic.get("topic"), "topic title"),
                None,
                topic_sequence_by_theme[theme_id],
                {},
            )
        )
        for subtopic_index, subtopic in enumerate(
            required_list(topic.get("subtopics"), "topic subtopics"), start=1
        ):
            subtopic_id = required_text(subtopic.get("subtopic_id"), "subtopic id")
            row = rows_by_subtopic[subtopic_id]
            nodes.append(
                package_node(
                    subtopic_id,
                    topic_id,
                    "subtopic",
                    required_text(subtopic.get("title"), "subtopic title"),
                    None,
                    subtopic_index,
                    {
                        "teacherActivities": clean_text_list(
                            subtopic.get("teacher_activities"), "teacher activities"
                        ),
                        "studentActivities": clean_text_list(
                            subtopic.get("student_activities"), "student activities"
                        ),
                        "materials": clean_text_list(
                            subtopic.get("teaching_learning_materials"),
                            "teaching materials",
                        ),
                        "evaluationGuide": clean_text_list(
                            subtopic.get("evaluation_guide"), "evaluation guide"
                        ),
                        "contentReview": {
                            "state": row["status"],
                            "reasons": clean_text_list(
                                row.get("status_reasons") or [], "review reasons"
                            ),
                            "categories": sorted(
                                clean_text_list(
                                    row.get("review_categories") or [],
                                    "review categories",
                                )
                            ),
                        },
                    },
                )
            )
            for performance_index, statement in enumerate(
                clean_text_list(
                    subtopic.get("performance_objectives"),
                    "performance objectives",
                ),
                start=1,
            ):
                performance_id = f"{subtopic_id}-po{performance_index:02d}"
                nodes.append(
                    package_node(
                        performance_id,
                        subtopic_id,
                        "performance_objective",
                        statement,
                        statement,
                        performance_index,
                        {},
                    )
                )

            for record_index, record_id in enumerate(
                row.get("shared_foundation_record_ids") or [], start=1
            ):
                source_links.append(
                    {
                        "targetKind": "node",
                        "targetCode": subtopic_id,
                        "recordId": record_id,
                        "role": "foundation",
                        "method": "judgment",
                        "rationale": "Shared source context for this subtopic.",
                        "sequence": record_index,
                    }
                )

            objective_sequence: Counter[str] = Counter()
            for atomic in row.get("atomic_objectives") or []:
                performance_id = required_text(
                    atomic.get("curriculum_objective_id"),
                    "atomic objective performance-objective id",
                )
                objective_sequence[performance_id] += 1
                objective_id = required_text(atomic.get("ao_id"), "atomic objective id")
                objectives.append(
                    {
                        "code": objective_id,
                        "nodeCode": performance_id,
                        "statement": required_text(
                            atomic.get("text"), "atomic objective statement"
                        ),
                        "bloomVerb": required_text(
                            atomic.get("bloom_verb"), "atomic objective Bloom verb"
                        ),
                        "bloomLevel": required_text(
                            atomic.get("bloom_level"), "atomic objective Bloom level"
                        ),
                        "sequence": objective_sequence[performance_id],
                    }
                )
                for link_index, link in enumerate(
                    atomic.get("record_links") or [], start=1
                ):
                    record_id = required_text(
                        link.get("record_id"), "source-link record id"
                    )
                    rationale = link.get("rationale")
                    if not isinstance(rationale, str) or not rationale.strip():
                        rationale = corrections.get((objective_id, record_id))
                    source_links.append(
                        {
                            "targetKind": "objective",
                            "targetCode": objective_id,
                            "recordId": record_id,
                            "role": required_text(link.get("role"), "source-link role"),
                            "method": required_text(
                                link.get("method"), "source-link method"
                            ),
                            "rationale": required_text(rationale, "source-link rationale"),
                            "sequence": link_index,
                        }
                    )
                    objective_codes_with_sources.add(objective_id)

    knowledge_components = []
    for component in components:
        component_code = required_text(
            component.get("kc_code"), "knowledge-component id"
        )
        subtopic_code = required_text(
            component.get("subtopic_id"), "knowledge-component subtopic"
        )
        description = required_text(
            component.get("description"), "knowledge-component description"
        )
        bloom_level = required_text(
            component.get("bloom_level"), "knowledge-component Bloom level"
        )
        objective_codes = objective_codes_by_subtopic.get(subtopic_code, [])
        if not objective_codes:
            raise ValueError(
                f"Knowledge component {component_code} has no atomic objectives in its subtopic."
            )
        knowledge_components.append(
            {
                "code": component_code,
                "nodeCode": subtopic_code,
                "description": description,
                "bloomLevel": bloom_level,
                "knowledgeType": classify_knowledge_type(description, bloom_level),
                "objectiveCodes": objective_codes,
            }
        )
    source_links.sort(
        key=lambda link: (
            link["targetKind"],
            link["targetCode"],
            link["sequence"],
            link["recordId"],
        )
    )
    gaps = sorted(
        objective["code"]
        for objective in objectives
        if objective["code"] not in objective_codes_with_sources
    )
    package = metadata["package"]
    course = metadata["course"]
    revision_integrity = None
    baseline_digest = content_digest(paths.source_files(), dataset_root)
    if revision_overlay is not None:
        revision_integrity = apply_revision_overlay(
            nodes,
            {required_text(topic.get("topic_key"), "topic id") for topic in topics},
            revision_overlay,
            metadata,
            baseline_digest,
        )
        golden_lessons = apply_golden_lesson_reviews(
            nodes,
            objectives,
            source_links,
            revision_overlay,
        )
        if golden_lessons:
            revision_integrity["goldenLessons"] = golden_lessons
            audit["linkageStates"] = dict(audit["linkageStates"])
            audit["linkageStates"]["needs_review"] -= golden_lessons
            audit["linkageStates"]["mapped"] = (
                audit["linkageStates"].get("mapped", 0) + golden_lessons
            )
            audit["linkageStates"] = {
                state: count
                for state, count in sorted(audit["linkageStates"].items())
                if count
            }
    payload = {
        "packageId": package["packageId"],
        "title": package["title"],
        "publisher": package["publisher"],
        "countryCode": package["countryCode"],
        "jurisdictionCode": package["jurisdictionCode"],
        "edition": package["edition"],
        "packageRevision": package_revision(package),
        "effectiveFrom": package.get("effectiveFrom"),
        "effectiveTo": package.get("effectiveTo"),
        "sourceUrl": package["sourceUrl"],
        "sourceSha256": package["sourceSha256"],
        "datasetSha256": baseline_digest,
        "rightsBasis": package["rightsBasis"],
        "attribution": package["attribution"],
        "modificationNotice": package["modificationNotice"],
        "framework": package["framework"],
        "nodeKinds": ["theme", "topic", "subtopic", "performance_objective"],
        "courses": [
            {
                "courseKey": course["courseKey"],
                "title": course["title"],
                "subject": course["subject"],
                "gradeSystemCode": course["gradeSystemCode"],
                "gradeSystemVersion": course["gradeSystemVersion"],
                "gradeLevelCode": course["gradeLevelCode"],
                "nodes": nodes,
                "objectives": objectives,
                "knowledgeComponents": knowledge_components,
                "prerequisites": [],
                "sourceLinks": source_links,
                "uncoveredObjectiveCodes": gaps,
            }
        ],
        "integrity": audit,
    }
    if revision_overlay is not None:
        payload["revisionOverlaySha256"] = hashlib.sha256(
            canonical_json(revision_overlay)
        ).hexdigest()
        payload["integrity"] = {**audit, **revision_integrity}
    if package.get("licence") is not None:
        payload["licence"] = package["licence"]
    return payload


def apply_golden_lesson_reviews(
    nodes: list[dict[str, Any]],
    objectives: list[dict[str, Any]],
    source_links: list[dict[str, Any]],
    overlay: dict[str, Any],
) -> int:
    reviews = required_list(
        overlay.get("goldenLessonReviews") or [], "golden lesson reviews"
    )
    nodes_by_code = {node["code"]: node for node in nodes}
    objectives_by_code = {objective["code"]: objective for objective in objectives}
    links_by_objective: dict[str, set[str]] = {}
    all_linked_records: set[str] = set()
    for link in source_links:
        all_linked_records.add(link["recordId"])
        if link["targetKind"] == "objective":
            links_by_objective.setdefault(link["targetCode"], set()).add(
                link["recordId"]
            )

    reviewed_nodes: set[str] = set()
    for review in reviews:
        review_id = required_text(review.get("reviewId"), "golden review id")
        node_code = required_text(review.get("subtopicCode"), "golden subtopic code")
        if node_code in reviewed_nodes:
            raise ValueError(f"Duplicate golden review for subtopic: {node_code}")
        reviewed_nodes.add(node_code)
        node = nodes_by_code.get(node_code)
        if node is None or node.get("kind") != "subtopic":
            raise ValueError(f"Golden review refers to unknown subtopic: {node_code}")
        content_review = node["sourcePayload"].get("contentReview")
        if not isinstance(content_review, dict) or content_review.get("state") != "needs_review":
            raise ValueError(
                f"Golden review {review_id} must resolve an existing needs_review state."
            )
        if review.get("state") != "approved" or review.get("resolution") != "mapped":
            raise ValueError(
                f"Golden review {review_id} must be approved with a mapped resolution."
            )
        required_text(review.get("rationale"), "golden review rationale")
        source_topic_code = required_text(
            review.get("sourceTopicCode"), "golden review source topic"
        )
        source_page = review.get("physicalPageNumber")
        if not isinstance(source_page, int) or source_page < 1:
            raise ValueError("Golden review source page must be a positive integer.")

        objective_codes = clean_text_list(
            review.get("approvedObjectiveCodes"), "golden objective codes"
        )
        record_ids = set(
            clean_text_list(
                review.get("approvedSourceRecordIds"), "golden source records"
            )
        )
        linked_records: set[str] = set()
        for objective_code in objective_codes:
            objective = objectives_by_code.get(objective_code)
            if objective is None or not objective_belongs_to_node(
                objective["nodeCode"], node_code, nodes_by_code
            ):
                raise ValueError(
                    f"Golden review {review_id} contains an objective outside its subtopic: {objective_code}"
                )
            linked_records.update(links_by_objective.get(objective_code, set()))
        if linked_records != record_ids:
            raise ValueError(
                f"Golden review {review_id} source records must exactly match its approved objective links."
            )

        excluded_records = set(
            clean_text_list(
                review.get("excludedSourceRecordIds"), "golden excluded source records"
            )
        )
        if excluded_records & all_linked_records:
            raise ValueError(
                f"Golden review {review_id} includes an excluded record in the package links."
            )
        rubric = review.get("rubric")
        if not isinstance(rubric, dict):
            raise ValueError(f"Golden review {review_id} must contain its review rubric.")
        for criterion in (
            "objectiveAlignment",
            "curriculumScope",
            "mathematicalCorrectness",
            "pedagogicalUsefulness",
        ):
            decision = rubric.get(criterion)
            if not isinstance(decision, dict) or decision.get("result") != "pass":
                raise ValueError(
                    f"Golden review {review_id} rubric criterion {criterion} must pass."
                )
            required_text(
                decision.get("rationale"), f"golden review {criterion} rationale"
            )

        content_review["state"] = "mapped"
        content_review["reasons"] = []
        content_review["categories"] = []
        content_review["resolution"] = {
            "reviewId": review_id,
            "sourceTopicCode": source_topic_code,
            "physicalPageNumber": source_page,
            "approvedObjectiveCodes": objective_codes,
            "approvedSourceRecordIds": sorted(record_ids),
            "excludedSourceRecordIds": sorted(excluded_records),
            "rationale": required_text(review.get("rationale"), "golden review rationale"),
            "rubric": rubric,
        }
    return len(reviewed_nodes)


def objective_belongs_to_node(
    objective_node_code: str,
    ancestor_code: str,
    nodes_by_code: dict[str, dict[str, Any]],
) -> bool:
    cursor: str | None = objective_node_code
    while cursor is not None:
        if cursor == ancestor_code:
            return True
        node = nodes_by_code.get(cursor)
        if node is None:
            return False
        cursor = node.get("parentCode")
    return False


def revision_source_link_corrections(
    overlay: dict[str, Any] | None,
) -> dict[tuple[str, str], str]:
    if overlay is None:
        return {}
    corrections: dict[tuple[str, str], str] = {}
    for correction in required_list(
        overlay.get("sourceLinkCorrections") or [], "source-link corrections"
    ):
        objective_code = required_text(
            correction.get("objectiveCode"), "source-link correction objective"
        )
        record_id = required_text(
            correction.get("recordId"), "source-link correction record"
        )
        if correction.get("reviewState") != "approved":
            raise ValueError(
                f"Source-link correction {objective_code}/{record_id} must be approved."
            )
        rationale = required_text(
            correction.get("rationale"), "source-link correction rationale"
        )
        required_text(correction.get("reason"), "source-link correction reason")
        key = (objective_code, record_id)
        if key in corrections:
            raise ValueError(
                f"Duplicate source-link correction: {objective_code}/{record_id}"
            )
        corrections[key] = rationale
    return corrections


def apply_revision_overlay(
    nodes: list[dict[str, Any]],
    donor_topic_codes: set[str],
    overlay: dict[str, Any],
    metadata: dict[str, Any],
    baseline_digest: str,
) -> dict[str, int]:
    """Bind a reviewed curriculum edition to stable donor planning nodes.

    The overlay is intentionally additive. It records how source topics map to
    the more granular planning structure without rewriting identifiers or
    mutating the donor files.
    """

    if overlay.get("schemaVersion") != 1:
        raise ValueError("Revision overlay schemaVersion must be 1.")
    if overlay.get("baselineDatasetSha256") != baseline_digest:
        raise ValueError("Revision overlay does not match the donor dataset digest.")

    source = overlay.get("source")
    if not isinstance(source, dict):
        raise ValueError("Revision overlay must identify its source.")
    package = metadata.get("package")
    if not isinstance(package, dict):
        raise ValueError("Release metadata must contain a package object.")
    source_contract = {
        "url": package.get("sourceUrl"),
        "sha256": package.get("sourceSha256"),
        "edition": package.get("edition"),
    }
    if source != source_contract:
        raise ValueError(
            "Revision overlay source identity must match the release package source."
        )

    source_topics = required_list(overlay.get("sourceTopics"), "revision source topics")
    if not source_topics:
        raise ValueError("Revision overlay must contain source topics.")

    topic_nodes = {
        node["code"]: node for node in nodes if node.get("kind") == "topic"
    }
    seen_source_codes: set[str] = set()
    seen_target_codes: set[str] = set()
    seen_physical_pages: set[int] = set()

    for source_topic in source_topics:
        source_code = required_text(
            source_topic.get("sourceTopicCode"), "revision source-topic code"
        )
        if source_code in seen_source_codes:
            raise ValueError(f"Duplicate revision source-topic code: {source_code}")
        seen_source_codes.add(source_code)

        source_page_labels = clean_text_list(
            source_topic.get("sourcePageLabels"), "revision source-page labels"
        )
        physical_pages = required_list(
            source_topic.get("physicalPageNumbers"),
            "revision physical-page numbers",
        )
        if len(source_page_labels) != len(physical_pages) or not physical_pages:
            raise ValueError(
                f"Revision source topic {source_code} must pair every page label with a physical page."
            )
        if any(not isinstance(page, int) or page < 1 for page in physical_pages):
            raise ValueError("Revision physical-page numbers must be positive integers.")
        duplicate_pages = seen_physical_pages.intersection(physical_pages)
        if duplicate_pages:
            raise ValueError(
                "Revision physical pages may belong to only one source topic: "
                + ", ".join(str(page) for page in sorted(duplicate_pages))
            )
        seen_physical_pages.update(physical_pages)

        mapping_kind = required_text(
            source_topic.get("mappingKind"), "revision mapping kind"
        )
        if mapping_kind not in {"retained", "split"}:
            raise ValueError(f"Unsupported revision mapping kind: {mapping_kind}")
        review = source_topic.get("mappingReview")
        if not isinstance(review, dict) or review.get("state") != "approved":
            raise ValueError(
                f"Revision mapping {source_code} must be approved before release."
            )
        required_text(review.get("rationale"), "revision mapping-review rationale")

        target_codes = clean_text_list(
            source_topic.get("targetTopicCodes"), "revision target-topic codes"
        )
        if not target_codes:
            raise ValueError(f"Revision source topic {source_code} has no planning target.")
        if mapping_kind == "retained" and len(target_codes) != 1:
            raise ValueError("A retained revision topic must map to one planning topic.")
        if mapping_kind == "split" and len(target_codes) < 2:
            raise ValueError("A split revision topic must map to multiple planning topics.")

        alignment = {
            "sourceTopicCode": source_code,
            "sourceTitle": required_text(source_topic.get("title"), "source topic title"),
            "sourceTheme": required_text(source_topic.get("theme"), "source theme title"),
            "sourcePageLabels": source_page_labels,
            "physicalPageNumbers": physical_pages,
            "mappingKind": mapping_kind,
            "learningOutcome": required_text(
                source_topic.get("learningOutcome"), "source learning outcome"
            ),
            "focalCompetency": required_text(
                source_topic.get("focalCompetency"), "source focal competency"
            ),
            "performanceObjectives": clean_text_list(
                source_topic.get("performanceObjectives"),
                "source performance objectives",
            ),
            "contentKnowledgeAndSkills": required_text(
                source_topic.get("contentKnowledgeAndSkills"),
                "source content knowledge and skills",
            ),
            "keyCompetenciesAndValues": required_text(
                source_topic.get("keyCompetenciesAndValues"),
                "source key competencies and values",
            ),
            "learningActivities": required_text(
                source_topic.get("learningActivities"), "source learning activities"
            ),
            "teachingAndLearningResources": required_text(
                source_topic.get("teachingAndLearningResources"),
                "source teaching and learning resources",
            ),
            "evaluationGuide": required_text(
                source_topic.get("evaluationGuide"), "source evaluation guide"
            ),
        }
        for target_code in target_codes:
            if target_code in seen_target_codes:
                raise ValueError(
                    f"Revision planning topic is mapped more than once: {target_code}"
                )
            if target_code not in donor_topic_codes or target_code not in topic_nodes:
                raise ValueError(
                    f"Revision source topic {source_code} refers to unknown planning topic {target_code}."
                )
            seen_target_codes.add(target_code)
            topic_nodes[target_code]["sourcePayload"]["curriculumAlignment"] = alignment

    missing = sorted(donor_topic_codes - seen_target_codes)
    if missing:
        raise ValueError(
            "Revision overlay does not cover donor topics: " + ", ".join(missing)
        )
    unexpected = sorted(seen_target_codes - donor_topic_codes)
    if unexpected:
        raise ValueError(
            "Revision overlay contains unexpected donor topics: "
            + ", ".join(unexpected)
        )
    return {
        "sourceTopics": len(seen_source_codes),
        "sourcePages": len(seen_physical_pages),
    }


def package_node(
    code: str,
    parent_code: str | None,
    kind: str,
    title: str,
    statement: str | None,
    sequence: int,
    source_payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "code": code,
        "parentCode": parent_code,
        "kind": kind,
        "title": title,
        "statement": statement,
        "sequence": sequence,
        "sourcePayload": source_payload,
    }


def clean_text_list(value: object, label: str) -> list[str]:
    return [required_text(item, label) for item in required_list(value, label)]


def package_revision(package: dict[str, Any]) -> int:
    """Which graspy conversion of the publisher's edition this release is.

    The edition names what the publisher published, and is already pinned by
    sourceSha256. An improved conversion of an unchanged source is a new
    revision, and must say so: a package that keeps an edition and revision
    already installed is refused, by design, for the life of that installation.
    """
    revision = package.get("packageRevision", 1)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        raise ValueError("Release packageRevision must be a positive whole number.")
    return revision


def assert_release_metadata(metadata: dict[str, Any]) -> None:
    if metadata.get("redistributionApproved") is not True:
        raise ValueError(
            "Release export is blocked until source metadata records redistributionApproved=true."
        )
    package = metadata.get("package")
    course = metadata.get("course")
    if not isinstance(package, dict) or not isinstance(course, dict):
        raise ValueError("Release metadata must contain package and course objects.")
    for key in (
        "packageId",
        "title",
        "publisher",
        "countryCode",
        "jurisdictionCode",
        "edition",
        "sourceUrl",
        "sourceSha256",
        "attribution",
        "modificationNotice",
    ):
        required_text(package.get(key), f"release package {key}")
    if len(package["sourceSha256"]) != 64 or any(
        character not in "0123456789abcdef" for character in package["sourceSha256"]
    ):
        raise ValueError("Release sourceSha256 must be a lowercase SHA-256 value.")
    package_revision(package)
    rights_basis = package.get("rightsBasis")
    framework = package.get("framework")
    if not isinstance(rights_basis, dict) or not isinstance(framework, dict):
        raise ValueError("Release metadata must include rightsBasis and framework objects.")
    for key in ("kind", "name", "statement", "url"):
        required_text(rights_basis.get(key), f"release rights basis {key}")
    if rights_basis["kind"] not in {
        "licence",
        "officialText",
        "publicDomain",
        "permission",
    }:
        raise ValueError("Release rights basis kind is not supported.")
    licence = package.get("licence")
    if rights_basis["kind"] == "licence":
        if not isinstance(licence, dict):
            raise ValueError("A licensed release must include a licence object.")
        for key in ("id", "name", "url"):
            required_text(licence.get(key), f"release licence {key}")
        if licence["name"] != rights_basis["name"] or licence["url"] != rights_basis["url"]:
            raise ValueError("Release rightsBasis must match its named licence.")
    elif licence is not None:
        raise ValueError("A release without a licence must not include a licence object.")
    for key in ("name", "authority"):
        required_text(framework.get(key), f"release framework {key}")
    for key in (
        "courseKey",
        "title",
        "subject",
        "gradeSystemCode",
        "gradeSystemVersion",
        "gradeLevelCode",
    ):
        required_text(course.get(key), f"release course {key}")


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def curriculum_envelope(payload: dict[str, Any]) -> bytes:
    payload_bytes = canonical_json(payload)
    return canonical_json(
        {
            "payload": base64.b64encode(payload_bytes).decode("ascii"),
            "schemaVersion": 2,
            "signature": None,
        }
    )


def released_payload(path: Path) -> dict[str, Any] | None:
    """The payload already shipped at this path, if one is."""
    if not path.is_file():
        return None
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
        return json.loads(base64.b64decode(envelope["payload"]))
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError(f"The package already at {path} could not be read: {error}") from error


def assert_revision_is_free(path: Path, payload: dict[str, Any]) -> None:
    """Refuse to ship changed contents under an identity already released.

    A package whose edition and revision are already installed is refused for
    the life of that installation, so a conversion that changed without saying
    so has to be stopped here rather than on a teacher's machine.
    """
    previous = released_payload(path)
    if previous is None:
        return
    identity = ("packageId", "edition")
    released = tuple(previous.get(key) for key in identity)
    proposed = tuple(payload.get(key) for key in identity)
    if released != proposed:
        return
    released_revision = previous.get("packageRevision", 1)
    proposed_revision = payload.get("packageRevision", 1)
    if proposed_revision < released_revision:
        raise ValueError(
            f"{path} already ships revision {released_revision}, so writing revision "
            f"{proposed_revision} would replace it with an earlier conversion."
        )
    if proposed_revision != released_revision:
        return
    if canonical_json(previous) == canonical_json(payload):
        return
    raise ValueError(
        f"{path} already ships {released[0]} {released[1]} revision "
        f"{previous.get('packageRevision', 1)} with different contents. "
        "Raise packageRevision in the release metadata so the new conversion "
        "can install beside the one teachers already have."
    )


def write_bytes(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)


def main() -> None:
    arguments = parse_args()
    paths = DatasetPaths.from_root(arguments.dataset_root)
    valid_records = corpus_record_ids(arguments.corpus)
    revision_overlay = None
    if arguments.revision_overlay is not None:
        revision_overlay = read_json(arguments.revision_overlay)
        if not isinstance(revision_overlay, dict):
            raise ValueError("Revision overlay must be a JSON object.")
    audit = audit_dataset(
        paths,
        valid_records,
        revision_source_link_corrections(revision_overlay),
    )
    audit["datasetSha256"] = content_digest(
        paths.source_files(), arguments.dataset_root
    )
    audit_bytes = canonical_json(audit) + b"\n"
    if arguments.audit_output:
        write_bytes(arguments.audit_output, audit_bytes)
    else:
        print(audit_bytes.decode("utf-8"), end="")

    if arguments.output is None:
        return
    if arguments.metadata is None:
        raise ValueError("--metadata is required when --output is provided.")
    metadata = read_json(arguments.metadata)
    if not isinstance(metadata, dict):
        raise ValueError("Release metadata must be a JSON object.")
    payload = build_curriculum_payload(
        paths,
        valid_records,
        metadata,
        arguments.dataset_root,
        revision_overlay,
    )
    assert_revision_is_free(arguments.output, payload)
    write_bytes(arguments.output, curriculum_envelope(payload) + b"\n")


if __name__ == "__main__":
    main()
