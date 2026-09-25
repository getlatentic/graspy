import json
import tempfile
import unittest
from pathlib import Path

from scripts.export_pacing_packages import (
    PacingPaths,
    assert_edition_is_free,
    audit_pacing,
    build_pacing_payloads,
    pacing_envelope,
    release_week_title,
)


class ExportPacingPackagesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        (self.root / "curriculum").mkdir()
        (self.root / "ao_textbook_linkage/manual").mkdir(parents=True)
        (self.root / "scheme-of-work").mkdir()
        self.paths = PacingPaths.from_root(self.root)
        write_json(
            self.paths.curriculum.themes,
            [{"key": "theme-1", "title": "Number"}],
        )
        write_json(
            self.paths.curriculum.topics,
            [
                {
                    "theme_key": "theme-1",
                    "topic_key": "topic-1",
                    "topic": "Fractions",
                    "subtopics": [
                        {
                            "subtopic_id": "subtopic-1",
                            "title": "Ordering fractions",
                            "performance_objectives": ["Arrange fractions"],
                            "teacher_activities": ["Model the procedure"],
                            "student_activities": ["Order fractions"],
                            "teaching_learning_materials": ["Fraction strips"],
                            "evaluation_guide": ["Order three fractions"],
                        }
                    ],
                }
            ],
        )
        write_json(self.paths.curriculum.knowledge_components, [])
        write_json(
            self.paths.curriculum.linkage_directory / "subtopic-1.json",
            {
                "subtopic_id": "subtopic-1",
                "status": "mapped",
                "shared_foundation_record_ids": ["record-foundation"],
                "atomic_objectives": [
                    {
                        "ao_id": "ao-1",
                        "text": "Arrange fractions in ascending order.",
                        "record_links": [
                            {"record_id": "record-example"}
                        ],
                    }
                ],
            },
        )
        scheme = {}
        for source_name in ("First Term", "Second Term", "Third Term"):
            scheme[source_name] = [
                {
                    "week": 1,
                    "breakdown": [
                        {"title": "Ordering fractions", "subtopic_id": "subtopic-1"}
                    ],
                }
            ]
        write_json(self.paths.structured_scheme, scheme)
        source_table = """
        <table>
          <tr><td>Week</td><td>Topic</td><td>Breakdown</td></tr>
          <tr><td>1</td><td>Fractions</td><td>Ordering fractions</td></tr>
          <tr><td>2</td><td>Revision and periodic test</td><td></td></tr>
          <tr><td>3-4</td><td>Examination and vacation</td><td></td></tr>
        </table>
        """
        for _, _, _, file_name in (
            ("First Term", 1, "First term", "JSS1 Lagos State Math Scheme-of-Work - 1st Term.md"),
            ("Second Term", 2, "Second term", "JSS1 Lagos State Math Scheme-of-Work - 2nd Term.md"),
            ("Third Term", 3, "Third term", "JSS1 Lagos State Math Scheme-of-Work - 3rd Term.md"),
        ):
            (self.paths.source_directory / file_name).write_text(
                source_table, encoding="utf-8"
            )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_reconstructs_all_non_teaching_week_purposes(self) -> None:
        audit = audit_pacing(self.paths)

        self.assertEqual(audit["teachingEntries"], 3)
        self.assertEqual(
            audit["weekKinds"],
            {"break": 3, "examination": 3, "teaching": 3, "test": 3},
        )
        self.assertEqual([term["weeks"] for term in audit["terms"]], [4, 4, 4])

    def test_exports_three_deterministic_packages_with_stable_links(self) -> None:
        metadata = approved_metadata()

        first = build_pacing_payloads(self.paths, metadata, self.root)
        second = build_pacing_payloads(self.paths, metadata, self.root)

        self.assertEqual(
            {key: pacing_envelope(value) for key, value in first.items()},
            {key: pacing_envelope(value) for key, value in second.items()},
        )
        self.assertEqual(set(first), {1, 2, 3})
        entry = first[1]["weeks"][0]["entries"][0]
        self.assertEqual(entry["curriculumNodeCode"], "subtopic-1")
        self.assertEqual(entry["objectiveCodes"], ["ao-1"])
        self.assertEqual(
            entry["sourceRecordIds"], ["record-foundation", "record-example"]
        )
        self.assertEqual(
            [week["kind"] for week in first[1]["weeks"]],
            ["teaching", "test", "examination", "break"],
        )

    def test_refuses_export_without_pacing_redistribution_approval(self) -> None:
        metadata = approved_metadata()
        metadata["redistributionApproved"] = False

        with self.assertRaisesRegex(ValueError, "redistributionApproved=true"):
            build_pacing_payloads(self.paths, metadata, self.root)

    def test_refuses_export_without_a_pacing_rights_basis(self) -> None:
        metadata = approved_metadata()
        del metadata["package"]["rightsBasis"]

        with self.assertRaisesRegex(ValueError, "rightsBasis"):
            build_pacing_payloads(self.paths, metadata, self.root)

    def test_official_government_schedule_does_not_require_a_licence(self) -> None:
        payloads = build_pacing_payloads(
            self.paths,
            approved_metadata(),
            self.root,
        )

        self.assertEqual(payloads[1]["rightsBasis"]["kind"], "officialText")
        self.assertNotIn("licence", payloads[1])

    def test_source_bound_week_title_correction_repairs_malformed_table_text(self) -> None:
        metadata = approved_metadata()
        metadata["weekTitleCorrections"] = [
            {
                "termOrdinal": 2,
                "weekOrdinal": 9,
                "sourceTitle": "ALGEBRAIC malformed source row",
                "title": "Algebraic processes",
            }
        ]

        title = release_week_title(
            metadata,
            2,
            9,
            "ALGEBRAIC malformed source row",
        )

        self.assertEqual(title, "Algebraic processes")

    def test_source_bound_week_title_correction_rejects_source_drift(self) -> None:
        metadata = approved_metadata()
        metadata["weekTitleCorrections"] = [
            {
                "termOrdinal": 2,
                "weekOrdinal": 9,
                "sourceTitle": "Expected source row",
                "title": "Algebraic processes",
            }
        ]

        with self.assertRaisesRegex(ValueError, "no longer matches"):
            release_week_title(metadata, 2, 9, "Changed source row")


