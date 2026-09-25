use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::Value;

use crate::{
    content_corpus::ContentCorpus,
    db::Database,
    generation_program::{
        domain::{RuntimeFault, RuntimeFaultKind},
        evaluation::{
            CaseCoverage, CriterionFinding, EvaluationCase, EvaluationDatasetPackage,
            EvaluationSuite,
        },
    },
};

use super::{
    granular::{
        answer_report, AtomicObjective, BloomLevel, CurriculumObjectiveRef, CurriculumSnapshot,
        GranularLessonPlan, KnowledgeComponent, KnowledgeType, LessonContentBlock, LessonStepRole,
    },
    mathematics::check_fraction_answer,
    program::GranularLessonProgramInput,
    repository::load_source_evidence,
};

const PACKAGE_KEY: &str = "ai.graspy.curriculum.ng.nerdc.jss1.mathematics";
const COURSE_KEY: &str = "mathematics-jss1";
/// The engine build the qualification was run against. A different engine can
/// tokenise or sample differently, so it belongs in the identity beside the
/// model's own digest.
const QUALIFIED_ENGINE_BUILD: &str = "9960-a935fbffe";

/// Names the exact artefact a qualification scored, so an audit cannot be read
/// as covering a model it never saw.
fn qualification_identity(manifest: crate::model_catalogue::ModelManifest) -> String {
    let publisher = manifest
        .repository
        .split('/')
        .next()
        .unwrap_or(manifest.repository);
    format!(
        "{publisher}/{}@{};sha256={};llama.cpp={QUALIFIED_ENGINE_BUILD}",
        manifest.file_name, manifest.revision, manifest.sha256,
    )
}

