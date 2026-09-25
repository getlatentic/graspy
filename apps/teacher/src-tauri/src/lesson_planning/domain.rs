use serde::{Deserialize, Serialize};

use super::granular::{AnswerReport, GranularLessonRecord, LessonPlanFormat};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LessonInputMode {
    Structured,
    Pasted,
}

impl LessonInputMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Structured => "structured",
            Self::Pasted => "pasted",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LessonStatus {
    Draft,
    Confirmed,
}

// The authored content a hand-written lesson carries is stored as the JSON
// document the teacher edits (see lessonContent.ts), which is not Eq, so the
// snapshot and draft that hold it compare by PartialEq only.
#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonWorkspaceSnapshot {
    pub lessons: Vec<LessonSummary>,
    pub selected_lesson: Option<LessonDraft>,
    pub available_scheme_entries: Vec<LessonSchemeEntryOption>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonSummary {
    pub id: String,
    pub topic: String,
    pub subtopic: Option<String>,
    pub status: LessonStatus,
    pub input_mode: LessonInputMode,
    pub plan_format: LessonPlanFormat,
    pub latest_version_number: i64,
    pub week_ordinal: Option<i64>,
    /// Which entry of the teacher's scheme this lesson plans, so the workspace
    /// can tell a planned week from one still waiting for a plan.
    pub scheme_entry_id: Option<String>,
    /// Whether every part of this lesson's classwork is written.
    ///
    /// A teacher walks into the room with the plan *and* the worked examples
    /// and practice. Counting a confirmed plan as ready to teach told them
    /// three lessons were ready while all three had unwritten classwork.
    pub classwork_complete: bool,
    /// When the teacher started this lesson, as the library recorded it.
    ///
    /// Two drafts of the same subtopic with no week between them are alike in
    /// every other way the list can show, so this is what tells them apart.
    pub started_at: String,
}

/// Whether a lesson's classwork is finished, as one rule in one place.
///
/// Every screen that says a lesson is ready to teach must agree, and they did
/// not: the class card and the week heading both counted a confirmed plan while
/// the lesson's own screen showed its parts unwritten. The fragment reads
/// `lessons` from the enclosing query.
pub(crate) const CLASSWORK_COMPLETE_SQL: &str = "EXISTS (
         SELECT 1 FROM classwork_runs run
         WHERE run.lesson_id = lessons.id
           AND EXISTS (SELECT 1 FROM classwork_sections part
                       WHERE part.run_id = run.id)
           AND NOT EXISTS (SELECT 1 FROM classwork_sections part
                           WHERE part.run_id = run.id AND part.status <> 'done')
     )";