def approved_metadata() -> dict:
    return {
        "redistributionApproved": True,
        "package": {
            "packageId": "example.lagos-jss1-mathematics",
            "title": "JSS 1 Mathematics pacing",
            "publisher": "Example Publisher",
            "jurisdiction": "Lagos State, Nigeria",
            "edition": "2026",
            "sourceUrl": "https://example.test/pacing.pdf",
            "sourceSha256": "2" * 64,
            "rightsBasis": {
                "kind": "officialText",
                "name": "Official administrative text",
                "statement": "Redistribution basis recorded for an official administrative text.",
                "url": "https://example.test/copyright-act",
            },
            "attribution": "Example pacing source, official scheme text.",
            "modificationNotice": "Converted to consecutive week packages.",
        },
        "course": {"subject": "Mathematics", "gradeLevelCode": "JSS1"},
        "curriculum": {
            "packageId": "example.ng-jss1-mathematics",
            "courseKey": "mathematics-jss1",
        },
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


class EditionGuardTests(unittest.TestCase):
    """A changed schedule must not ship under an edition already released."""

    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.output = Path(self.temporary_directory.name) / "term-1.graspy-scheme"
        self.addCleanup(self.temporary_directory.cleanup)

    def release(self, payload: dict) -> None:
        self.output.write_bytes(pacing_envelope(payload) + b"\n")

    @staticmethod
    def payload(**overrides: object) -> dict:
        return {
            "packageId": "school.ng-maths-jss1.term-1",
            "edition": "2025/2026",
            "weeks": [],
            **overrides,
        }

    def test_a_first_release_has_nothing_to_conflict_with(self) -> None:
        assert_edition_is_free(self.output, self.payload())

    def test_republishing_identical_contents_is_allowed(self) -> None:
        self.release(self.payload())

        assert_edition_is_free(self.output, self.payload())

    def test_changed_contents_under_a_released_edition_are_refused(self) -> None:
        self.release(self.payload())

        with self.assertRaises(ValueError) as refusal:
            assert_edition_is_free(self.output, self.payload(weeks=[{"ordinal": 1}]))

        self.assertIn("edition", str(refusal.exception))

    def test_changed_contents_under_a_new_edition_are_allowed(self) -> None:
        self.release(self.payload())

        assert_edition_is_free(
            self.output, self.payload(edition="2026/2027", weeks=[{"ordinal": 1}])
        )


if __name__ == "__main__":
    unittest.main()
