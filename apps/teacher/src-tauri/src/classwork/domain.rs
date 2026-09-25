use serde::{Deserialize, Serialize};

use crate::lesson_planning::{granular::LessonPlanStep, LessonContextRequest};

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkWorkspaceRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StartClassworkRunRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunClassworkGenerationRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub section_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BeginClassworkSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompleteClassworkSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub section: GeneratedClassworkSectionInput,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FailClassworkSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub message: String,
    pub quality: Option<ClassworkQualityReport>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CancelClassworkRunRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: String,
    pub generation_token: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkFigureRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub figure_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EditClassworkBlockRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub block_id: String,
    pub expected_version_number: i64,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ApproveClassworkVersionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub expected_version_number: i64,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BeginClassworkSectionRegenerationRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: String,
    pub expected_version_number: i64,
    pub teacher_direction: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompleteClassworkSectionRegenerationRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub regeneration_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub section: GeneratedClassworkSectionInput,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FailClassworkSectionRegenerationRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub regeneration_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CancelClassworkSectionRegenerationRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub regeneration_id: String,
    pub section_id: String,
    pub generation_token: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionHistoryRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RestoreClassworkSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: String,
    pub source_version_number: i64,
    pub expected_version_number: i64,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedClassworkSectionInput {
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub blocks: Vec<GeneratedClassworkBlockInput>,
    pub quality: ClassworkQualityReport,
}

#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedClassworkBlockInput {
    pub kind: String,
    pub text: String,
    pub learning_goal_numbers: Vec<i64>,
    pub source_material_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkQualityReport {
    pub outcome: String,
    pub repair_attempted: bool,
    pub scrubbed_claim_count: i64,
    pub passes: Vec<ClassworkValidationPass>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkValidationPass {
    pub stage: String,
    pub passed: bool,
    pub checks: Vec<ClassworkValidationCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkValidationCheck {
    pub check: String,
    pub passed: bool,
    pub details: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkWorkspaceSnapshot {
    pub lesson: ConfirmedLessonContext,
    pub run: Option<ClassworkRun>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmedLessonContext {
    pub lesson_id: String,
    pub lesson_version_id: String,
    pub lesson_version_number: i64,
    pub subject: String,
    pub grade: String,
    pub topic: String,
    pub subtopic: Option<String>,
    pub learning_goals: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkRun {
    pub id: String,
    /// The task this run's work is registered under.
    ///
    /// Carried rather than derived by whoever wants to stop the run: the rule
    /// that builds it belongs to the backend, and a screen that rebuilt it by
    /// hand would silently stop nothing the day the rule changed.
    pub task_id: String,
    pub status: String,
    pub lesson_version_id: String,
    pub lesson_version_number: i64,
    pub document_version: Option<ClassworkDocumentVersion>,
    pub section_regeneration: Option<ClassworkSectionRegeneration>,
    pub sources: Vec<ClassworkSourceSummary>,
    pub figures: Vec<ClassworkFigure>,
    pub sections: Vec<ClassworkSection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkDocumentVersion {
    pub id: String,
    pub version_number: i64,
    pub status: String,
    pub change_kind: String,
    pub changed_section_id: Option<String>,
    pub teacher_direction: Option<String>,
    pub restored_from_version_number: Option<i64>,
    pub created_at: String,
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionRegeneration {
    pub id: String,
    pub section_id: String,
    pub status: String,
    pub teacher_direction: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSourceSummary {
    pub key: String,
    pub title: String,
    pub publisher: String,
    pub source_url: String,
    pub licence_name: String,
    pub licence_url: String,
    pub attribution: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkFigure {
    pub id: String,
    pub source_material_key: String,
    pub sequence: i64,
    pub caption: String,
    pub alt_text: String,
    pub width_px: i64,
    pub height_px: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSection {
    pub id: String,
    pub sequence: i64,
    pub step_title: String,
    pub status: String,
    pub title: Option<String>,
    pub learning_goal_numbers: Vec<i64>,
    pub attempt_count: i64,
    pub last_error: Option<String>,
    pub quality: Option<ClassworkQualityReport>,
    pub regenerated: bool,
    pub blocks: Vec<ClassworkBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkBlock {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub learning_goal_numbers: Vec<i64>,
    pub source_material_keys: Vec<String>,
    pub teacher_edited: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionJob {
    pub run_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub lesson: ConfirmedLessonContext,
    pub step: ClassworkStepContext,
    pub source_materials: Vec<ClassworkSource>,
    pub regeneration: Option<ClassworkRegenerationContext>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkRegenerationContext {
    pub id: String,
    pub source_version_number: i64,
    pub teacher_direction: Option<String>,
    pub previous_section: ClassworkSectionSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionSnapshot {
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub blocks: Vec<ClassworkBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionStart {
    pub job: ClassworkSectionJob,
    pub workspace: ClassworkWorkspaceSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionHistory {
    pub current_version_number: i64,
    pub versions: Vec<ClassworkSectionHistoryVersion>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSectionHistoryVersion {
    pub version_number: i64,
    pub created_at: String,
    pub change_kind: String,
    pub teacher_direction: Option<String>,
    pub restored_from_version_number: Option<i64>,
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub regenerated: bool,
    pub blocks: Vec<ClassworkBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkStepContext {
    pub sequence: i64,
    pub title: String,
    pub teacher_activity: String,
    pub learner_activity: String,
    pub duration_minutes: Option<i64>,
    pub plan_step: Option<LessonPlanStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClassworkSource {
    pub key: String,
    pub title: String,
    pub text: String,
    pub publisher: String,
    pub source_url: String,
    pub licence_name: String,
    pub licence_url: String,
    pub attribution: String,
}