#[derive(Debug, Clone, PartialEq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonDraft {
    pub id: String,
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub academic_period_name: String,
    pub teaching_assignment_id: String,
    pub scheme_week_id: Option<String>,
    pub scheme_entry_id: Option<String>,
    pub input_mode: LessonInputMode,
    pub plan_format: LessonPlanFormat,
    pub topic: String,
    pub subtopic: Option<String>,
    pub raw_plan: Option<String>,
    pub source_plan_text: Option<String>,
    pub learning_goals: Vec<String>,
    pub steps: Vec<LessonStep>,
    pub instructional_materials: Vec<String>,
    pub previous_knowledge: Vec<String>,
    pub assessment: Vec<String>,
    pub assignment: Vec<String>,
    pub references: Vec<String>,
    pub curriculum_unit: Option<LessonCurriculumUnit>,
    pub curriculum_outcomes: Vec<LessonCurriculumOutcome>,
    pub status: LessonStatus,
    pub latest_version_number: i64,
    pub preparation: Option<LessonPreparation>,
    pub granular_record: Option<GranularLessonRecord>,
    /// What graspy's own checks found in this lesson's answers, where it has a
    /// detailed plan to check. A teacher is told rather than blocked: by the
    /// time they are editing a lesson, refusing the save would stop them fixing
    /// the very thing being complained about.
    pub answer_report: Option<AnswerReport>,
    /// The lesson as its teacher wrote it by hand, when it was written by hand.
    /// Owned and validated by the frontend (lessonContent.ts); the database keeps
    /// it as one JSON document, so it is carried here as-is rather than re-typed.
    pub authored_content: Option<serde_json::Value>,
    /// A student's note kept beside this lesson, when one has been written.
    pub student_note: Option<StudentNote>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct StudentNote {
    pub paragraphs: Vec<String>,
    pub written_from_version: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonPreparation {
    pub lesson_id: String,
    pub source_raw_plan: String,
    pub topic: String,
    pub subtopic: Option<String>,
    pub learning_goals: Vec<String>,
    pub steps: Vec<LessonStep>,
    pub instructional_materials: Vec<String>,
    pub previous_knowledge: Vec<String>,
    pub assessment: Vec<String>,
    pub references: Vec<String>,
    pub plan_format: LessonPlanFormat,
    pub granular_record: Option<GranularLessonRecord>,
    /// What graspy's own checks found in this lesson's answers, where it has a
    /// detailed plan to check. A teacher is told rather than blocked: by the
    /// time they are editing a lesson, refusing the save would stop them fixing
    /// the very thing being complained about.
    pub answer_report: Option<AnswerReport>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonStep {
    pub id: String,
    pub sequence: i64,
    pub title: String,
    pub teacher_activity: String,
    pub learner_activity: String,
    pub duration_minutes: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonCurriculumUnit {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonCurriculumOutcome {
    pub id: String,
    pub statement: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonSchemeEntryOption {
    pub week_id: String,
    pub week_ordinal: i64,
    pub entry_id: String,
    pub topic: String,
    pub subtopic: Option<String>,
    pub curriculum_unit: LessonCurriculumUnit,
    pub curriculum_outcomes: Vec<LessonCurriculumOutcome>,
    pub learning_goals: Vec<String>,
    pub assessment: Vec<String>,
    pub instructional_materials: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonContextRequest {
    pub academic_session_id: String,
    pub academic_period_id: String,
    pub teaching_assignment_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonWorkspaceRequest {
    pub context: LessonContextRequest,
    pub selected_lesson_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GranularLessonProgramInputRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub lesson_duration_minutes: u16,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LessonStepInput {
    pub title: String,
    pub teacher_activity: String,
    pub learner_activity: String,
    pub duration_minutes: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveLessonDraftRequest {
    pub context: LessonContextRequest,
    pub lesson_id: Option<String>,
    pub scheme_week_id: Option<String>,
    pub scheme_entry_id: Option<String>,
    pub input_mode: LessonInputMode,
    pub topic: String,
    pub subtopic: Option<String>,
    pub raw_plan: Option<String>,
    pub learning_goals: Vec<String>,
    pub steps: Vec<LessonStepInput>,
    pub instructional_materials: Vec<String>,
    pub previous_knowledge: Vec<String>,
    pub assessment: Vec<String>,
    pub assignment: Vec<String>,
    pub references: Vec<String>,
}

// A hand-authored lesson. Its content is the document the frontend owns and
// validates (lessonContent.ts); the backend keeps and returns it as-is, so it
// arrives here as a JSON value rather than a re-typed schema.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveAuthoredLessonRequest {
    pub context: LessonContextRequest,
    pub lesson_id: Option<String>,
    pub scheme_week_id: Option<String>,
    pub scheme_entry_id: Option<String>,
    pub topic: String,
    pub subtopic: Option<String>,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MoveLessonDraftRequest {
    pub lesson_id: String,
    pub source_context: LessonContextRequest,
    pub target_context: LessonContextRequest,
    pub scheme_week_id: Option<String>,
    pub scheme_entry_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscardLessonRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveGranularLessonRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub record: GranularLessonRecord,
}

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfirmGranularLessonRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedLessonDraft {
    pub input_mode: LessonInputMode,
    pub topic: String,
    pub subtopic: Option<String>,
    pub raw_plan: Option<String>,
    pub learning_goals: Vec<String>,
    pub steps: Vec<ValidatedLessonStep>,
    pub instructional_materials: Vec<String>,
    pub previous_knowledge: Vec<String>,
    pub assessment: Vec<String>,
    pub assignment: Vec<String>,
    pub references: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedLessonStep {
    pub title: String,
    pub teacher_activity: String,
    pub learner_activity: String,
    pub duration_minutes: Option<i64>,
}

impl ValidatedLessonDraft {
    pub fn new(request: &SaveLessonDraftRequest) -> Result<Self, String> {
        let topic = required_text(&request.topic, "lesson topic", 160)?;
        let subtopic = optional_text(request.subtopic.as_deref(), 160)?;
        match request.input_mode {
            LessonInputMode::Pasted => {
                let raw_plan = request
                    .raw_plan
                    .as_deref()
                    .ok_or_else(|| "Paste the lesson plan before saving this draft.".to_owned())?;
                if raw_plan.trim().is_empty() || raw_plan.chars().count() > 50_000 {
                    return Err("Paste a lesson plan between 1 and 50,000 characters.".to_owned());
                }
                if !request.learning_goals.is_empty()
                    || !request.steps.is_empty()
                    || !request.instructional_materials.is_empty()
                    || !request.previous_knowledge.is_empty()
                    || !request.assessment.is_empty()
                    || !request.assignment.is_empty()
                    || !request.references.is_empty()
                {
                    return Err(
                        "A pasted lesson stays unchanged until it is prepared for review."
                            .to_owned(),
                    );
                }
                Ok(Self {
                    input_mode: request.input_mode,
                    topic,
                    subtopic,
                    raw_plan: Some(raw_plan.to_owned()),
                    learning_goals: vec![],
                    steps: vec![],
                    instructional_materials: vec![],
                    previous_knowledge: vec![],
                    assessment: vec![],
                    assignment: vec![],
                    references: vec![],
                })
            }
            LessonInputMode::Structured => {
                if request.raw_plan.is_some() {
                    return Err(
                        "Structured lessons cannot contain an unreviewed pasted plan.".to_owned(),
                    );
                }
                let steps = validate_optional_steps(&request.steps)?;
                Ok(Self {
                    input_mode: request.input_mode,
                    topic,
                    subtopic,
                    raw_plan: None,
                    learning_goals: required_list(
                        &request.learning_goals,
                        "learning goal",
                        12,
                        500,
                    )?,
                    steps,
                    instructional_materials: clean_list(
                        &request.instructional_materials,
                        "material",
                        30,
                        300,
                    )?,
                    previous_knowledge: clean_list(
                        &request.previous_knowledge,
                        "previous knowledge item",
                        12,
                        500,
                    )?,
                    assessment: clean_list(&request.assessment, "assessment item", 20, 500)?,
                    assignment: clean_list(&request.assignment, "assignment line", 12, 500)?,
                    references: clean_list(&request.references, "reference", 30, 500)?,
                })
            }
        }
    }
}

/// A draft is a teacher's work in progress: the teaching sequence may still be
/// empty. Completeness is enforced when the lesson is confirmed.
fn validate_optional_steps(steps: &[LessonStepInput]) -> Result<Vec<ValidatedLessonStep>, String> {
    if steps.is_empty() {
        return Ok(vec![]);
    }
    validate_steps(steps)
}

fn validate_steps(steps: &[LessonStepInput]) -> Result<Vec<ValidatedLessonStep>, String> {
    if steps.is_empty() || steps.len() > 20 {
        return Err("Add between 1 and 20 lesson steps.".to_owned());
    }
    steps
        .iter()
        .map(|step| {
            if step
                .duration_minutes
                .is_some_and(|duration| !(1..=240).contains(&duration))
            {
                return Err("Keep each lesson step between 1 and 240 minutes.".to_owned());
            }
            Ok(ValidatedLessonStep {
                title: required_text(&step.title, "step title", 160)?,
                teacher_activity: required_text(&step.teacher_activity, "teacher activity", 2_000)?,
                learner_activity: required_text(&step.learner_activity, "learner activity", 2_000)?,
                duration_minutes: step.duration_minutes,
            })
        })
        .collect()
}

fn required_text(value: &str, label: &str, max: usize) -> Result<String, String> {
    let value = normalize_display(value);
    if value.is_empty() || value.chars().count() > max {
        return Err(format!("Enter a {label} between 1 and {max} characters."));
    }
    Ok(value)
}

fn optional_text(value: Option<&str>, max: usize) -> Result<Option<String>, String> {
    let value = value
        .map(normalize_display)
        .filter(|value| !value.is_empty());
    if value
        .as_ref()
        .is_some_and(|value| value.chars().count() > max)
    {
        return Err(format!("Keep this value under {max} characters."));
    }
    Ok(value)
}

fn required_list(
    values: &[String],
    label: &str,
    max_items: usize,
    max_chars: usize,
) -> Result<Vec<String>, String> {
    let values = clean_list(values, label, max_items, max_chars)?;
    if values.is_empty() {
        return Err(format!("Add at least one {label}."));
    }
    Ok(values)
}

fn clean_list(
    values: &[String],
    label: &str,
    max_items: usize,
    max_chars: usize,
) -> Result<Vec<String>, String> {
    let values = values
        .iter()
        .map(|value| normalize_display(value))
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if values.len() > max_items || values.iter().any(|value| value.chars().count() > max_chars) {
        return Err(format!(
            "Keep {label}s to {max_items} items and {max_chars} characters each."
        ));
    }
    Ok(values)
}

fn normalize_display(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}
