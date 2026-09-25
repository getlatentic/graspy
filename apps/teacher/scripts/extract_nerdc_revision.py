# /// script
# requires-python = ">=3.12"
# dependencies = ["pdfplumber==0.11.7"]
# ///
"""Extract the reviewed NERDC JSS 1 Mathematics revision overlay.

The official PDF remains the source of truth. This tool verifies its digest,
extracts each curriculum table, and applies a reviewed mapping to the stable
planning-topic identifiers imported from plan-to-tutor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from scripts.export_curriculum_packages import DatasetPaths, content_digest
except ModuleNotFoundError:
    from export_curriculum_packages import DatasetPaths, content_digest


SOURCE_URL = "https://lmis.nerdcportals.com.ng/jss_1/necurrdc/2.pdf"
SOURCE_SHA256 = "278b771e2e41fa2101b6b11627eb3df8466cb5994bec457221de128eac7a26e6"
EDITION = "September 2025"


@dataclass(frozen=True)
class TopicMapping:
    code: str
    title: str
    theme: str
    pages: tuple[tuple[int, str], ...]
    target_codes: tuple[str, ...]
    rationale: str

    @property
    def mapping_kind(self) -> str:
        return "retained" if len(self.target_codes) == 1 else "split"


TOPIC_MAPPINGS = (
    TopicMapping("nerdc-2025-topic-01", "Whole Numbers", "Number and Numeration", ((14, "1"),), ("jss1-math-whole-numbers",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-02", "Lowest Common Multiples (LCM)", "Number and Numeration", ((15, "2"),), ("jss1-math-lcm",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-03", "Highest Common Factor (HCF)", "Number and Numeration", ((16, "3"),), ("jss1-math-hcf",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-04", "Counting in twos", "Number and Numeration", ((17, "4"),), ("jss1-math-counting-in-base-2",), "The existing planning topic contains the matching Counting in groups of twos subtopic."),
    TopicMapping("nerdc-2025-topic-05", "Conversion of Base-ten numerals to Binary numbers", "Number and Numeration", ((18, "5"),), ("jss1-math-conversion-of-base-10-numerals-to-binary-numbers",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-06", "Fractions", "Number and Numeration", ((19, "6"),), ("jss1-math-fractions",), "The existing planning topic is a granular decomposition of the revised Fractions topic."),
    TopicMapping("nerdc-2025-topic-07", "Addition and Subtraction", "Basic Operations", ((20, "7"),), ("jss1-math-addition-and-subtraction",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-08", "Addition and Subtraction of Fractions", "Basic Operations", ((21, "8"),), ("jss1-math-addition-and-subtraction-of-fractions",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-09", "Multiplication and Division of Fractions", "Basic Operations", ((22, "9"),), ("jss1-math-multiplications-and-divisions-of-fractions",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-10", "Estimation", "Basic Operations", ((23, "10"),), ("jss1-math-estimation",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-11", "Approximation", "Basic Operations", ((24, "11"),), ("jss1-math-approximation",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-12", "Addition of numbers in base 2", "Basic Operations", ((25, "12"),), ("jss1-math-addition-of-numbers-in-base-2-numerals",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-13", "Subtraction of numbers in base 2", "Basic Operations", ((26, "13"),), ("jss1-math-subtraction-of-numbers-in-base-2-numerals",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-14", "Multiplication of numbers in base 2", "Basic Operations", ((27, "14"),), ("jss1-math-multiplication-of-numbers-in-base-2-numerals",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-15", "Use of Symbols", "Algebraic Processes", ((28, "15"), (29, "16")), ("jss1-math-use-of-symbols",), "The source continues one topic across two pages; both pages map to the existing planning topic."),
    TopicMapping("nerdc-2025-topic-16", "Simplification of Algebraic Expressions", "Algebraic Processes", ((30, "17"),), ("jss1-math-simplification-of-algebraic-expressions",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-17", "Simple Equations", "Algebraic Processes", ((31, "18"),), ("jss1-math-simple-equations",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-18", "Plane Shapes", "Mensuration and Geometry", ((32, "20"),), ("jss1-math-plane-shapes",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-19", "Three dimensional Figures", "Mensuration and Geometry", ((33, "21"),), ("jss1-math-three-dimensional-figures",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-20", "Construction", "Mensuration and Geometry", ((34, "22"),), ("jss1-math-construction",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-21", "Angles", "Mensuration and Geometry", ((35, "23"),), ("jss1-math-angles",), "The revised source topic retains the existing planning topic."),
    TopicMapping("nerdc-2025-topic-22", "Need for statistics", "Everyday Statistics", ((36, "24"),), ("jss1-math-need-for-statistics", "jss1-math-data-collection"), "The revised topic includes both the purposes of statistics and data collection; Graspy keeps those as separate planning topics for lesson sequencing."),
    TopicMapping("nerdc-2025-topic-23", "Data representation", "Everyday Statistics", ((37, "25"),), ("jss1-math-data-presentation",), "The revised median objective aligns with the existing data-presentation planning topic."),
)


SOURCE_LINK_CORRECTIONS = (
    (
        "fractions-to-decimals-ao-convert-decimals-to-fractions",
        "ch04-b039",
        "This worked example directly demonstrates converting a decimal to a common fraction.",
    ),
    *(
        (
            "fractions-to-decimals-ao-convert-decimals-to-fractions",
            record_id,
            "This exercise directly assesses converting a decimal to a common fraction.",
        )
        for record_id in ("ch04-b040-i01", "ch04-b040-i02", "ch04-b040-i03")
    ),
    *(
        (
            "fractions-to-decimals-ao-convert-fractions-to-decimals",
            record_id,
            "This exercise directly assesses converting a common fraction to a decimal.",
        )
        for record_id in ("ch04-b042-i01", "ch04-b042-i02", "ch04-b042-i03")
    ),
    (
        "fractions-to-decimals-ao-convert-fractions-to-decimals",
        "ch04-b044",
        "This worked example directly demonstrates converting a common fraction to a decimal.",
    ),
    *(
        (
            "fractions-to-decimals-ao-convert-fractions-to-decimals",
            record_id,
            "This exercise directly assesses converting a common fraction to a decimal.",
        )
        for record_id in ("ch04-b045-i01", "ch04-b045-i02", "ch04-b045-i03")
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def normalized_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.replace("\u0000", "").split())


def without_label(value: str, label: str) -> str:
    head, separator, tail = value.partition(":")
    if not separator or label.lower() not in head.lower():
        raise ValueError(f"Expected {label} label in extracted text: {value[:80]}")
    return normalized_text(tail)


def extract_page(pdf: Any, physical_page: int) -> dict[str, str]:
    tables = pdf.pages[physical_page - 1].extract_tables()
    candidates = [table for table in tables if len(table) >= 5 and len(table[4]) >= 7]
    if len(candidates) != 1:
        raise ValueError(
            f"Physical page {physical_page} must contain exactly one seven-column curriculum table."
        )
    table = candidates[0]
    return {
        "learningOutcome": without_label(normalized_text(table[1][0]), "learning outcome"),
        "focalCompetency": without_label(normalized_text(table[2][0]), "focal competency"),
        "performanceObjectives": normalized_text(table[4][1]),
        "contentKnowledgeAndSkills": normalized_text(table[4][2]),
        "keyCompetenciesAndValues": normalized_text(table[4][3]),
        "learningActivities": normalized_text(table[4][4]),
        "teachingAndLearningResources": normalized_text(table[4][5]),
        "evaluationGuide": normalized_text(table[4][6]),
    }


def combine_pages(records: list[dict[str, str]]) -> dict[str, Any]:
    combined: dict[str, Any] = {}
    for key in records[0]:
        values = list(dict.fromkeys(record[key] for record in records if record[key]))
        if key == "performanceObjectives":
            combined[key] = values
        else:
            combined[key] = "\n\n".join(values)
    return combined


def build_overlay(pdf_path: Path, dataset_root: Path) -> dict[str, Any]:
    import pdfplumber

    if hashlib.sha256(pdf_path.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError("The NERDC PDF does not match the reviewed source digest.")
    paths = DatasetPaths.from_root(dataset_root)
    baseline_digest = content_digest(paths.source_files(), dataset_root)
    source_topics: list[dict[str, Any]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for mapping in TOPIC_MAPPINGS:
            extracted = combine_pages(
                [extract_page(pdf, physical) for physical, _ in mapping.pages]
            )
            source_topics.append(
                {
                    "sourceTopicCode": mapping.code,
                    "title": mapping.title,
                    "theme": mapping.theme,
                    "sourcePageLabels": [label for _, label in mapping.pages],
                    "physicalPageNumbers": [physical for physical, _ in mapping.pages],
                    "targetTopicCodes": list(mapping.target_codes),
                    "mappingKind": mapping.mapping_kind,
                    "mappingReview": {
                        "state": "approved",
                        "rationale": mapping.rationale,
                    },
                    **extracted,
                }
            )
    return {
        "schemaVersion": 1,
        "baselineDatasetSha256": baseline_digest,
        "source": {"url": SOURCE_URL, "sha256": SOURCE_SHA256, "edition": EDITION},
        "sourceTopics": source_topics,
        "sourceLinkCorrections": [
            {
                "objectiveCode": objective_code,
                "recordId": record_id,
                "reviewState": "approved",
                "rationale": rationale,
                "reason": "The donor link omitted its rationale; the linked textbook record directly matches the named objective.",
            }
            for objective_code, record_id, rationale in SOURCE_LINK_CORRECTIONS
        ],
        "goldenLessonReviews": [
            {
                "reviewId": "ordering-fractions-september-2025-v1",
                "subtopicCode": "jss1-math-fractions-ordering-of-fractions",
                "sourceTopicCode": "nerdc-2025-topic-06",
                "physicalPageNumber": 19,
                "state": "approved",
                "resolution": "mapped",
                "approvedObjectiveCodes": [
                    "ordering-of-fractions-ao-arrange-ascending",
                    "ordering-of-fractions-ao-arrange-descending",
                ],
                "approvedSourceRecordIds": [
                    "ch04-b032",
                    "ch04-b033-i01",
                    "ch04-b033-i02",
                ],
                "excludedSourceRecordIds": ["ch04-b033-i03"],
                "rationale": "The revised curriculum explicitly requires ascending and descending ordering. The approved records directly demonstrate or assess those two objectives; the mixed-scope exercise is excluded because it also tests equivalence and improper-fraction reasoning.",
                "rubric": {
                    "objectiveAlignment": {
                        "result": "pass",
                        "rationale": "Every retained record directly targets ascending or descending ordering.",
                    },
                    "curriculumScope": {
                        "result": "pass",
                        "rationale": "The lesson remains within the revised Fractions performance objective on ordering by magnitude.",
                    },
                    "mathematicalCorrectness": {
                        "result": "pass",
                        "rationale": "The worked ordering and both expected answers use valid common-denominator comparisons.",
                    },
                    "pedagogicalUsefulness": {
                        "result": "pass",
                        "rationale": "The sequence contains a worked ascending example followed by direct ascending and descending practice.",
                    },
                },
            }
        ],
    }


def main() -> None:
    arguments = parse_args()
    overlay = build_overlay(arguments.pdf, arguments.dataset_root)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(overlay, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
