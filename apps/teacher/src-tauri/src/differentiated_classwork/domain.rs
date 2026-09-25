use serde::{Deserialize, Serialize};

use crate::{
    classwork::domain::{
        ClassworkBlock, ClassworkQualityReport, ClassworkSource, ConfirmedLessonContext,
        GeneratedClassworkSectionInput,
    },
    lesson_planning::LessonContextRequest,
};

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedWorkspaceRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

pub type StartDifferentiatedRunRequest = DifferentiatedWorkspaceRequest;

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunDifferentiatedGenerationRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub section_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BeginDifferentiatedSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub section_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompleteDifferentiatedSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub group_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub section: GeneratedClassworkSectionInput,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct FailDifferentiatedSectionRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub group_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub message: String,
    pub quality: Option<ClassworkQualityReport>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CancelDifferentiatedRunRequest {
    pub context: LessonContextRequest,
    pub run_id: String,
    pub group_id: String,
    pub section_id: String,
    pub generation_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkWorkspaceSnapshot {
    pub lesson: ConfirmedLessonContext,
    pub readiness: DifferentiatedClassworkReadiness,
    pub run: Option<DifferentiatedClassworkRun>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkReadiness {
    pub can_start: bool,
    pub blockers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkRun {
    pub id: String,
    /// The task this run's work is registered under, so a screen stops the run
    /// by a value the backend gave it rather than one it rebuilt.
    pub task_id: String,
    pub status: String,
    pub base_run_id: String,
    pub evidence_set_id: String,
    pub evidence_revision: i64,
    pub groups: Vec<DifferentiatedClassworkGroup>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkGroup {
    pub id: String,
    pub evidence_group_id: String,
    pub position: i64,
    pub name: String,
    pub learner_state: Vec<PersonalisationLearningGoalState>,
    pub session_signals: PersonalisationSessionSignals,
    pub sections: Vec<DifferentiatedClassworkSection>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonalisationLearningGoalState {
    pub learning_goal_number: i64,
    pub learning_goal: String,
    pub mastery_band: String,
    pub mastery: String,
    pub confidence: Option<String>,
    pub perceived_difficulty: Option<String>,
    pub common_misunderstanding: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PersonalisationSessionSignals {
    pub interest: Option<String>,
    pub lesson_feeling: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkSection {
    pub id: String,
    pub base_section_id: String,
    pub sequence: i64,
    pub step_title: String,
    pub status: String,
    pub attempt_count: i64,
    pub last_error: Option<String>,
    pub title: Option<String>,
    pub learning_goal_numbers: Vec<i64>,
    pub quality: Option<ClassworkQualityReport>,
    pub base_section: DifferentiatedClassworkBaseSection,
    pub blocks: Vec<DifferentiatedClassworkBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkBaseSection {
    pub id: String,
    pub sequence: i64,
    pub step_title: String,
    pub title: String,
    pub learning_goal_numbers: Vec<i64>,
    pub blocks: Vec<ClassworkBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkBlock {
    pub id: String,
    pub base_block_id: String,
    pub kind: String,
    pub text: String,
    pub learning_goal_numbers: Vec<i64>,
    pub source_material_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkSectionJob {
    pub run_id: String,
    pub group_id: String,
    pub section_id: String,
    pub generation_token: String,
    pub lesson: DifferentiatedLessonContext,
    pub group: DifferentiatedGroupContext,
    pub base_section: DifferentiatedClassworkBaseSection,
    pub source_materials: Vec<ClassworkSource>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedLessonContext {
    pub topic: String,
    pub learning_goals: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedGroupContext {
    pub name: String,
    pub learning_goals: Vec<PersonalisationLearningGoalState>,
    pub session_signals: PersonalisationSessionSignals,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct DifferentiatedClassworkSectionStart {
    pub job: DifferentiatedClassworkSectionJob,
    pub workspace: DifferentiatedClassworkWorkspaceSnapshot,
}
