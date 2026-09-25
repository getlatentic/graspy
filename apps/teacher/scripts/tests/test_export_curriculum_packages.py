import json
import tempfile
import unittest
from pathlib import Path

from scripts.export_curriculum_packages import (
    DatasetPaths,
    assert_revision_is_free,
    audit_dataset,
    apply_revision_overlay,
    build_curriculum_payload,
    classify_knowledge_type,
    content_digest,
    curriculum_envelope,
    revision_source_link_corrections,
)


class ExportCurriculumPackagesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        (self.root / "curriculum").mkdir()
        (self.root / "ao_textbook_linkage/manual").mkdir(parents=True)
        self.paths = DatasetPaths.from_root(self.root)
        write_json(
            self.paths.themes,
            [
                {
                    "key": "theme-1",
                    "title": "Number",
                    "topic_keys": ["topic-1"],
                    "topic_titles": ["Fractions"],
                }
            ],
        )
        write_json(
            self.paths.topics,
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
                            "teacher_activities": ["Model a common denominator"],
                            "student_activities": ["Order three fractions"],
                            "teaching_learning_materials": ["Fraction strips"],
                            "evaluation_guide": ["Arrange fractions in order"],
                        }
                    ],
                }
            ],
        )
        write_json(
            self.paths.knowledge_components,
            [
                {
                    "kc_code": "KC-FR-001",
                    "subtopic_id": "subtopic-1",
                    "description": "Arrange fractions in order.",
                    "bloom_level": "apply",
                }
            ],
        )
        write_json(
            self.paths.linkage_directory / "subtopic-1.json",
            {
                "subtopic_id": "subtopic-1",
                "subtopic_title": "Ordering fractions",
                "status": "mapped",
                "status_reasons": [],
                "review_categories": [],
                "shared_foundation_record_ids": ["record-foundation"],
                "atomic_objectives": [
                    {
                        "ao_id": "ao-ascending",
                        "ao_order": 1,
                        "curriculum_objective_id": "subtopic-1-po01",
                        "curriculum_objective_text": "Arrange fractions",
                        "text": "Arrange fractions in ascending order.",
                        "bloom_verb": "arrange",
                        "bloom_level": "apply",
                        "record_links": [
                            {
                                "record_id": "record-example",
                                "role": "worked_example",
                                "method": "judgment",
                                "rationale": "Shows the complete ordering procedure.",
                            }
                        ],
                    },
                    {
                        "ao_id": "ao-descending",
                        "ao_order": 2,
                        "curriculum_objective_id": "subtopic-1-po01",
                        "curriculum_objective_text": "Arrange fractions",
                        "text": "Arrange fractions in descending order.",
                        "bloom_verb": "arrange",
                        "bloom_level": "apply",
                        "record_links": [],
                    },
                ],
            },
        )
        self.records = {"record-foundation", "record-example"}

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_audits_counts_coverage_and_review_state(self) -> None:
        audit = audit_dataset(self.paths, self.records)

        self.assertEqual(
            audit,
            {
                "themes": 1,
                "topics": 1,
                "subtopics": 1,
                "performanceObjectives": 1,
                "atomicObjectives": 2,
                "knowledgeComponents": 1,
                "sourceLinks": 2,
                "atomicObjectivesWithSources": 1,
                "atomicObjectivesWithoutSources": 1,
                "subtopicsWithSources": 1,
                "subtopicsWithoutSources": 0,
                "linkageStates": {"mapped": 1},
                "sourceLinkCorrections": 0,
            },
        )

    def test_export_is_deterministic_and_retains_subtopic_scoped_components(self) -> None:
        metadata = approved_metadata()

        first = build_curriculum_payload(
            self.paths, self.records, metadata, self.root
        )
        second = build_curriculum_payload(
            self.paths, self.records, metadata, self.root
        )

        self.assertEqual(curriculum_envelope(first), curriculum_envelope(second))
        course = first["courses"][0]
        self.assertEqual(len(course["nodes"]), 4)
        self.assertEqual(len(course["objectives"]), 2)
        self.assertEqual(course["uncoveredObjectiveCodes"], ["ao-descending"])
        self.assertEqual(
            course["knowledgeComponents"],
            [
                {
                    "code": "KC-FR-001",
                    "nodeCode": "subtopic-1",
                    "description": "Arrange fractions in order.",
                    "bloomLevel": "apply",
                    "knowledgeType": "procedure",
                    "objectiveCodes": ["ao-ascending", "ao-descending"],
                }
            ],
        )
        self.assertEqual(
            json.loads(curriculum_envelope(first))["schemaVersion"], 2
        )

    def test_classifies_knowledge_types_from_semantics_and_bloom_level(self) -> None:
        self.assertEqual(
            classify_knowledge_type("Explain the meaning of a fraction", "understand"),
            "concept",
        )
        self.assertEqual(
            classify_knowledge_type("Arrange fractions in order", "apply"),
            "procedure",
        )
        self.assertEqual(
            classify_knowledge_type("Draw a number line", "apply"),
            "representation",
        )

    def test_rejects_a_component_without_atomic_objectives(self) -> None:
        row_path = self.paths.linkage_directory / "subtopic-1.json"
        row = json.loads(row_path.read_text(encoding="utf-8"))
        row["atomic_objectives"] = []
        write_json(row_path, row)

        with self.assertRaisesRegex(
            ValueError, "KC-FR-001 has no atomic objectives in its subtopic"
        ):
            build_curriculum_payload(
                self.paths, self.records, approved_metadata(), self.root
            )

    def test_refuses_release_output_without_redistribution_approval(self) -> None:
        metadata = approved_metadata()
        metadata["redistributionApproved"] = False

        with self.assertRaisesRegex(ValueError, "redistributionApproved=true"):
            build_curriculum_payload(
                self.paths, self.records, metadata, self.root
            )

    def test_refuses_release_output_without_a_rights_basis(self) -> None:
        metadata = approved_metadata()
        del metadata["package"]["rightsBasis"]

        with self.assertRaisesRegex(ValueError, "rightsBasis"):
            build_curriculum_payload(
                self.paths, self.records, metadata, self.root
            )

    def test_rejects_a_dangling_textbook_record(self) -> None:
        row_path = self.paths.linkage_directory / "subtopic-1.json"
        row = json.loads(row_path.read_text(encoding="utf-8"))
        row["atomic_objectives"][0]["record_links"][0]["record_id"] = "missing"
        write_json(row_path, row)

        with self.assertRaisesRegex(ValueError, "unknown textbook record missing"):
            audit_dataset(self.paths, self.records)

    def test_applies_an_approved_source_link_rationale_correction(self) -> None:
        row_path = self.paths.linkage_directory / "subtopic-1.json"
        row = json.loads(row_path.read_text(encoding="utf-8"))
        row["atomic_objectives"][0]["record_links"][0]["rationale"] = ""
        write_json(row_path, row)
        overlay = approved_revision_overlay("a" * 64)
        overlay["sourceLinkCorrections"] = [
            {
                "objectiveCode": "ao-ascending",
                "recordId": "record-example",
                "reviewState": "approved",
                "rationale": "This example directly demonstrates ordering fractions.",
                "reason": "The donor rationale was empty.",
            }
        ]

        audit = audit_dataset(
            self.paths,
            self.records,
            revision_source_link_corrections(overlay),
        )

        self.assertEqual(audit["sourceLinkCorrections"], 1)

    def test_rejects_an_empty_source_link_rationale_without_a_review(self) -> None:
        row_path = self.paths.linkage_directory / "subtopic-1.json"
        row = json.loads(row_path.read_text(encoding="utf-8"))
        row["atomic_objectives"][0]["record_links"][0]["rationale"] = ""
        write_json(row_path, row)

        with self.assertRaisesRegex(ValueError, "source-link rationale"):
            audit_dataset(self.paths, self.records)

    def test_revision_overlay_enriches_topics_without_replacing_stable_nodes(self) -> None:
        metadata = approved_metadata()
        baseline_digest = "a" * 64
        overlay = approved_revision_overlay(baseline_digest)
        nodes = [
            {
                "code": "topic-1",
                "parentCode": "theme-1",
                "kind": "topic",
                "title": "Fractions",
                "statement": None,
                "sequence": 1,
                "sourcePayload": {},
            }
        ]

        result = apply_revision_overlay(
            nodes,
            {"topic-1"},
            overlay,
            metadata,
            baseline_digest,
        )

        self.assertEqual(result["sourceTopics"], 1)
        self.assertEqual(result["sourcePages"], 1)
        self.assertEqual(nodes[0]["code"], "topic-1")
        self.assertEqual(
            nodes[0]["sourcePayload"]["curriculumAlignment"],
            {
                "sourceTopicCode": "nerdc-2025-fractions",
                "sourceTitle": "Fractions",
                "sourceTheme": "Number and Numeration",
                "sourcePageLabels": ["6"],
                "physicalPageNumbers": [19],
                "mappingKind": "retained",
                "learningOutcome": "Analyze mathematical problems.",
                "focalCompetency": "Apply equivalent fractions while sharing items.",
                "performanceObjectives": [
                    "Arrange fractions in ascending or descending order."
                ],
                "contentKnowledgeAndSkills": "Ordering of fractions.",
                "keyCompetenciesAndValues": "Critical thinking.",
                "learningActivities": "Order fraction cards.",
                "teachingAndLearningResources": "Fraction cards.",
                "evaluationGuide": "Order fractions.",
            },
        )

    def test_revision_overlay_rejects_incomplete_topic_coverage(self) -> None:
        metadata = approved_metadata()
        overlay = approved_revision_overlay("a" * 64)

        with self.assertRaisesRegex(ValueError, "does not cover donor topics: topic-2"):
            apply_revision_overlay(
                [
                    {
                        "code": "topic-1",
                        "kind": "topic",
                        "sourcePayload": {},
                    }
                ],
                {"topic-1", "topic-2"},
                overlay,
                metadata,
                "a" * 64,
            )

    def test_revision_overlay_rejects_unapproved_mapping(self) -> None:
        metadata = approved_metadata()
        overlay = approved_revision_overlay("a" * 64)
        overlay["sourceTopics"][0]["mappingReview"]["state"] = "needs_review"

        with self.assertRaisesRegex(ValueError, "must be approved"):
            apply_revision_overlay(
                [],
                {"topic-1"},
                overlay,
                metadata,
                "a" * 64,
            )

    def test_golden_review_resolves_only_the_approved_linkage(self) -> None:
        row_path = self.paths.linkage_directory / "subtopic-1.json"
        row = json.loads(row_path.read_text(encoding="utf-8"))
        row["status"] = "needs_review"
        row["status_reasons"] = ["One mixed-scope record requires review."]
        row["review_categories"] = ["ambiguous_record_scope"]
        write_json(row_path, row)
        baseline_digest = content_digest(self.paths.source_files(), self.root)
        overlay = approved_revision_overlay(baseline_digest)
        overlay["goldenLessonReviews"] = [
            {
                "reviewId": "ordering-fractions-v1",
                "subtopicCode": "subtopic-1",
                "sourceTopicCode": "nerdc-2025-fractions",
                "physicalPageNumber": 19,
                "state": "approved",
                "resolution": "mapped",
                "approvedObjectiveCodes": ["ao-ascending", "ao-descending"],
                "approvedSourceRecordIds": ["record-example"],
                "excludedSourceRecordIds": ["mixed-scope-record"],
                "rationale": "Only the direct ordering record is retained.",
                "rubric": passing_golden_rubric(),
            }
        ]

        payload = build_curriculum_payload(
            self.paths,
            self.records,
            approved_metadata(),
            self.root,
            overlay,
        )

        subtopic = next(
            node
            for node in payload["courses"][0]["nodes"]
            if node["code"] == "subtopic-1"
        )
        self.assertEqual(
            subtopic["sourcePayload"]["contentReview"]["state"], "mapped"
        )
        self.assertEqual(payload["integrity"]["goldenLessons"], 1)
        self.assertEqual(payload["integrity"]["linkageStates"], {"mapped": 1})


