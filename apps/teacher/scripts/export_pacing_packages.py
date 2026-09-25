"""Audit and export deterministic Graspy pacing packages.

The structured donor scheme contains teaching rows only. This exporter joins it
to the complete source tables so revision, test, examination, and vacation
weeks remain visible and week numbering stays consecutive.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
from collections import Counter
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

try:
    from scripts.export_curriculum_packages import (
        DatasetPaths,
        canonical_json,
        clean_text_list,
        content_digest,
        donor_path,
        load_dataset,
        require_source_paths,
        required_list,
        required_text,
    )
except ModuleNotFoundError:
    from export_curriculum_packages import (  # type: ignore[no-redef]
        DatasetPaths,
        canonical_json,
        clean_text_list,
        content_digest,
        donor_path,
        load_dataset,
        require_source_paths,
        required_list,
        required_text,
    )


TERM_SOURCES = (
    (
        "First Term",
        1,
        "First term",
        "JSS1 Lagos State Math Scheme-of-Work - 1st Term.md",
    ),
    (
        "Second Term",
        2,
        "Second term",
        "JSS1 Lagos State Math Scheme-of-Work - 2nd Term.md",
    ),
    (
        "Third Term",
        3,
        "Third term",
        "JSS1 Lagos State Math Scheme-of-Work - 3rd Term.md",
    ),
)

WEEK_NUMBER = re.compile(r"^\s*(\d+)(?:\s*[-–]\s*(\d+))?")


@dataclass(frozen=True)
class PacingPaths:
    structured_scheme: Path
    source_directory: Path
    curriculum: DatasetPaths

    @classmethod
    def from_root(cls, root: Path) -> "PacingPaths":
        return cls(
            structured_scheme=root / "scheme-of-work/jss1_scheme.json",
            source_directory=root / "scheme-of-work",
            curriculum=DatasetPaths.from_root(root),
        )

    def source_files(self) -> list[Path]:
        return [
            self.structured_scheme,
            *[
                self.source_directory / file_name
                for _, _, _, file_name in TERM_SOURCES
            ],
            self.curriculum.topics,
            *sorted(
                path
                for path in self.curriculum.linkage_directory.glob("*.json")
                if path.name not in {"manifest.json", "review_triage.json"}
            ),
        ]


@dataclass(frozen=True)
class SourceWeek:
    ordinal: int
    topic: str
    breakdown: str


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[list[list[str]]] = []
        self._table_depth = 0
        self._row: list[str] | None = None
        self._cell: list[str] | None = None
        self._current_table: list[list[str]] | None = None

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        del attrs
        if tag == "table":
            self._table_depth += 1
            if self._table_depth == 1:
                self._current_table = []
        elif self._table_depth == 1 and tag == "tr":
            self._row = []
        elif self._table_depth == 1 and tag in {"td", "th"}:
            self._cell = []
        elif self._cell is not None and tag == "br":
            self._cell.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self._table_depth == 1 and tag in {"td", "th"} and self._cell is not None:
            if self._row is not None:
                self._row.append(" ".join("".join(self._cell).split()))
            self._cell = None
        elif self._table_depth == 1 and tag == "tr" and self._row is not None:
            if self._current_table is not None:
                self._current_table.append(self._row)
            self._row = None
        elif tag == "table" and self._table_depth:
            if self._table_depth == 1 and self._current_table is not None:
                self.tables.append(self._current_table)
                self._current_table = None
            self._table_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-root", type=Path, default=donor_path("dataset/processed")
    )
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--output-directory", type=Path)
    parser.add_argument("--audit-output", type=Path)
    arguments = parser.parse_args()
    require_source_paths(parser, arguments, "dataset_root")
    return arguments


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"Required pacing source is missing: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Pacing source is not valid JSON: {path}") from error


def parse_source_weeks(path: Path) -> list[SourceWeek]:
    try:
        contents = path.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise ValueError(f"Required pacing table is missing: {path}") from error
    parser = TableParser()
    parser.feed(contents)
    if not parser.tables:
        raise ValueError(f"Pacing table contains no HTML table: {path}")

    weeks: list[SourceWeek] = []
    for row in parser.tables[0]:
        if not row:
            continue
        match = WEEK_NUMBER.match(row[0])
        if match is None:
            continue
        first = int(match.group(1))
        last = int(match.group(2) or first)
        if last < first:
            raise ValueError(f"Pacing week range is reversed in {path}: {row[0]}")
        topic = " ".join((row[1] if len(row) > 1 else "").split())
        if not topic:
            topic = " ".join(row[0][match.end() :].split())
        breakdown = " ".join((row[2] if len(row) > 2 else "").split())
        for ordinal in range(first, last + 1):
            expanded_topic = expanded_week_title(topic, first, last, ordinal)
            weeks.append(SourceWeek(ordinal, expanded_topic, breakdown))

    ordinals = [week.ordinal for week in weeks]
    if not ordinals or ordinals != list(range(1, max(ordinals) + 1)):
        raise ValueError(f"Pacing table weeks must be consecutive from 1: {path}")
    return weeks


def expanded_week_title(topic: str, first: int, last: int, ordinal: int) -> str:
    normalized = " ".join(topic.split())
    if first == last:
        return normalized
    upper = normalized.upper()
    if "EXAMINATION" in upper and "VACATION" in upper:
        if ordinal == last:
            return "Vacation"
        return "Examination"
    return normalized


def non_teaching_kind(title: str) -> str:
    upper = title.upper()
    if "VACATION" in upper or "BREAK" in upper or "HOLIDAY" in upper:
        return "break"
    if "TEST" in upper:
        return "test"
    if "REVISION" in upper or "REVIEW" in upper:
        return "revision"
    if "EXAMINATION" in upper or re.search(r"\bEXAM\b", upper):
        return "examination"
    raise ValueError(f"Non-teaching week has no supported purpose: {title}")


def build_week_contracts(paths: PacingPaths) -> dict[str, list[dict[str, Any]]]:
    structured = read_json(paths.structured_scheme)
    if not isinstance(structured, dict):
        raise ValueError("Structured pacing source must be an object keyed by term.")
    contracts: dict[str, list[dict[str, Any]]] = {}
    for source_name, ordinal, display_name, file_name in TERM_SOURCES:
        source_weeks = parse_source_weeks(paths.source_directory / file_name)
        structured_weeks = required_list(
            structured.get(source_name), f"{source_name} teaching weeks"
        )
        teaching_by_week: dict[int, list[dict[str, Any]]] = {}
        for week in structured_weeks:
            week_number = week.get("week")
            if not isinstance(week_number, int) or week_number < 1:
                raise ValueError(f"{source_name} has an invalid teaching week number.")
            if week_number in teaching_by_week:
                raise ValueError(f"{source_name} repeats teaching week {week_number}.")
            teaching_by_week[week_number] = required_list(
                week.get("breakdown"), f"{source_name} week {week_number} entries"
            )

        source_ordinals = {week.ordinal for week in source_weeks}
        if not set(teaching_by_week) <= source_ordinals:
            raise ValueError(f"{source_name} teaching data contains a week absent from its source table.")
        term_weeks: list[dict[str, Any]] = []
        for source_week in source_weeks:
            entries = teaching_by_week.get(source_week.ordinal, [])
            kind = "teaching" if entries else non_teaching_kind(source_week.topic)
            term_weeks.append(
                {
                    "ordinal": source_week.ordinal,
                    "kind": kind,
                    "title": source_week.topic or display_name,
                    "sourceBreakdown": source_week.breakdown,
                    "entries": entries,
                }
            )
        contracts[source_name] = term_weeks
    return contracts


def audit_pacing(paths: PacingPaths) -> dict[str, Any]:
    contracts = build_week_contracts(paths)
    term_audits: list[dict[str, Any]] = []
    total_entries = 0
    all_kinds: Counter[str] = Counter()
    for source_name, ordinal, display_name, _ in TERM_SOURCES:
        weeks = contracts[source_name]
        kind_counts = Counter(week["kind"] for week in weeks)
        entry_count = sum(len(week["entries"]) for week in weeks)
        total_entries += entry_count
        all_kinds.update(kind_counts)
        term_audits.append(
            {
                "ordinal": ordinal,
                "name": display_name,
                "weeks": len(weeks),
                "teachingEntries": entry_count,
                "weekKinds": dict(sorted(kind_counts.items())),
            }
        )
    return {
        "terms": term_audits,
        "teachingEntries": total_entries,
        "weekKinds": dict(sorted(all_kinds.items())),
    }


def build_pacing_payloads(
    paths: PacingPaths,
    metadata: dict[str, Any],
    dataset_root: Path,
) -> dict[int, dict[str, Any]]:
    assert_release_metadata(metadata)
    contracts = build_week_contracts(paths)
    _, topics, _, linkage_rows = load_dataset(paths.curriculum)
    subtopics: dict[str, tuple[str, dict[str, Any]]] = {}
    for topic in topics:
        topic_title = required_text(topic.get("topic"), "topic title")
        for subtopic in required_list(topic.get("subtopics"), "topic subtopics"):
            subtopic_id = required_text(subtopic.get("subtopic_id"), "subtopic id")
            subtopics[subtopic_id] = (topic_title, subtopic)
    linkage_by_subtopic = {row["subtopic_id"]: row for row in linkage_rows}

    common = metadata["package"]
    payloads: dict[int, dict[str, Any]] = {}
    digest = content_digest(paths.source_files(), dataset_root)
    for source_name, ordinal, display_name, _ in TERM_SOURCES:
        weeks: list[dict[str, Any]] = []
        for week in contracts[source_name]:
            entries: list[dict[str, Any]] = []
            for sequence, raw_entry in enumerate(week["entries"], start=1):
                subtopic_id = required_text(
                    raw_entry.get("subtopic_id"), "pacing entry curriculum node"
                )
                if subtopic_id not in subtopics:
                    raise ValueError(
                        f"Pacing entry refers to unknown curriculum node {subtopic_id}."
                    )
                topic_title, subtopic = subtopics[subtopic_id]
                linkage = linkage_by_subtopic[subtopic_id]
                atomic = required_list(
                    linkage.get("atomic_objectives") or [], "atomic objectives"
                )
                objective_codes = [
                    required_text(objective.get("ao_id"), "atomic objective id")
                    for objective in atomic
                ]
                source_records = source_records_for_linkage(linkage)
                entries.append(
                    {
                        "sequence": sequence,
                        "topic": topic_title,
                        "subtopic": required_text(
                            raw_entry.get("title"), "pacing entry title"
                        ),
                        "curriculumUnit": topic_title,
                        "curriculumNodeCode": subtopic_id,
                        "objectiveCodes": objective_codes,
                        "sourceRecordIds": source_records,
                        "learningOutcomes": clean_text_list(
                            subtopic.get("performance_objectives"),
                            "performance objectives",
                        ),
                        "objectives": [
                            required_text(
                                objective.get("text"), "atomic objective statement"
                            )
                            for objective in atomic
                        ],
                        "assessment": clean_text_list(
                            subtopic.get("evaluation_guide"), "evaluation guide"
                        ),
                        "materials": clean_text_list(
                            subtopic.get("teaching_learning_materials"),
                            "teaching materials",
                        ),
                        "notes": None,
                    }
                )
            weeks.append(
                {
                    "ordinal": week["ordinal"],
                    "kind": week["kind"],
                    "title": release_week_title(
                        metadata,
                        ordinal,
                        week["ordinal"],
                        week["title"],
                    ),
                    "entries": entries,
                }
            )
        payloads[ordinal] = {
            "packageId": f"{common['packageId']}.term-{ordinal}",
            "title": f"{common['title']} · {display_name}",
            "publisher": common["publisher"],
            "jurisdiction": common["jurisdiction"],
            "edition": common["edition"],
            "sourceUrl": common["sourceUrl"],
            "sourceSha256": common["sourceSha256"],
            "datasetSha256": digest,
            "rightsBasis": common["rightsBasis"],
            "attribution": common["attribution"],
            "modificationNotice": common["modificationNotice"],
            "subject": metadata["course"]["subject"],
            "gradeLevelCode": metadata["course"]["gradeLevelCode"],
            "curriculumPackageId": metadata["curriculum"]["packageId"],
            "curriculumCourseKey": metadata["curriculum"]["courseKey"],
            "period": {"ordinal": ordinal, "kind": "term", "name": display_name},
            "weeks": weeks,
        }
        if common.get("licence") is not None:
            payloads[ordinal]["licence"] = common["licence"]
    return payloads


def source_records_for_linkage(linkage: dict[str, Any]) -> list[str]:
    records: list[str] = []
    seen: set[str] = set()
    for value in linkage.get("shared_foundation_record_ids") or []:
        record_id = required_text(value, "shared source record")
        if record_id not in seen:
            seen.add(record_id)
            records.append(record_id)
    for objective in linkage.get("atomic_objectives") or []:
        for link in objective.get("record_links") or []:
            record_id = required_text(link.get("record_id"), "objective source record")
            if record_id not in seen:
                seen.add(record_id)
                records.append(record_id)
    return records


def release_week_title(
    metadata: dict[str, Any],
    term_ordinal: int,
    week_ordinal: int,
    source_title: str,
) -> str:
    corrections = {
        (correction["termOrdinal"], correction["weekOrdinal"]): correction
        for correction in metadata.get("weekTitleCorrections", [])
    }
    correction = corrections.get((term_ordinal, week_ordinal))
    title = source_title
    if correction is not None:
        if correction["sourceTitle"] != source_title:
            raise ValueError(
                "A pacing week-title correction no longer matches its source text."
            )
        title = correction["title"]
    if not title or len(title) > 100:
        raise ValueError(
            f"Term {term_ordinal} week {week_ordinal} needs an explicit "
            "week-title correction between 1 and 100 characters."
        )
    return title


def assert_release_metadata(metadata: dict[str, Any]) -> None:
    if metadata.get("redistributionApproved") is not True:
        raise ValueError(
            "Release export is blocked until source metadata records redistributionApproved=true."
        )
    package = metadata.get("package")
    course = metadata.get("course")
    curriculum = metadata.get("curriculum")
    if not all(isinstance(value, dict) for value in (package, course, curriculum)):
        raise ValueError(
            "Release metadata must contain package, course, and curriculum objects."
        )
    for key in (
        "packageId",
        "title",
        "publisher",
        "jurisdiction",
        "edition",
        "sourceUrl",
        "sourceSha256",
        "attribution",
        "modificationNotice",
    ):
        required_text(package.get(key), f"pacing package {key}")
    if len(package["sourceSha256"]) != 64 or any(
        character not in "0123456789abcdef" for character in package["sourceSha256"]
    ):
        raise ValueError("Pacing sourceSha256 must be a lowercase SHA-256 value.")
    rights_basis = package.get("rightsBasis")
    if not isinstance(rights_basis, dict):
        raise ValueError("Pacing metadata must include a rightsBasis object.")
    for key in ("kind", "name", "statement", "url"):
        required_text(rights_basis.get(key), f"pacing rights basis {key}")
    if rights_basis["kind"] not in {
        "licence",
        "officialText",
        "publicDomain",
        "permission",
    }:
        raise ValueError("Pacing rights basis kind is not supported.")
    licence = package.get("licence")
    if rights_basis["kind"] == "licence":
        if not isinstance(licence, dict):
            raise ValueError("Licensed pacing metadata must include a licence object.")
        for key in ("id", "name", "url"):
            required_text(licence.get(key), f"pacing licence {key}")
        if licence["name"] != rights_basis["name"] or licence["url"] != rights_basis["url"]:
            raise ValueError("Pacing rightsBasis must match its named licence.")
    elif licence is not None:
        raise ValueError("Pacing metadata without a licence must not include a licence object.")
    for key in ("subject", "gradeLevelCode"):
        required_text(course.get(key), f"pacing course {key}")
    for key in ("packageId", "courseKey"):
        required_text(curriculum.get(key), f"pacing curriculum {key}")
    corrections = metadata.get("weekTitleCorrections", [])
    if not isinstance(corrections, list):
        raise ValueError("Pacing weekTitleCorrections must be a list.")
    correction_keys: set[tuple[int, int]] = set()
    for correction in corrections:
        if not isinstance(correction, dict):
            raise ValueError("Each pacing week-title correction must be an object.")
        term_ordinal = correction.get("termOrdinal")
        week_ordinal = correction.get("weekOrdinal")
        if not isinstance(term_ordinal, int) or term_ordinal not in {1, 2, 3}:
            raise ValueError("A pacing week-title correction has an invalid term.")
        if not isinstance(week_ordinal, int) or week_ordinal < 1:
            raise ValueError("A pacing week-title correction has an invalid week.")
        key = (term_ordinal, week_ordinal)
        if key in correction_keys:
            raise ValueError("A pacing week-title correction is duplicated.")
        correction_keys.add(key)
        required_text(correction.get("sourceTitle"), "source week title")
        title = required_text(correction.get("title"), "corrected week title")
        if len(title) > 100:
            raise ValueError("A corrected pacing week title exceeds 100 characters.")


def pacing_envelope(payload: dict[str, Any]) -> bytes:
    return canonical_json(
        {
            "payload": base64.b64encode(canonical_json(payload)).decode("ascii"),
            "schemaVersion": 3,
            "signature": None,
        }
    )


def assert_edition_is_free(path: Path, payload: dict[str, Any]) -> None:
    """Refuse to ship changed contents under an edition already released.

    A scheme package whose identity and edition are already installed is
    refused for the life of that installation, and a scheme has no revision to
    fall back on, so the edition itself has to move.
    """
    if not path.is_file():
        return
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
        previous = json.loads(base64.b64decode(envelope["payload"]))
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError(f"The package already at {path} could not be read: {error}") from error
    identity = ("packageId", "edition")
    if tuple(previous.get(key) for key in identity) != tuple(
        payload.get(key) for key in identity
    ):
        return
    if canonical_json(previous) == canonical_json(payload):
        return
    raise ValueError(
        f"{path} already ships {previous.get('packageId')} "
        f"{previous.get('edition')} with different contents. "
        "Raise the edition in the release metadata so the new schedule can "
        "install beside the one teachers already have."
    )


def write_bytes(path: Path, contents: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(contents)


def main() -> None:
    arguments = parse_args()
    paths = PacingPaths.from_root(arguments.dataset_root)
    audit = audit_pacing(paths)
    audit["datasetSha256"] = content_digest(
        paths.source_files(), arguments.dataset_root
    )
    audit_bytes = canonical_json(audit) + b"\n"
    if arguments.audit_output:
        write_bytes(arguments.audit_output, audit_bytes)
    else:
        print(audit_bytes.decode("utf-8"), end="")

    if arguments.output_directory is None:
        return
    if arguments.metadata is None:
        raise ValueError("--metadata is required when --output-directory is provided.")
    metadata = read_json(arguments.metadata)
    if not isinstance(metadata, dict):
        raise ValueError("Release metadata must be a JSON object.")
    for ordinal, payload in build_pacing_payloads(
        paths, metadata, arguments.dataset_root
    ).items():
        output = arguments.output_directory / f"term-{ordinal}.graspy-scheme"
        assert_edition_is_free(output, payload)
        write_bytes(output, pacing_envelope(payload) + b"\n")


if __name__ == "__main__":
    main()
