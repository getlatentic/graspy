//! The class, term and template packages a scheme-repository test works on.
//!
//! A scheme cannot exist without a class to teach it to and a term to teach it
//! in, and a template cannot be installed without a package to install. Both
//! are built here so each test states only what it is checking.

use crate::academic_workspace::{
    domain::{CreateAcademicWorkspaceRequest, CreateTeachingAssignment},
    repository::create_workspace,
};
use crate::curriculum_catalog::{
    domain::{AssignCurriculumCourseRequest, InstallCurriculumPackageRequest},
    repository::{assign_course, install_package as install_curriculum_package},
    test_version_two_package_contents, test_version_two_package_payload,
};
use crate::scheme_of_work::repository::*;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::json;

pub(super) fn setup_database() -> (Database, SchemeContextRequest) {
    let database = Database::in_memory();
    let workspace = create_workspace(
        &database,
        CreateAcademicWorkspaceRequest {
            start_year: 2026,
            jurisdiction_id: "jurisdiction-ng".to_owned(),
            grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
            calendar_kind: crate::academic_workspace::domain::AcademicCalendarKind::Terms,
            period_names: vec![
                "First term".to_owned(),
                "Second term".to_owned(),
                "Third term".to_owned(),
            ],
            active_period_ordinal: 1,
            assignments: vec![CreateTeachingAssignment {
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some("A".to_owned()),
            }],
        },
    )
    .expect("academic workspace")
    .workspace
    .expect("configured workspace");
    (
        database,
        SchemeContextRequest {
            academic_session_id: workspace.active_session_id,
            academic_period_id: workspace.active_period_id,
            teaching_assignment_id: workspace.active_assignment_id,
        },
    )
}
pub(super) fn create_request(context: SchemeContextRequest) -> CreateSchemeOfWorkRequest {
    CreateSchemeOfWorkRequest {
        context,
        framework_name: "School Curriculum".to_owned(),
        authority: "Curriculum Office".to_owned(),
        jurisdiction: "Nigeria".to_owned(),
        version: "2026".to_owned(),
        source_uri: Some("https://example.edu/curriculum".to_owned()),
        term_starts_on: "2026-09-07".to_owned(),
        term_ends_on: "2026-09-23".to_owned(),
        mid_term_break_starts_on: None,
        mid_term_break_ends_on: None,
    }
}
pub(super) fn entry_request(
    scheme: &crate::scheme_of_work::domain::SchemeOfWork,
    context: SchemeContextRequest,
) -> crate::scheme_of_work::domain::SaveSchemeEntryRequest {
    crate::scheme_of_work::domain::SaveSchemeEntryRequest {
        context,
        entry_id: None,
        week_id: scheme.weeks[0].id.clone(),
        topic: "Whole Numbers".to_owned(),
        subtopic: Some("Millions".to_owned()),
        curriculum_unit: "Number".to_owned(),
        curriculum_outcomes: vec!["Count and write in millions.".to_owned()],
        objectives: vec!["Count in millions.".to_owned()],
        assessment: vec!["Read a number aloud.".to_owned()],
        instructional_materials: vec!["Place value chart".to_owned()],
        notes: None,
    }
}

/// Write a lesson against a weekly plan without going through lesson planning.
///
/// The scheme repository only needs a lesson row to exist; building one through
/// its own module would drag the whole lesson-planning write path into a test
/// about what the term plan can see.
pub(super) fn attach_lesson(
    database: &Database,
    context: &SchemeContextRequest,
    entry_id: &str,
    lesson_id: &str,
) {
    database
        .with_connection_mut(|connection| -> Result<(), rusqlite::Error> {
            connection.execute(
                "INSERT INTO lessons (
                     id, academic_session_id, academic_period_id, teaching_assignment_id,
                     scheme_week_id, scheme_entry_id, curriculum_course_id,
                     curriculum_unit_id, curriculum_node_id, input_mode, topic,
                     learning_goals, instructional_materials, assessment, reference_notes
                 )
                 SELECT ?1, ?2, ?3, ?4,
                        NULL, scheme_entries.id,
                        scheme_entries.curriculum_course_id,
                        scheme_entries.curriculum_unit_id, scheme_entries.curriculum_node_id,
                        'structured', scheme_entries.topic, '[]', '[]', '[]', '[]'
                 FROM scheme_entries WHERE scheme_entries.id = ?5",
                rusqlite::params![
                    lesson_id,
                    context.academic_session_id,
                    context.academic_period_id,
                    context.teaching_assignment_id,
                    entry_id
                ],
            )?;
            Ok(())
        })
        .expect("a lesson written from the weekly plan");
}