def approved_metadata() -> dict:
    return {
        "redistributionApproved": True,
        "package": {
            "packageId": "example.ng-jss1-mathematics",
            "title": "JSS 1 Mathematics",
            "publisher": "Example Publisher",
            "countryCode": "NG",
            "jurisdictionCode": "NG",
            "edition": "2026",
            "effectiveFrom": "2026-09-01",
            "effectiveTo": None,
            "sourceUrl": "https://example.test/curriculum.pdf",
            "sourceSha256": "1" * 64,
            "rightsBasis": {
                "kind": "officialText",
                "name": "Official administrative text",
                "statement": "Redistribution basis recorded for an official administrative text.",
                "url": "https://example.test/copyright-act",
            },
            "attribution": "Example Publisher, official curriculum text.",
            "modificationNotice": "Converted without changing source wording.",
            "framework": {
                "name": "Example curriculum",
                "authority": "Example Authority",
            },
        },
        "course": {
            "courseKey": "mathematics-jss1",
            "title": "Mathematics · JSS 1",
            "subject": "Mathematics",
            "gradeSystemCode": "NG-BASIC-SECONDARY",
            "gradeSystemVersion": "1",
            "gradeLevelCode": "JSS1",
        },
    }


def approved_revision_overlay(baseline_digest: str) -> dict:
    return {
        "schemaVersion": 1,
        "baselineDatasetSha256": baseline_digest,
        "source": {
            "url": "https://example.test/curriculum.pdf",
            "sha256": "1" * 64,
            "edition": "2026",
        },
        "sourceTopics": [
            {
                "sourceTopicCode": "nerdc-2025-fractions",
                "title": "Fractions",
                "theme": "Number and Numeration",
                "sourcePageLabels": ["6"],
                "physicalPageNumbers": [19],
                "targetTopicCodes": ["topic-1"],
                "mappingKind": "retained",
                "mappingReview": {
                    "state": "approved",
                    "rationale": "The source topic and planning topic are equivalent.",
                },
                "learningOutcome": "Analyze mathematical problems.",
                "focalCompetency": "Apply equivalent fractions while sharing items.",
                "performanceObjectives": [
                    "Arrange fractions in ascending or descending order."
                ],
                "contentKnowledgeAndSkills": "Ordering of fractions.",
                "keyCompetenciesAndValues": "Critical thinking.",
                "learningActivities": "Order fraction cards.",
                "teachingAndLearningResources": "Fraction cards.",
                "evaluationGuide": "Order fractions.",
            }
        ],
    }


