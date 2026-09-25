use serde::{Deserialize, Serialize};

use crate::lesson_planning::LessonContextRequest;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExportClassworkSet {
    Original,
    Group,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExportCopy {
    Student,
    Teacher,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PrepareClassworkExportRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub classwork_set: ExportClassworkSet,
    pub group_id: Option<String>,
    pub copy: ExportCopy,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveClassworkPdfRequest {
    pub document: PrepareClassworkExportRequest,
    pub destination_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreparedClassworkExport {
    pub title: String,
    pub file_name: String,
    pub html: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkPdfArtifact {
    pub path: String,
    pub file_name: String,
    pub byte_size: u64,
}

/// The lesson plan is composed and held on the frontend, so the plan export
/// commands receive it as typed input and render it directly rather than
/// reloading it from the lesson library.
///
/// Its sections are the sections of the lesson plan a school reads, and the
/// renderer prints them in that order. A section graspy does not hold is still
/// printed, with a rule to write on: the shape of the paper is what is being
/// checked, and a plan missing a heading sends a teacher back to their notebook.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlanExportInput {
    pub title: String,
    pub subtitle: String,
    pub eyebrow: String,
    pub identity: LessonPlanIdentity,
    pub objectives: Vec<String>,
    pub instructional_materials: Vec<String>,
    pub previous_knowledge: Vec<String>,
    pub steps: Vec<LessonPlanExportStep>,
    pub evaluation: Vec<String>,
    pub assignment: Vec<String>,
    pub references: Vec<String>,
}

/// Which lesson this is, in the terms the top of a lesson plan states it.
///
/// Period and duration are optional because graspy holds neither with
/// certainty: a timetable is not modelled, and a lesson whose steps carry no
/// minutes has no length to state.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlanIdentity {
    pub week: Option<String>,
    pub class_name: String,
    pub subject: String,
    pub period: Option<String>,
    pub duration: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlanExportStep {
    pub title: String,
    pub teacher_activity: String,
    pub learner_activity: String,
    pub duration_minutes: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveLessonPlanPdfRequest {
    pub document: LessonPlanExportInput,
    pub destination_path: String,
}