/// Which model this run is scoring. Defaults to what a teacher gets without
/// choosing; set `GRASPY_QUALIFICATION_MODEL` to a catalogue id to qualify
/// another one before it is offered.
fn model_under_qualification() -> &'static crate::model_catalogue::LessonModel {
    match std::env::var("GRASPY_QUALIFICATION_MODEL") {
        Ok(id) => crate::model_catalogue::find(&id)
            .unwrap_or_else(|| panic!("GRASPY_QUALIFICATION_MODEL={id} is not in the catalogue")),
        Err(_) => crate::model_catalogue::default_model(),
    }
}
const DATASET: &str =
    include_str!("../../resources/content/generation-evaluation/ordering-fractions-v1.json");

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewedCaseInput {
    lesson_context: ReviewedLessonContext,
    source_material: Vec<ReviewedSourceMaterial>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewedLessonContext {
    country_code: String,
    subject: String,
    class_level: String,
    topic: String,
    subtopic: String,
    learning_goals: Vec<ReviewedLearningGoal>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewedLearningGoal {
    code: String,
    text: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewedSourceMaterial {
    record_id: String,
    role: String,
    learning_goal_code: String,
    text: String,
    expected_answer: Option<String>,
}

struct InstalledCourse {
    database_id: String,
    stable_id: String,
    package_id: String,
    package_title: String,
    package_sha256: String,
}

pub(crate) fn ordering_fractions_suite(
    database: &Database,
    corpus: &ContentCorpus,
) -> Result<EvaluationSuite, RuntimeFault> {
    let mut package = EvaluationDatasetPackage::parse(DATASET)?;
    for case in &mut package.cases {
        *case = resolve_case(database, corpus, case)?;
    }
    package.bind(score_ordering_fractions)
}

fn resolve_case(
    database: &Database,
    corpus: &ContentCorpus,
    case: &EvaluationCase,
) -> Result<EvaluationCase, RuntimeFault> {
    let reviewed: ReviewedCaseInput =
        serde_json::from_value(case.input.clone()).map_err(|error| {
            evaluation_fault(format!("The reviewed lesson input is invalid: {error}"))
        })?;
    validate_reviewed_context(&reviewed)?;
    let curriculum_snapshot = database
        .with_connection(|connection| load_curriculum_snapshot(connection, &reviewed))
        .map_err(evaluation_fault)?;
    let source_record_ids = reviewed
        .source_material
        .iter()
        .map(|source| source.record_id.clone())
        .collect::<Vec<_>>();
    let source_evidence_snapshot =
        load_source_evidence(corpus, &source_record_ids).map_err(evaluation_fault)?;
    if source_evidence_snapshot.records.len() != source_record_ids.len() {
        return Err(evaluation_fault(
            "The reviewed source boundary did not resolve exactly.",
        ));
    }
    let program_input = GranularLessonProgramInput {
        topic: reviewed.lesson_context.topic.clone(),
        subtopic: Some(reviewed.lesson_context.subtopic.clone()),
        teacher_source: None,
        lesson_duration_minutes: 60,
        curriculum_snapshot,
        source_evidence_snapshot,
    };
    let mut expected = case.expected.clone();
    let expected_object = expected
        .as_object_mut()
        .ok_or_else(|| evaluation_fault("The reviewed expected result must be an object."))?;
    expected_object.insert(
        "requiredLearningGoalStatements".to_owned(),
        serde_json::to_value(
            reviewed
                .lesson_context
                .learning_goals
                .iter()
                .map(|goal| goal.text.as_str())
                .collect::<Vec<_>>(),
        )
        .map_err(evaluation_fault)?,
    );
    expected_object.insert(
        "reviewedQuestions".to_owned(),
        serde_json::to_value(
            reviewed
                .source_material
                .iter()
                .filter_map(|source| {
                    source
                        .expected_answer
                        .as_ref()
                        .map(|answer| (&source.text, answer))
                })
                .collect::<BTreeMap<_, _>>(),
        )
        .map_err(evaluation_fault)?,
    );
    Ok(EvaluationCase {
        key: case.key.clone(),
        covers: case.covers.clone(),
        input: program_input.to_value().map_err(evaluation_fault)?,
        expected,
    })
}

fn validate_reviewed_context(reviewed: &ReviewedCaseInput) -> Result<(), RuntimeFault> {
    let context = &reviewed.lesson_context;
    if context.country_code != "NG"
        || context.subject != "Mathematics"
        || context.class_level != "JSS 1"
        || context.learning_goals.is_empty()
        || reviewed.source_material.is_empty()
    {
        return Err(evaluation_fault(
            "The reviewed case does not identify the supported Nigeria JSS 1 Mathematics scope.",
        ));
    }
    let goal_codes = context
        .learning_goals
        .iter()
        .map(|goal| goal.code.as_str())
        .collect::<BTreeSet<_>>();
    if goal_codes.len() != context.learning_goals.len()
        || reviewed.source_material.iter().any(|source| {
            !goal_codes.contains(source.learning_goal_code.as_str())
                || !matches!(source.role.as_str(), "workedExample" | "practice")
        })
    {
        return Err(evaluation_fault(
            "The reviewed source material is not aligned to its learning goals.",
        ));
    }
    Ok(())
}

fn load_curriculum_snapshot(
    connection: &Connection,
    reviewed: &ReviewedCaseInput,
) -> Result<CurriculumSnapshot, String> {
    let course = connection
        .query_row(
            "SELECT curriculum_courses.id, curriculum_courses.course_key,
                    curriculum_packages.package_key, curriculum_packages.title,
                    curriculum_packages.payload_sha256
             FROM curriculum_courses
             JOIN curriculum_frameworks
               ON curriculum_frameworks.id = curriculum_courses.framework_id
             JOIN curriculum_packages
               ON curriculum_packages.id = curriculum_frameworks.package_id
             WHERE curriculum_packages.package_key = ?1
               AND curriculum_courses.course_key = ?2",
            params![PACKAGE_KEY, COURSE_KEY],
            |row| {
                Ok(InstalledCourse {
                    database_id: row.get(0)?,
                    stable_id: row.get(1)?,
                    package_id: row.get(2)?,
                    package_title: row.get(3)?,
                    package_sha256: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "The reviewed curriculum package is not installed.".to_owned())?;

    let mut atomic_objectives = Vec::new();
    let mut objectives = Vec::new();
    let mut objective_codes = BTreeSet::new();
    let mut subtopic_code = None;
    for (index, goal) in reviewed.lesson_context.learning_goals.iter().enumerate() {
        let row = connection
            .query_row(
                "SELECT atomic_learning_objectives.source_code,
                        atomic_learning_objectives.statement,
                        atomic_learning_objectives.bloom_verb,
                        atomic_learning_objectives.bloom_level,
                        objective_node.source_code,
                        COALESCE(objective_node.statement, objective_node.title),
                        subtopic_node.source_code
                 FROM atomic_learning_objectives
                 JOIN curriculum_nodes AS objective_node
                   ON objective_node.id = atomic_learning_objectives.curriculum_node_id
                 JOIN curriculum_nodes AS subtopic_node
                   ON subtopic_node.id = objective_node.parent_node_id
                 WHERE atomic_learning_objectives.curriculum_course_id = ?1
                   AND atomic_learning_objectives.source_code = ?2",
                params![course.database_id, goal.code],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| format!("The reviewed learning goal {} is not installed.", goal.code))?;
        if row.1 != goal.text {
            return Err(format!(
                "The installed statement for {} does not match the reviewed case.",
                goal.code
            ));
        }
        if subtopic_code.as_ref().is_some_and(|code| code != &row.6) {
            return Err("The reviewed learning goals span multiple curriculum entries.".to_owned());
        }
        subtopic_code = Some(row.6);
        if objective_codes.insert(row.4.clone()) {
            objectives.push(CurriculumObjectiveRef {
                id: row.4.clone(),
                statement: row.5,
                sequence: u16::try_from(objectives.len() + 1)
                    .map_err(|_| "The reviewed case has too many objectives.".to_owned())?,
            });
        }
        atomic_objectives.push(AtomicObjective {
            id: row.0,
            curriculum_objective_id: row.4,
            statement: row.1,
            bloom_verb: row.2,
            bloom_level: parse_bloom_level(&row.3)?,
            sequence: u16::try_from(index + 1)
                .map_err(|_| "The reviewed case has too many learning goals.".to_owned())?,
        });
    }
    let selected_codes = atomic_objectives
        .iter()
        .map(|objective| objective.id.as_str())
        .collect::<BTreeSet<_>>();
    verify_reviewed_source_links(connection, &course.database_id, reviewed, &selected_codes)?;
    let knowledge_components =
        load_knowledge_components(connection, &course.database_id, &selected_codes, reviewed)?;

    Ok(CurriculumSnapshot {
        package_id: Some(course.package_id),
        package_title: Some(course.package_title),
        package_sha256: Some(course.package_sha256),
        course_id: Some(course.stable_id),
        curriculum_node_id: Some(
            subtopic_code
                .ok_or_else(|| "The reviewed curriculum entry was not resolved.".to_owned())?,
        ),
        objectives,
        atomic_objectives,
        knowledge_components,
    })
}

fn verify_reviewed_source_links(
    connection: &Connection,
    course_id: &str,
    reviewed: &ReviewedCaseInput,
    selected_codes: &BTreeSet<&str>,
) -> Result<(), String> {
    for source in &reviewed.source_material {
        if !selected_codes.contains(source.learning_goal_code.as_str()) {
            return Err("The reviewed source link is outside the selected goals.".to_owned());
        }
        let exists = connection
            .query_row(
                "SELECT 1 FROM curriculum_source_links
                 JOIN atomic_learning_objectives
                   ON atomic_learning_objectives.id = curriculum_source_links.atomic_objective_id
                 WHERE curriculum_source_links.curriculum_course_id = ?1
                   AND atomic_learning_objectives.source_code = ?2
                   AND curriculum_source_links.record_id = ?3",
                params![course_id, source.learning_goal_code, source.record_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();
        if !exists {
            return Err(format!(
                "Reviewed source {} is not linked to {} in the installed curriculum.",
                source.record_id, source.learning_goal_code
            ));
        }
    }
    Ok(())
}

fn load_knowledge_components(
    connection: &Connection,
    course_id: &str,
    selected_codes: &BTreeSet<&str>,
    reviewed: &ReviewedCaseInput,
) -> Result<Vec<KnowledgeComponent>, String> {
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT knowledge_components.id, knowledge_components.code,
                    knowledge_components.description, knowledge_components.knowledge_type,
                    knowledge_components.bloom_level
             FROM knowledge_components
             JOIN knowledge_component_objectives
               ON knowledge_component_objectives.knowledge_component_id = knowledge_components.id
             JOIN atomic_learning_objectives
               ON atomic_learning_objectives.id = knowledge_component_objectives.atomic_objective_id
             WHERE knowledge_components.curriculum_course_id = ?1
             ORDER BY knowledge_components.code",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([course_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let mut components = Vec::new();
    for (database_id, code, description, knowledge_type, bloom_level) in rows {
        let mut objective_statement = connection
            .prepare(
                "SELECT atomic_learning_objectives.source_code
                 FROM knowledge_component_objectives
                 JOIN atomic_learning_objectives
                   ON atomic_learning_objectives.id = knowledge_component_objectives.atomic_objective_id
                 WHERE knowledge_component_objectives.knowledge_component_id = ?1
                 ORDER BY atomic_learning_objectives.source_code",
            )
            .map_err(|error| error.to_string())?;
        let objective_codes = objective_statement
            .query_map([&database_id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
            .into_iter()
            .filter(|objective| selected_codes.contains(objective.as_str()))
            .collect::<Vec<_>>();
        if objective_codes.is_empty() {
            continue;
        }
        let supporting_record_ids = reviewed
            .source_material
            .iter()
            .filter(|source| objective_codes.contains(&source.learning_goal_code))
            .map(|source| source.record_id.clone())
            .collect::<Vec<_>>();
        let mut prerequisite_statement = connection
            .prepare(
                "SELECT prerequisite.code
                 FROM knowledge_component_prerequisites
                 JOIN knowledge_components AS prerequisite
                   ON prerequisite.id = knowledge_component_prerequisites.prerequisite_knowledge_component_id
                 WHERE knowledge_component_prerequisites.knowledge_component_id = ?1
                 ORDER BY prerequisite.code",
            )
            .map_err(|error| error.to_string())?;
        let prerequisites = prerequisite_statement
            .query_map([&database_id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        components.push(KnowledgeComponent {
            id: code,
            description,
            knowledge_type: parse_knowledge_type(&knowledge_type)?,
            bloom_level: parse_bloom_level(&bloom_level)?,
            atomic_objective_ids: objective_codes,
            prerequisite_knowledge_component_ids: prerequisites,
            supporting_record_ids,
            source_form: None,
            target_form: None,
            is_prior_knowledge: false,
        });
    }
    for objective in selected_codes {
        if !components.iter().any(|component| {
            component
                .atomic_objective_ids
                .iter()
                .any(|id| id == objective)
        }) {
            return Err(format!(
                "Reviewed learning goal {objective} has no installed knowledge component."
            ));
        }
    }
    Ok(components)
}

fn score_ordering_fractions(
    expected: &Value,
    outputs: &BTreeMap<String, Value>,
) -> BTreeMap<String, CriterionFinding> {
    let Some(plan) = outputs
        .get("lessonPlan")
        .and_then(|value| serde_json::from_value::<GranularLessonPlan>(value.clone()).ok())
    else {
        return nothing_came_back();
    };
    BTreeMap::from([
        (
            "objectiveAlignment".to_owned(),
            works_through_the_asked_goals(expected, &plan),
        ),
        (
            "sourceBoundary".to_owned(),
            cites_only_what_it_was_given(expected, &plan),
        ),
        (
            "mathematicalCorrectness".to_owned(),
            answers_the_questions_correctly(expected, &plan),
        ),
        (
            "lessonCompleteness".to_owned(),
            carries_every_part_a_lesson_needs(expected, &plan),
        ),
        ("answersChecked".to_owned(), how_many_answers_were_checked(&plan)),
    ])
}

/// The lesson works through the goals it was asked for, and no others.
fn works_through_the_asked_goals(expected: &Value, plan: &GranularLessonPlan) -> CriterionFinding {
    let asked = strings(expected, "requiredLearningGoalCodes");
    let worked = plan
        .atomic_objectives
        .iter()
        .map(|objective| objective.id.as_str())
        .collect::<BTreeSet<_>>();
    CriterionFinding::holds(
        asked == worked,
        vec![
            format!("asked for {}", listed(&asked)),
            format!("worked through {}", listed(&worked)),
        ],
    )
}

/// Every source the lesson cites is one it was given, and none is one it was
/// told to leave out.
fn cites_only_what_it_was_given(expected: &Value, plan: &GranularLessonPlan) -> CriterionFinding {
    let given = strings(expected, "requiredSourceRecordIds");
    let withheld = strings(expected, "excludedSourceRecordIds");
    let cited = plan
        .references
        .iter()
        .map(|reference| reference.record_id.as_str())
        .collect::<BTreeSet<_>>();
    let strayed = cited.intersection(&withheld).copied().collect::<BTreeSet<_>>();
    CriterionFinding::holds(
        cited == given && strayed.is_empty(),
        vec![
            format!("given {}", listed(&given)),
            format!("cited {}", listed(&cited)),
            format!("told to leave out {}", listed(&withheld)),
            format!("reached for withheld {}", listed(&strayed)),
        ],
    )
}

/// The worked answers are right, checked by arithmetic rather than by asking
/// the model whether it agrees with itself.
fn answers_the_questions_correctly(
    expected: &Value,
    plan: &GranularLessonPlan,
) -> CriterionFinding {
    let written = plan
        .assessments
        .iter()
        .map(|assessment| assessment.expected_answer.as_str())
        .chain(plan.steps.iter().flat_map(|step| {
            step.blocks.iter().filter_map(|block| match block {
                LessonContentBlock::Practice {
                    expected_answer, ..
                } => Some(expected_answer.as_str()),
                _ => None,
            })
        }))
        .collect::<Vec<_>>();
    let reviewed = expected
        .get("reviewedQuestions")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut evidence = Vec::new();
    let mut every_question_answered = reviewed.len() == 2;
    for (question, reviewed_answer) in &reviewed {
        let answered = reviewed_answer.as_str().is_some_and(|answer| {
            !check_fraction_answer(question, answer).is_wrong()
                && written.iter().any(|candidate| {
                    !check_fraction_answer(question, candidate).is_wrong()
                })
        });
        every_question_answered &= answered;
        evidence.push(format!(
            "{question} was {}",
            if answered { "answered correctly" } else { "not answered correctly" }
        ));
    }
    if reviewed.len() != 2 {
        evidence.push(format!("{} reviewed questions, expected 2", reviewed.len()));
    }
    CriterionFinding::holds(every_question_answered, evidence)
}

/// The lesson has each part it was asked to have — an explanation, a worked
/// example, practice, and an answer to what it assesses.
fn carries_every_part_a_lesson_needs(
    expected: &Value,
    plan: &GranularLessonPlan,
) -> CriterionFinding {
    let core = plan
        .steps
        .iter()
        .filter(|step| step.role == LessonStepRole::Core)
        .flat_map(|step| step.blocks.iter())
        .collect::<Vec<_>>();
    let present = BTreeMap::from([
        (
            "explanation",
            core.iter()
                .any(|block| matches!(block, LessonContentBlock::Explanation { .. })),
        ),
        (
            "workedExample",
            core.iter()
                .any(|block| matches!(block, LessonContentBlock::WorkedExample { .. })),
        ),
        (
            "practice",
            core.iter()
                .any(|block| matches!(block, LessonContentBlock::Practice { .. })),
        ),
        (
            "assessmentAnswer",
            !plan.assessments.is_empty()
                && plan
                    .assessments
                    .iter()
                    .all(|assessment| !assessment.expected_answer.trim().is_empty()),
        ),
    ]);
    let asked = strings(expected, "requiredLessonParts");
    let missing = asked
        .iter()
        .filter(|part| !present.get(*part).copied().unwrap_or(false))
        .copied()
        .collect::<BTreeSet<_>>();
    CriterionFinding::holds(
        missing.is_empty(),
        vec![
            format!("asked for {}", listed(&asked)),
            format!("missing {}", listed(&missing)),
        ],
    )
}

/// How much of what the lesson will hand a class graspy can vouch for.
///
/// Reported rather than gated: it is a fact about how far the checkers reach,
/// not about whether this model wrote a good lesson, and it is worth measuring
/// for a while before anything is promoted or refused on it.
fn how_many_answers_were_checked(plan: &GranularLessonPlan) -> CriterionFinding {
    let coverage = answer_report(plan);
    let read = coverage.checked + coverage.wrong.len();
    let mut evidence = vec![format!("checked {read} of {} answers", (coverage.checked + coverage.unchecked + coverage.wrong.len()))];
    evidence.extend(
        coverage
            .wrong
            .iter()
            .map(|wrong| format!("wrong: {}", wrong.problem)),
    );
    CriterionFinding {
        score: if (coverage.checked + coverage.unchecked + coverage.wrong.len()) == 0 {
            1.0
        } else {
            read as f64 / (coverage.checked + coverage.unchecked + coverage.wrong.len()) as f64
        },
        evidence: crate::generation_program::domain::bounded_diagnostics(evidence),
    }
}

/// A criterion reads as a sentence, so an empty set says so rather than
/// trailing off after "cited".
fn listed(values: &BTreeSet<&str>) -> String {
    if values.is_empty() {
        return "nothing".to_owned();
    }
    values.iter().copied().collect::<Vec<_>>().join(", ")
}

fn strings<'a>(value: &'a Value, key: &str) -> BTreeSet<&'a str> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect()
}

fn nothing_came_back() -> BTreeMap<String, CriterionFinding> {
    ["objectiveAlignment", "sourceBoundary", "mathematicalCorrectness", "lessonCompleteness"]
        .into_iter()
        .map(|criterion| {
            (
                criterion.to_owned(),
                CriterionFinding::holds(false, vec!["no lesson plan came back to score".to_owned()]),
            )
        })
        .collect()
}

fn parse_bloom_level(value: &str) -> Result<BloomLevel, String> {
    match value {
        "remember" => Ok(BloomLevel::Remember),
        "understand" => Ok(BloomLevel::Understand),
        "apply" => Ok(BloomLevel::Apply),
        "analyze" => Ok(BloomLevel::Analyze),
        "evaluate" => Ok(BloomLevel::Evaluate),
        "create" => Ok(BloomLevel::Create),
        _ => Err("The reviewed knowledge uses an unsupported thinking level.".to_owned()),
    }
}

fn parse_knowledge_type(value: &str) -> Result<KnowledgeType, String> {
    match value {
        "concept" => Ok(KnowledgeType::Concept),
        "procedure" => Ok(KnowledgeType::Procedure),
        "representation" => Ok(KnowledgeType::Representation),
        _ => Err("The reviewed knowledge uses an unsupported teaching type.".to_owned()),
    }
}

fn evaluation_fault(message: impl ToString) -> RuntimeFault {
    RuntimeFault::new(RuntimeFaultKind::Registration, vec![message.to_string()])
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use crate::{
        curriculum_catalog::repository::install_bundled_package_contents,
        generation_program::{
            domain::{
                CompletionFailure, CompletionFailureKind, StructuredCompletion,
                StructuredCompletionPort, StructuredCompletionRequest,
            },
            evaluation::{evaluate, promote},
        },
        lesson_planning::{
            granular::{tests::granular_record, LessonReference},
            program::granular_lesson_program,
        },
    };
    use serde_json::json;
    use tokio_util::sync::CancellationToken;

    struct HttpCompletionPort {
        endpoint: String,
        client: reqwest::Client,
        model_identity: String,
    }

    static QUALIFICATION_TRACE_ORDINAL: AtomicUsize = AtomicUsize::new(1);

    impl StructuredCompletionPort for HttpCompletionPort {
        fn model_identity(&self) -> &str {
            &self.model_identity
        }

        async fn complete(
            &self,
            request: StructuredCompletionRequest,
            cancellation: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            let transport = |message: String| {
                CompletionFailure::new(CompletionFailureKind::Transport, vec![message])
            };
            let body = crate::inference::build_llama_request(&request);
            let response = tokio::select! {
                response = self.client.post(&self.endpoint).json(&body).send() => {
                    response.map_err(|error| transport(error.to_string()))?
                }
                _ = cancellation.cancelled() => {
                    return Err(CompletionFailure::new(
                        CompletionFailureKind::Cancelled,
                        vec!["The qualification run was cancelled.".to_owned()],
                    ));
                }
            };
            let status = response.status();
            let response_body = response
                .text()
                .await
                .map_err(|error| transport(error.to_string()))?;
            if !status.is_success() {
                return Err(transport(format!(
                    "The local engine returned status {}: {}",
                    status.as_u16(),
                    response_body.chars().take(500).collect::<String>()
                )));
            }
            let completion =
                crate::inference::extract_completion(&response_body).map_err(transport)?;
            let output_text = completion.content;
            if let Ok(trace_directory) = std::env::var("GRASPY_QUALIFICATION_TRACE_DIR") {
                std::fs::create_dir_all(&trace_directory)
                    .map_err(|error| transport(error.to_string()))?;
                let ordinal = QUALIFICATION_TRACE_ORDINAL.fetch_add(1, Ordering::Relaxed);
                let signature_name = request.signature_id.replace('.', "-");
                let trace = json!({
                    "request": body,
                    "outputText": &output_text,
                });
                std::fs::write(
                    std::path::Path::new(&trace_directory)
                        .join(format!("{ordinal:02}-{signature_name}.json")),
                    serde_json::to_vec_pretty(&trace)
                        .map_err(|error| transport(error.to_string()))?,
                )
                .map_err(|error| transport(error.to_string()))?;
            }
            Ok(StructuredCompletion {
                output_text,
                model_identity: self.model_identity.clone(),
                input_tokens: completion.input_tokens,
                output_tokens: completion.output_tokens,
            })
        }
    }

    fn installed_dependencies() -> (Database, ContentCorpus) {
        let database = Database::in_memory();
        install_bundled_package_contents(
            &database,
            include_str!(
                "../../resources/content/nerdc-jss1-mathematics-september-2025/curriculum.graspy-curriculum"
            ),
        )
        .expect("installed curriculum");
        let corpus = ContentCorpus::default();
        corpus
            .init_at(
                &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("resources/content/siyavula-jss1-mathematics-v1/corpus.sqlite3"),
            )
            .expect("opened corpus");
        (database, corpus)
    }

    /// A suite that scores well on one class says nothing about another. This
    /// holds the cases against what graspy actually installs, so the day a
    /// second subject or class ships without cases, this is what says so.
    #[test]
    fn the_cases_cover_every_class_and_subject_graspy_ships() {
        let (database, corpus) = installed_dependencies();
        let suite = ordering_fractions_suite(&database, &corpus).expect("evaluation suite");

        let shipped = database
            .with_connection(|connection| {
                let mut statement = connection.prepare(
                    "SELECT subjects.name, grade_levels.display_name
                     FROM curriculum_courses
                     JOIN subjects ON subjects.id = curriculum_courses.subject_id
                     JOIN grade_levels ON grade_levels.id = curriculum_courses.grade_level_id
                     WHERE curriculum_courses.status = 'active'",
                )?;
                let rows = statement
                    .query_map([], |row| {
                        Ok(CaseCoverage {
                            subject: row.get::<_, String>(0)?,
                            class_level: row.get::<_, String>(1)?,
                        })
                    })?
                    .collect::<rusqlite::Result<BTreeSet<_>>>()?;
                Ok::<_, rusqlite::Error>(rows)
            })
            .expect("installed courses");

        assert!(!shipped.is_empty(), "no curriculum installed to check against");
        assert_eq!(
            suite.covers(),
            shipped,
            "the evaluation cases and what graspy ships have drifted apart",
        );
    }

    #[test]
    fn resolves_the_packaged_case_through_installed_curriculum_and_corpus() {
        let (database, corpus) = installed_dependencies();
        let suite = ordering_fractions_suite(&database, &corpus).expect("evaluation suite");
        let input: GranularLessonProgramInput =
            serde_json::from_value(suite.cases[0].input.clone()).expect("program input");

        assert_eq!(input.curriculum_snapshot.atomic_objectives.len(), 2);
        assert_eq!(input.curriculum_snapshot.knowledge_components.len(), 1);
        assert_eq!(
            input.curriculum_snapshot.knowledge_components[0].knowledge_type,
            KnowledgeType::Procedure
        );
        assert_eq!(
            input
                .source_evidence_snapshot
                .records
                .iter()
                .map(|record| record.record_id.as_str())
                .collect::<Vec<_>>(),
            ["ch04-b032", "ch04-b033-i01", "ch04-b033-i02"]
        );
        assert!(input
            .source_evidence_snapshot
            .records
            .iter()
            .all(|record| !record.excerpt.is_empty()));
    }

    #[test]
    fn scores_the_reviewed_boundary_against_a_granular_lesson_plan() {
        let (database, corpus) = installed_dependencies();
        let suite = ordering_fractions_suite(&database, &corpus).expect("evaluation suite");
        let input: GranularLessonProgramInput =
            serde_json::from_value(suite.cases[0].input.clone()).expect("program input");
        let mut plan = granular_record().plan;
        plan.curriculum_objectives = input.curriculum_snapshot.objectives.clone();
        plan.atomic_objectives = input.curriculum_snapshot.atomic_objectives.clone();
        plan.knowledge_components = input.curriculum_snapshot.knowledge_components.clone();
        plan.references = input
            .source_evidence_snapshot
            .records
            .iter()
            .map(|record| LessonReference {
                record_id: record.record_id.clone(),
                title: record.title.clone(),
                attribution: record.attribution.clone(),
            })
            .collect();
        // The questions come with the answers: an ordering answer under a
        // comparison question is not a lesson, and the checkers say so.
        plan.assessments[0].question = "Arrange 8/9, 11/12 and 5/6 in ascending order.".to_owned();
        plan.assessments[0].expected_answer = "5/6 < 8/9 < 11/12".to_owned();
        plan.assessments[1].question = "Arrange 5/8, 8/14 and 18/28 in descending order.".to_owned();
        plan.assessments[1].expected_answer = "18/28 > 5/8 > 8/14".to_owned();

        let found = score_ordering_fractions(
            &suite.cases[0].expected,
            &BTreeMap::from([(
                "lessonPlan".to_owned(),
                serde_json::to_value(plan).expect("lesson plan"),
            )]),
        );

        for gated in [
            "objectiveAlignment",
            "sourceBoundary",
            "mathematicalCorrectness",
            "lessonCompleteness",
        ] {
            assert_eq!(found[gated].score, 1.0, "{gated}");
        }
        // A score with nothing behind it is the thing this suite exists not to
        // report, so every criterion says what it read even when it is met.
        for (criterion, finding) in &found {
            assert!(
                !finding.evidence.is_empty(),
                "{criterion} scored without saying why"
            );
        }
        // Reported, not gated. Three of this lesson's seven answers are ordering
        // questions with a stated direction; the rest are comparisons, or an
        // ordering that never says which way, and nothing graspy has reads them.
        // Reported, not gated. Every answer in this lesson is either an
        // ordering or a two-fraction comparison, and all seven are read.
        assert_eq!(found["answersChecked"].score, 1.0);
        assert_eq!(found["answersChecked"].evidence, vec!["checked 7 of 7 answers"]);
    }

    /// The identity in every published audit was written by hand before it was
    /// derived. If the derivation ever stopped reproducing it, past audits and
    /// present runs would silently describe different artefacts.
    #[test]
    fn the_derived_identity_matches_the_one_the_shipped_qualification_was_recorded_under() {
        assert_eq!(
            qualification_identity(crate::model_catalogue::default_model().manifest),
            concat!(
                "ggml-org/gemma-4-E2B-it-Q4_0.gguf@858dcdf955fb1b5a43ed2301aea00362fc443a5c;",
                "sha256=8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52;",
                "llama.cpp=9960-a935fbffe"
            ),
        );
    }

    /// A model named for qualification but absent from the catalogue means the
    /// run would score something graspy cannot ship. It stops rather than
    /// quietly falling back to the default and reporting a pass for it.
    #[test]
    #[should_panic(expected = "not in the catalogue")]
    fn refuses_to_qualify_a_model_that_is_not_in_the_catalogue() {
        // SAFETY: single-threaded test process; the variable is removed below.
        unsafe { std::env::set_var("GRASPY_QUALIFICATION_MODEL", "no-such-model") };
        let outcome = std::panic::catch_unwind(model_under_qualification);
        unsafe { std::env::remove_var("GRASPY_QUALIFICATION_MODEL") };
        if let Err(payload) = outcome {
            std::panic::resume_unwind(payload);
        }
    }

    #[tokio::test]
    #[ignore = "requires a qualified local llama-server; set GRASPY_LLAMA_BASE_URL"]
    async fn qualifies_the_installed_model_against_the_exact_packaged_case() {
        let base_url = std::env::var("GRASPY_LLAMA_BASE_URL")
            .expect("GRASPY_LLAMA_BASE_URL must identify a running local server");
        let (database, corpus) = installed_dependencies();
        let suite = ordering_fractions_suite(&database, &corpus).expect("evaluation suite");
        let program = granular_lesson_program().expect("granular lesson program");
        let model = model_under_qualification();
        let model_identity = qualification_identity(model.manifest);
        eprintln!("qualifying {} as {model_identity}", model.display_name);
        let port = HttpCompletionPort {
            endpoint: format!("{}/v1/chat/completions", base_url.trim_end_matches('/')),
            client: reqwest::Client::new(),
            model_identity: model_identity.clone(),
        };
        let result = evaluate(
            &database,
            &suite,
            &program,
            &model_identity,
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("completed evaluation");
        let program_run_id = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT program_run_id FROM generation_evaluation_cases
                     WHERE evaluation_run_id = ?1",
                    [&result.evaluation_run_id],
                    |row| row.get::<_, String>(0),
                )
            })
            .expect("evaluated program run");
        let lesson_plan = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT output_json FROM generation_node_runs
                     WHERE run_id = ?1 AND node_id = 'validate-complete-plan'",
                    [&program_run_id],
                    |row| row.get::<_, Option<String>>(0),
                )
            })
            .expect("qualified lesson-plan output")
            .map(|encoded| {
                serde_json::from_str::<Value>(&encoded).expect("qualified lesson plan JSON")
            });
        let case_diagnostics: Value = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT diagnostics_json FROM generation_evaluation_cases
                     WHERE evaluation_run_id = ?1",
                    [&result.evaluation_run_id],
                    |row| row.get::<_, String>(0),
                )
            })
            .and_then(|encoded| serde_json::from_str(&encoded).map_err(|error| error.to_string()))
            .expect("evaluation diagnostics");
        let node_statuses = database
            .with_connection(|connection| {
                let mut statement = connection.prepare(
                    "SELECT node_id, status, diagnostics_json
                     FROM generation_node_runs WHERE run_id = ?1 ORDER BY rowid",
                )?;
                let rows = statement
                    .query_map([&program_run_id], |row| {
                        Ok(json!({
                            "nodeId": row.get::<_, String>(0)?,
                            "status": row.get::<_, String>(1)?,
                            "diagnostics": serde_json::from_str::<Value>(&row.get::<_, String>(2)?)
                                .unwrap_or_else(|_| json!(["Unreadable diagnostics"])),
                        }))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok::<_, rusqlite::Error>(rows)
            })
            .expect("generation node statuses");
        let evaluation_identity = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT dataset_sha256, model_identity
                     FROM generation_evaluation_runs WHERE id = ?1",
                    [&result.evaluation_run_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
            })
            .expect("evaluation identity");
        let audit = json!({
            "suiteId": suite.id,
            "suiteVersion": suite.version,
            "evaluationRunId": result.evaluation_run_id,
            "programRunId": program_run_id,
            "programId": program.definition().id,
            "programVersion": program.definition().version,
            "programDigest": program.digest(),
            "datasetSha256": evaluation_identity.0,
            "modelIdentity": evaluation_identity.1,
            "scores": result.aggregate_scores,
            "passed": result.passed,
            "caseDiagnostics": case_diagnostics,
            "nodeStatuses": node_statuses,
            "lessonPlan": lesson_plan,
        });
        if let Ok(path) = std::env::var("GRASPY_QUALIFICATION_OUTPUT") {
            std::fs::write(
                path,
                serde_json::to_vec_pretty(&audit).expect("qualification audit"),
            )
            .expect("qualification output");
        }
        assert!(result.passed, "qualification failed: {audit}");
        promote(&database, &suite, &program, &result.evaluation_run_id).expect("promoted program");
    }
}