def passing_golden_rubric() -> dict:
    return {
        criterion: {"result": "pass", "rationale": "Reviewed and approved."}
        for criterion in (
            "objectiveAlignment",
            "curriculumScope",
            "mathematicalCorrectness",
            "pedagogicalUsefulness",
        )
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


class RevisionGuardTests(unittest.TestCase):
    """A changed conversion must not ship under an identity already released."""

    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.output = Path(self.temporary_directory.name) / "curriculum.graspy-curriculum"
        self.addCleanup(self.temporary_directory.cleanup)

    def release(self, payload: dict) -> None:
        self.output.write_bytes(curriculum_envelope(payload) + b"\n")

    @staticmethod
    def payload(**overrides: object) -> dict:
        return {
            "packageId": "school.ng-maths-jss1",
            "edition": "September 2025",
            "packageRevision": 1,
            "courses": [],
            **overrides,
        }

    def test_a_first_release_has_nothing_to_conflict_with(self) -> None:
        assert_revision_is_free(self.output, self.payload())

    def test_republishing_identical_contents_is_allowed(self) -> None:
        self.release(self.payload())

        assert_revision_is_free(self.output, self.payload())

    def test_changed_contents_under_a_released_revision_are_refused(self) -> None:
        self.release(self.payload())

        with self.assertRaises(ValueError) as refusal:
            assert_revision_is_free(self.output, self.payload(courses=[{"courseKey": "added"}]))

        self.assertIn("packageRevision", str(refusal.exception))

    def test_changed_contents_under_a_new_revision_are_allowed(self) -> None:
        self.release(self.payload())

        assert_revision_is_free(
            self.output,
            self.payload(packageRevision=2, courses=[{"courseKey": "added"}]),
        )

    def test_an_earlier_revision_may_not_replace_a_later_one(self) -> None:
        self.release(self.payload(packageRevision=2))

        with self.assertRaises(ValueError) as refusal:
            assert_revision_is_free(self.output, self.payload(packageRevision=1))

        self.assertIn("earlier conversion", str(refusal.exception))

    def test_a_payload_written_before_revisions_counts_as_the_first(self) -> None:
        released = self.payload()
        released.pop("packageRevision")
        self.release(released)

        with self.assertRaises(ValueError):
            assert_revision_is_free(self.output, self.payload(courses=[{"courseKey": "added"}]))

    def test_a_different_edition_is_a_separate_release(self) -> None:
        self.release(self.payload())

        assert_revision_is_free(
            self.output,
            self.payload(edition="September 2026", courses=[{"courseKey": "added"}]),
        )


if __name__ == "__main__":
    unittest.main()
