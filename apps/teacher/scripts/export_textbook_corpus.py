"""Build the immutable graspy textbook corpus from processed Siyavula records.

The source inputs remain outside the application repository. The generated
SQLite package contains only unbranded, processed text and deterministic
curriculum links required at runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import sqlite3
import struct
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable

try:
    from scripts.export_curriculum_packages import donor_path, require_source_paths
except ModuleNotFoundError:
    from export_curriculum_packages import (  # type: ignore[no-redef]
        donor_path,
        require_source_paths,
    )

PACKAGE_ID = "siyavula-jss1-mathematics-v1"
PACKAGE_TITLE = "Siyavula Mathematics JSS 1"
PUBLISHER = "Siyavula"
SOURCE_URL = "https://ng.siyavula.com/read"
LICENCE_ID = "CC-BY-3.0"
LICENCE_NAME = "Creative Commons Attribution 3.0 Unported"
LICENCE_URL = "https://creativecommons.org/licenses/by/3.0/"
MODIFICATION_NOTICE = (
    "Processed into structured excerpts by graspy; formatting and segmentation changed."
)
ATTRIBUTION = (
    f"{PACKAGE_TITLE}, from {SOURCE_URL}, licensed under {LICENCE_NAME}. "
    f"{MODIFICATION_NOTICE}"
)

DEFAULT_OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "src-tauri/resources/content"
    / PACKAGE_ID
    / "corpus.sqlite3"
)

ROLE_PRIORITY = {
    "foundation": 0,
    "instruction": 1,
    "worked_example": 2,
    "exercise": 3,
}
TRUSTED_FIGURE_URL_PREFIX = (
    "https://electricbookworks.github.io/"
    "siyavula-open-textbooks-images/items/images/web/"
)
SAFE_FIGURE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.png$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--records",
        type=Path,
        default=donor_path("dataset/processed/textbook/jsonl/linked/records.jsonl"),
    )
    parser.add_argument(
        "--links",
        type=Path,
        default=donor_path("dataset/processed/ao_textbook_linkage/manual"),
    )
    parser.add_argument(
        "--figures", type=Path, default=donor_path("apps/backend/static/figures")
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    require_source_paths(parser, arguments, "records", "links", "figures")
    return arguments


def load_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            record = json.loads(line)
            record_id = required_text(record, "record_id", path, line_number)
            if record_id in seen_ids:
                raise ValueError(f"Duplicate textbook record id: {record_id}")
            seen_ids.add(record_id)
            if not passage_text(record):
                raise ValueError(f"Textbook record has no usable passage: {record_id}")
            records.append(record)
    if not records:
        raise ValueError("The textbook record source is empty.")
    return sorted(records, key=lambda record: record["record_id"])


def required_text(
    value: dict[str, Any], key: str, path: Path, line_number: int | None = None
) -> str:
    text = value.get(key)
    if not isinstance(text, str) or not text.strip():
        location = f"{path}:{line_number}" if line_number is not None else str(path)
        raise ValueError(f"{location} is missing {key}.")
    return text.strip()


def passage_text(record: dict[str, Any]) -> str:
    for key in ("prompt_text", "content_text", "retrieval_text"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def record_title(record: dict[str, Any]) -> str:
    heading_path = record.get("heading_path")
    if isinstance(heading_path, dict):
        for key in ("h3", "h2"):
            value = heading_path.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    chapter = record.get("chapter_title")
    if isinstance(chapter, str) and chapter.strip():
        return chapter.strip()
    return record["record_id"]


def load_subtopic_sources(
    directory: Path, valid_record_ids: set[str]
) -> tuple[list[tuple[str, str, str, int]], list[Path]]:
    candidates: dict[tuple[str, str], tuple[int, int, str]] = {}
    source_paths = sorted(
        path
        for path in directory.glob("*.json")
        if path.name not in {"manifest.json", "review_triage.json"}
    )
    for path in source_paths:
        document = json.loads(path.read_text(encoding="utf-8"))
        subtopic_id = required_text(document, "subtopic_id", path)
        occurrence = 0
        for record_id in document.get("shared_foundation_record_ids") or []:
            occurrence += 1
            add_source_candidate(
                candidates,
                valid_record_ids,
                subtopic_id,
                record_id,
                "foundation",
                occurrence,
                path,
            )
        for objective in document.get("atomic_objectives") or []:
            for link in objective.get("record_links") or []:
                occurrence += 1
                add_source_candidate(
                    candidates,
                    valid_record_ids,
                    subtopic_id,
                    link.get("record_id"),
                    link.get("role"),
                    occurrence,
                    path,
                )

    by_subtopic: dict[str, list[tuple[str, str, int, int]]] = defaultdict(list)
    for (subtopic_id, record_id), (priority, occurrence, role) in candidates.items():
        by_subtopic[subtopic_id].append((record_id, role, priority, occurrence))

    links: list[tuple[str, str, str, int]] = []
    for subtopic_id in sorted(by_subtopic):
        ordered = sorted(
            by_subtopic[subtopic_id],
            key=lambda item: (item[2], item[3], item[0]),
        )
        links.extend(
            (subtopic_id, record_id, role, rank)
            for rank, (record_id, role, _, _) in enumerate(ordered, start=1)
        )
    return links, source_paths


def add_source_candidate(
    candidates: dict[tuple[str, str], tuple[int, int, str]],
    valid_record_ids: set[str],
    subtopic_id: str,
    record_id_value: object,
    role_value: object,
    occurrence: int,
    path: Path,
) -> None:
    if not isinstance(record_id_value, str) or not record_id_value:
        raise ValueError(f"{path} contains a source link without a record id.")
    if record_id_value not in valid_record_ids:
        raise ValueError(f"{path} references unknown textbook record {record_id_value}.")
    role = role_value if isinstance(role_value, str) else "instruction"
    if role not in ROLE_PRIORITY:
        raise ValueError(f"{path} contains unsupported source role {role}.")
    key = (subtopic_id, record_id_value)
    candidate = (ROLE_PRIORITY[role], occurrence, role)
    current = candidates.get(key)
    if current is None or candidate[:2] < current[:2]:
        candidates[key] = candidate


def source_digest(paths: Iterable[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda value: str(value)):
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


class FigureContextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._paragraph = []
        self.context_by_url: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._skip_depth += 1
            return
        if tag == "img":
            url = dict(attrs).get("src")
            if url:
                self.context_by_url[url] = normalise_caption(" ".join(self._paragraph))
        elif tag in {"p", "li", "div", "br"}:
            self._paragraph.clear()

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth and data.strip():
            self._paragraph.append(data.strip())


def normalise_caption(value: str) -> str:
    text = " ".join(html.unescape(value).split())
    if len(text) <= 240:
        return text
    shortened = text[:237].rsplit(" ", 1)[0]
    return f"{shortened}…"


def record_figure_caption(record: dict[str, Any]) -> str:
    content = str(record.get("content_text") or record.get("retrieval_text") or "")
    sentences = [normalise_caption(sentence) for sentence in re.split(r"(?<=[.!?])\s+", content)]
    contextual = [
        sentence
        for sentence in sentences
        if any(word in sentence.casefold() for word in ("figure", "diagram", "chart", "shown below", "shows"))
    ]
    if contextual:
        return contextual[0]
    return f"Illustration for {record_title(record)}."


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Figure is not a valid PNG: {path}")
    return struct.unpack(">II", header[16:24])


def load_figures(
    records: list[dict[str, Any]], figure_directory: Path
) -> tuple[list[dict[str, Any]], list[Path]]:
    figures: list[dict[str, Any]] = []
    source_paths: list[Path] = []
    seen: set[tuple[str, str]] = set()
    sequence_by_record: dict[str, int] = defaultdict(int)
    for record in records:
        parser = FigureContextParser()
        parser.feed(str(record.get("raw_html") or ""))
        assets = sorted(
            (record.get("asset_refs") or []),
            key=lambda asset: int(asset.get("ordinal") or 0),
        )
        for asset in assets:
            if asset.get("asset_type") != "image":
                continue
            source_url = str(asset.get("src") or "").strip()
            if not source_url.startswith(TRUSTED_FIGURE_URL_PREFIX):
                continue
            file_name = source_url.rsplit("/", 1)[-1]
            if not SAFE_FIGURE_NAME.fullmatch(file_name):
                raise ValueError(f"Unsafe figure file name in {record['record_id']}: {file_name}")
            source_path = figure_directory / file_name
            if not source_path.is_file():
                continue
            key = (record["record_id"], file_name)
            if key in seen:
                continue
            seen.add(key)
            sequence_by_record[record["record_id"]] += 1
            width, height = png_dimensions(source_path)
            context = parser.context_by_url.get(source_url) or ""
            caption = context or record_figure_caption(record)
            figures.append(
                {
                    "record_id": record["record_id"],
                    "sequence": sequence_by_record[record["record_id"]],
                    "file_name": file_name,
                    "source_url": source_url,
                    "caption": caption,
                    "alt_text": caption,
                    "sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
                    "media_type": "image/png",
                    "width": width,
                    "height": height,
                    "source_path": source_path,
                }
            )
            source_paths.append(source_path)
    return figures, sorted(set(source_paths))


def build_database(
    output: Path,
    records: list[dict[str, Any]],
    subtopic_sources: list[tuple[str, str, str, int]],
    figures: list[dict[str, Any]],
    source_sha256: str,
) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    connection = sqlite3.connect(output)
    try:
        connection.executescript(
            """
            PRAGMA page_size = 4096;
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;
            PRAGMA foreign_keys = ON;

            CREATE TABLE corpus_metadata (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            ) WITHOUT ROWID;

            CREATE TABLE textbook_records (
                record_id TEXT PRIMARY KEY NOT NULL,
                record_type TEXT NOT NULL,
                title TEXT NOT NULL,
                chapter_title TEXT NOT NULL,
                prompt_text TEXT NOT NULL,
                content_text TEXT NOT NULL,
                retrieval_text TEXT NOT NULL,
                source_anchor TEXT,
                CHECK (length(trim(prompt_text)) > 0 OR length(trim(content_text)) > 0 OR length(trim(retrieval_text)) > 0)
            ) WITHOUT ROWID;

            CREATE TABLE textbook_record_subtopics (
                record_id TEXT NOT NULL,
                subtopic_id TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position > 0),
                PRIMARY KEY (record_id, subtopic_id),
                FOREIGN KEY (record_id) REFERENCES textbook_records(record_id) ON DELETE RESTRICT
            ) WITHOUT ROWID;

            CREATE TABLE subtopic_sources (
                subtopic_id TEXT NOT NULL,
                record_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('foundation', 'instruction', 'worked_example', 'exercise')),
                rank INTEGER NOT NULL CHECK (rank > 0),
                PRIMARY KEY (subtopic_id, record_id),
                UNIQUE (subtopic_id, rank),
                FOREIGN KEY (record_id) REFERENCES textbook_records(record_id) ON DELETE RESTRICT
            ) WITHOUT ROWID;

            CREATE INDEX textbook_record_subtopics_by_subtopic
                ON textbook_record_subtopics(subtopic_id, position, record_id);

            CREATE TABLE textbook_record_figures (
                record_id TEXT NOT NULL,
                sequence INTEGER NOT NULL CHECK (sequence > 0),
                asset_file_name TEXT NOT NULL,
                source_url TEXT NOT NULL,
                caption TEXT NOT NULL,
                alt_text TEXT NOT NULL,
                sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
                media_type TEXT NOT NULL CHECK (media_type = 'image/png'),
                width_px INTEGER NOT NULL CHECK (width_px > 0),
                height_px INTEGER NOT NULL CHECK (height_px > 0),
                PRIMARY KEY (record_id, sequence),
                UNIQUE (record_id, asset_file_name),
                FOREIGN KEY (record_id) REFERENCES textbook_records(record_id) ON DELETE RESTRICT
            ) WITHOUT ROWID;
            """
        )
        metadata = {
            "format_version": "2",
            "package_id": PACKAGE_ID,
            "title": PACKAGE_TITLE,
            "publisher": PUBLISHER,
            "source_url": SOURCE_URL,
            "licence_id": LICENCE_ID,
            "licence_name": LICENCE_NAME,
            "licence_url": LICENCE_URL,
            "attribution": ATTRIBUTION,
            "modification_notice": MODIFICATION_NOTICE,
            "source_sha256": source_sha256,
            "record_count": str(len(records)),
            "figure_count": str(len(figures)),
            "subtopic_source_count": str(len(subtopic_sources)),
        }
        connection.executemany(
            "INSERT INTO corpus_metadata (key, value) VALUES (?, ?)",
            sorted(metadata.items()),
        )
        connection.executemany(
            """
            INSERT INTO textbook_records (
                record_id, record_type, title, chapter_title,
                prompt_text, content_text, retrieval_text, source_anchor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (
                    record["record_id"],
                    str(record.get("record_type") or "text"),
                    record_title(record),
                    str(record.get("chapter_title") or record_title(record)),
                    str(record.get("prompt_text") or "").strip(),
                    str(record.get("content_text") or "").strip(),
                    str(record.get("retrieval_text") or "").strip(),
                    str(record.get("source_anchor_id") or "").strip() or None,
                )
                for record in records
            ),
        )
        record_subtopics = [
            (record["record_id"], subtopic_id, position)
            for record in records
            for position, subtopic_id in enumerate(record.get("subtopic_ids") or [], start=1)
            if isinstance(subtopic_id, str) and subtopic_id
        ]
        connection.executemany(
            "INSERT INTO textbook_record_subtopics (record_id, subtopic_id, position) VALUES (?, ?, ?)",
            record_subtopics,
        )
        connection.executemany(
            "INSERT INTO subtopic_sources (subtopic_id, record_id, role, rank) VALUES (?, ?, ?, ?)",
            subtopic_sources,
        )
        connection.executemany(
            """
            INSERT INTO textbook_record_figures (
                record_id, sequence, asset_file_name, source_url, caption, alt_text,
                sha256, media_type, width_px, height_px
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (
                    figure["record_id"],
                    figure["sequence"],
                    figure["file_name"],
                    figure["source_url"],
                    figure["caption"],
                    figure["alt_text"],
                    figure["sha256"],
                    figure["media_type"],
                    figure["width"],
                    figure["height"],
                )
                for figure in figures
            ),
        )
        foreign_key_errors = connection.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise ValueError(f"Corpus contains foreign-key errors: {foreign_key_errors[:3]}")
        connection.commit()
        connection.execute("VACUUM")
    finally:
        connection.close()

    corpus_sha256 = hashlib.sha256(output.read_bytes()).hexdigest()
    return {
        "formatVersion": 2,
        "packageId": PACKAGE_ID,
        "title": PACKAGE_TITLE,
        "publisher": PUBLISHER,
        "sourceUrl": SOURCE_URL,
        "licenceId": LICENCE_ID,
        "licenceName": LICENCE_NAME,
        "licenceUrl": LICENCE_URL,
        "attribution": ATTRIBUTION,
        "modificationNotice": MODIFICATION_NOTICE,
        "sourceSha256": source_sha256,
        "corpusSha256": corpus_sha256,
        "recordCount": len(records),
        "figureCount": len(figures),
        "recordSubtopicCount": len(record_subtopics),
        "subtopicSourceCount": len(subtopic_sources),
    }


def write_companion_files(
    output: Path, manifest: dict[str, Any], figures: list[dict[str, Any]]
) -> None:
    figure_output = output.with_name("figures")
    if figure_output.exists():
        shutil.rmtree(figure_output)
    figure_output.mkdir()
    for figure in figures:
        target = figure_output / figure["file_name"]
        if not target.exists():
            shutil.copyfile(figure["source_path"], target)
    manifest_path = output.with_name("manifest.json")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    attribution_path = output.with_name("ATTRIBUTION.md")
    attribution_path.write_text(
        "\n".join(
            [
                f"# {PACKAGE_TITLE}",
                "",
                f"Source: {SOURCE_URL}",
                f"Publisher: {PUBLISHER}",
                f"Licence: [{LICENCE_NAME}]({LICENCE_URL})",
                "",
                ATTRIBUTION,
                "",
                "This package contains processed, unbranded textbook text and source-owned",
                "instructional figures. Siyavula logos, sponsorship marks, branded covers, and",
                "third-party embedded media are not included.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> None:
    args = parse_args()
    records = load_records(args.records)
    record_ids = {record["record_id"] for record in records}
    subtopic_sources, link_paths = load_subtopic_sources(args.links, record_ids)
    figures, figure_paths = load_figures(records, args.figures)
    digest = source_digest([args.records, *link_paths, *figure_paths])
    manifest = build_database(args.output, records, subtopic_sources, figures, digest)
    write_companion_files(args.output, manifest, figures)
    print(
        f"wrote {args.output} "
        f"({manifest['recordCount']} records, {manifest['figureCount']} figures, "
        f"{manifest['subtopicSourceCount']} curated links)"
    )


if __name__ == "__main__":
    main()
