use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LessonPlanFormat {
    LegacyImport,
    Granular,
}

impl LessonPlanFormat {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "legacy_import" => Ok(Self::LegacyImport),
            "granular" => Ok(Self::Granular),
            _ => Err("The saved lesson format is not supported.".to_owned()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeType {
    Concept,
    Procedure,
    Representation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum BloomLevel {
    Remember,
    Understand,
    Apply,
    Analyze,
    Evaluate,
    Create,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum LessonStepRole {
    Introduction,
    Core,
    Evaluation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CurriculumObjectiveRef {
    pub id: String,
    pub statement: String,
    pub sequence: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AtomicObjective {
    pub id: String,
    pub curriculum_objective_id: String,
    pub statement: String,
    pub bloom_verb: String,
    pub bloom_level: BloomLevel,
    pub sequence: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KnowledgeComponent {
    pub id: String,
    pub description: String,
    pub knowledge_type: KnowledgeType,
    pub bloom_level: BloomLevel,
    pub atomic_objective_ids: Vec<String>,
    pub prerequisite_knowledge_component_ids: Vec<String>,
    pub supporting_record_ids: Vec<String>,
    pub source_form: Option<String>,
    pub target_form: Option<String>,
    pub is_prior_knowledge: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LessonObjective {
    pub id: String,
    pub statement: String,
    pub sequence: u16,
    pub curriculum_objective_id: String,
    pub atomic_objective_id: String,
    pub knowledge_component_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Misconception {
    pub id: String,
    pub statement: String,
    pub correction: String,
    pub knowledge_component_ids: Vec<String>,
    pub supporting_record_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PriorKnowledgeItem {
    pub id: String,
    pub statement: String,
    pub knowledge_component_ids: Vec<String>,
    pub supporting_record_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LessonReference {
    pub record_id: String,
    pub title: String,
    pub attribution: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkedExampleStep {
    pub label: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LessonContentBlock {
    Explanation {
        id: String,
        content: String,
    },
    WorkedExample {
        id: String,
        problem: String,
        steps: Vec<WorkedExampleStep>,
        final_answer: String,
    },
    Practice {
        id: String,
        lesson_objective_id: String,
        question: String,
        expected_answer: String,
        hints: Vec<String>,
    },
    Visual {
        id: String,
        source_record_id: String,
        asset_file_name: String,
        figure_sha256: String,
        caption: String,
        alt_text: String,
    },
}

impl LessonContentBlock {
    pub(super) fn id(&self) -> &str {
        match self {
            Self::Explanation { id, .. }
            | Self::WorkedExample { id, .. }
            | Self::Practice { id, .. }
            | Self::Visual { id, .. } => id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LessonPlanStep {
    pub id: String,
    pub sequence: u16,
    pub role: LessonStepRole,
    pub title: String,
    pub summary: String,
    pub duration_minutes: u16,
    pub lesson_objective_id: Option<String>,
    pub knowledge_type: Option<KnowledgeType>,
    pub teacher_activities: Vec<String>,
    pub learner_activities: Vec<String>,
    pub blocks: Vec<LessonContentBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssessmentItem {
    pub id: String,
    pub lesson_objective_id: String,
    pub knowledge_component_id: String,
    pub question: String,
    pub expected_answer: String,
    pub bloom_level: BloomLevel,
    pub rubric: Vec<String>,
    pub supporting_record_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GranularLessonPlan {
    pub schema_version: u16,
    pub topic: String,
    pub subtopic: Option<String>,
    pub curriculum_objectives: Vec<CurriculumObjectiveRef>,
    pub atomic_objectives: Vec<AtomicObjective>,
    pub lesson_objectives: Vec<LessonObjective>,
    pub knowledge_components: Vec<KnowledgeComponent>,
    pub misconceptions: Vec<Misconception>,
    pub prior_knowledge: Vec<PriorKnowledgeItem>,
    /// A confirmed plan is sealed by a digest and a trigger holds it immutable,
    /// so the key it was written under cannot be rewritten and is not renamed
    /// here. The field is the code's name; `materials` is the record's.
    #[serde(rename = "materials")]
    pub instructional_materials: Vec<String>,
    pub references: Vec<LessonReference>,
    pub steps: Vec<LessonPlanStep>,
    pub assessments: Vec<AssessmentItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
/// A lesson either comes from an installed curriculum, in which case every field
/// below names exactly which one, or the teacher wrote it themselves and there is
/// no package to name. Partly-filled provenance is rejected: a teacher reading
/// the sources on their classwork has to be able to trust what it says.
pub struct CurriculumSnapshot {
    pub package_id: Option<String>,
    pub package_title: Option<String>,
    pub package_sha256: Option<String>,
    pub course_id: Option<String>,
    pub curriculum_node_id: Option<String>,
    pub objectives: Vec<CurriculumObjectiveRef>,
    pub atomic_objectives: Vec<AtomicObjective>,
    pub knowledge_components: Vec<KnowledgeComponent>,
}

impl CurriculumSnapshot {
    pub(super) fn provenance_fields(&self) -> [&Option<String>; 5] {
        [
            &self.package_id,
            &self.package_title,
            &self.package_sha256,
            &self.course_id,
            &self.curriculum_node_id,
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceEvidenceRecord {
    pub record_id: String,
    pub title: String,
    pub excerpt: String,
    pub excerpt_sha256: String,
    pub attribution: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceEvidenceFigure {
    pub source_record_id: String,
    pub asset_file_name: String,
    pub sha256: String,
    pub caption: String,
    pub alt_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceEvidenceSnapshot {
    pub records: Vec<SourceEvidenceRecord>,
    pub figures: Vec<SourceEvidenceFigure>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LessonProgramSnapshot {
    pub program_id: String,
    pub program_version: String,
    pub program_digest: String,
    pub program_run_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GranularLessonRecord {
    pub plan: GranularLessonPlan,
    pub curriculum_snapshot: CurriculumSnapshot,
    pub source_evidence_snapshot: SourceEvidenceSnapshot,
    pub program_snapshot: LessonProgramSnapshot,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The confirmed plan is sealed by a digest and held immutable, so the key
    /// it was written under is fixed. A rename here would read back as "The
    /// detailed lesson plan could not be read" on every lesson already
    /// confirmed, and the record could not be rewritten to match.
    #[test]
    fn a_sealed_plan_is_still_read_under_the_key_it_was_written_with() {
        let plan: GranularLessonPlan = serde_json::from_value(serde_json::json!({
            "schemaVersion": 1,
            "topic": "Fractions",
            "subtopic": null,
            "curriculumObjectives": [],
            "atomicObjectives": [],
            "lessonObjectives": [],
            "knowledgeComponents": [],
            "misconceptions": [],
            "priorKnowledge": [],
            "materials": ["Fraction wall"],
            "references": [],
            "steps": [],
            "assessments": []
        }))
        .expect("a plan a previous release confirmed");

        assert_eq!(
            plan.instructional_materials,
            vec!["Fraction wall".to_owned()]
        );
    }

    /// The screen reading this plan is written in another language and checks
    /// what arrives against its own schema, so these key names are a contract
    /// between the two. Both suites passed while they disagreed, and the lesson
    /// list came back as "Lessons unavailable" in the packaged app.
    /// `granularLesson.ts` holds the other half.
    #[test]
    fn a_plan_reaches_the_screen_under_the_exact_names_it_reads() {
        let plan = GranularLessonPlan {
            schema_version: 1,
            topic: "Fractions".to_owned(),
            subtopic: None,
            curriculum_objectives: vec![],
            atomic_objectives: vec![],
            lesson_objectives: vec![],
            knowledge_components: vec![],
            misconceptions: vec![],
            prior_knowledge: vec![],
            instructional_materials: vec!["Fraction wall".to_owned()],
            references: vec![],
            steps: vec![],
            assessments: vec![],
        };

        let wire = serde_json::to_value(&plan).expect("the plan on the wire");
        let mut keys: Vec<&str> = wire
            .as_object()
            .expect("an object")
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();

        assert_eq!(
            keys,
            vec![
                "assessments",
                "atomicObjectives",
                "curriculumObjectives",
                "knowledgeComponents",
                "lessonObjectives",
                "materials",
                "misconceptions",
                "priorKnowledge",
                "references",
                "schemaVersion",
                "steps",
                "subtopic",
                "topic",
            ]
        );
    }
}