pub(super) fn template_package(subject: &str, topic: &str) -> String {
    let payload = json!({
        "packageId": "school.maths-jss2-first",
        "title": "Mathematics · JSS 2 · First term",
        "publisher": "Example School",
        "jurisdiction": "Lagos State, Nigeria",
        "edition": "2026",
        "sourceUrl": null,
        "subject": subject,
        "gradeLevelCode": "JSS2",
        "term": "first",
        "weeks": [
            {
                "ordinal": 1,
                "kind": "teaching",
                "title": topic,
                "entries": [{
                    "sequence": 1,
                    "topic": topic,
                    "subtopic": "Place value",
                    "curriculumUnit": "Number and numeration",
                    "learningOutcomes": ["Represent whole numbers."],
                    "objectives": ["Identify place values."],
                    "assessment": ["Complete an exit ticket."],
                    "materials": ["Place-value chart"],
                    "notes": null
                }]
            },
            {
                "ordinal": 2,
                "kind": "break",
                "title": "Mid-term break",
                "entries": []
            }
        ]
    })
    .to_string();
    json!({
        "schemaVersion": 1,
        "payload": STANDARD.encode(payload.as_bytes()),
        "signature": null
    })
    .to_string()
}
pub(super) fn granular_curriculum_package() -> String {
    let mut payload = test_version_two_package_payload();
    payload["nodeKinds"] = json!(["theme", "topic", "subtopic", "performance_objective"]);
    payload["courses"][0]["nodes"]
        .as_array_mut()
        .expect("curriculum nodes")
        .extend([
            json!({
                "code": "SUB-1",
                "parentCode": "TOP-1",
                "kind": "subtopic",
                "title": "Ordering whole numbers",
                "statement": "Order whole numbers.",
                "sequence": 1,
                "sourcePayload": {}
            }),
            json!({
                "code": "PO-1",
                "parentCode": "SUB-1",
                "kind": "performance_objective",
                "title": "Arrange whole numbers.",
                "statement": "Arrange whole numbers.",
                "sequence": 1,
                "sourcePayload": {}
            }),
        ]);
    payload["courses"][0]["objectives"][0]["nodeCode"] = json!("PO-1");
    for component in payload["courses"][0]["knowledgeComponents"]
        .as_array_mut()
        .expect("knowledge components")
    {
        component["nodeCode"] = json!("SUB-1");
    }
    payload["integrity"]["subtopics"] = json!(1);
    payload["integrity"]["performanceObjectives"] = json!(1);
    payload["integrity"]["subtopicsWithSources"] = json!(1);
    payload["integrity"]["linkageStates"] = json!({"mapped": 1});
    test_version_two_package_contents(&payload)
}
pub(super) fn granular_template_package(curriculum_package_id: &str) -> String {
    let payload = json!({
        "packageId": "school.maths-jss1-first-v3",
        "title": "Mathematics · JSS 1 · First term",
        "publisher": "Example School",
        "jurisdiction": "Nigeria",
        "edition": "2026",
        "sourceUrl": "https://example.edu/pacing.pdf",
        "sourceSha256": "3".repeat(64),
        "datasetSha256": "4".repeat(64),
        "rightsBasis": {
            "kind": "officialText",
            "name": "Official administrative text",
            "statement": "Redistribution basis recorded for an official administrative text.",
            "url": "https://example.edu/copyright-act"
        },
        "attribution": "Example School, official scheme text.",
        "modificationNotice": "Converted to consecutive weekly plans.",
        "subject": "Mathematics",
        "gradeLevelCode": "JSS1",
        "curriculumPackageId": curriculum_package_id,
        "curriculumCourseKey": "mathematics-jss1",
        "period": {"ordinal": 1, "kind": "term", "name": "First term"},
        "weeks": [
            {
                "ordinal": 1,
                "kind": "teaching",
                "title": "Ordering whole numbers",
                "entries": [{
                    "sequence": 1,
                    "topic": "Whole numbers",
                    "subtopic": "Ordering whole numbers",
                    "curriculumUnit": "Whole numbers",
                    "curriculumNodeCode": "SUB-1",
                    "objectiveCodes": ["OBJ-1"],
                    "sourceRecordIds": ["siyavula-record-1"],
                    "learningOutcomes": ["Arrange whole numbers."],
                    "objectives": ["Order whole numbers."],
                    "assessment": ["Order three numbers."],
                    "materials": ["Place-value cards"],
                    "notes": null
                }]
            },
            {
                "ordinal": 2,
                "kind": "test",
                "title": "Mid-term test",
                "entries": []
            }
        ]
    })
    .to_string();
    json!({
        "schemaVersion": 3,
        "payload": STANDARD.encode(payload.as_bytes()),
        "signature": null
    })
    .to_string()
}
pub(super) fn setup_granular_database() -> (Database, SchemeContextRequest) {
    let database = Database::in_memory();
    let workspace = create_workspace(
        &database,
        CreateAcademicWorkspaceRequest {
            start_year: 2026,
            jurisdiction_id: "jurisdiction-ng".to_owned(),
            grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
            calendar_kind: crate::academic_workspace::domain::AcademicCalendarKind::Terms,
            period_names: vec![
                "First term".to_owned(),
                "Second term".to_owned(),
                "Third term".to_owned(),
            ],
            active_period_ordinal: 1,
            assignments: vec![CreateTeachingAssignment {
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-1".to_owned(),
                class_section: Some("A".to_owned()),
            }],
        },
    )
    .expect("workspace")
    .workspace
    .expect("configured workspace");
    let catalog = install_curriculum_package(
        &database,
        InstallCurriculumPackageRequest {
            package_contents: granular_curriculum_package(),
        },
    )
    .expect("granular curriculum");
    assign_course(
        &database,
        AssignCurriculumCourseRequest {
            assignment_id: workspace.active_assignment_id.clone(),
            curriculum_course_id: catalog.courses[0].id.clone(),
        },
    )
    .expect("selected curriculum");
    (
        database,
        SchemeContextRequest {
            academic_session_id: workspace.active_session_id,
            academic_period_id: workspace.active_period_id,
            teaching_assignment_id: workspace.active_assignment_id,
        },
    )
}
