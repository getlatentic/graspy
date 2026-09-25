use std::{
    collections::{BTreeMap, BTreeSet},
    time::SystemTime,
};

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::db::Database;

mod review;

pub use review::{after_review, review, Correction, ReviewedRun};

use super::{
    domain::{
        bounded_diagnostics, digest_json, RuntimeFault, RuntimeFaultKind, StructuredCompletionPort,
        ValidatedProgram,
    },
    executor::execute_checkpoint,
    repository::create_run,
};

pub type EvaluationScorer =
    fn(&Value, &BTreeMap<String, Value>) -> BTreeMap<String, CriterionFinding>;

/// What one criterion found, and what it read to find it.
///
/// A number on its own cannot be checked. Someone reading a zero has no way to
/// tell an answer that was wrong from a scorer that was, and both happen; the
/// lines are what they read to tell them apart.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CriterionFinding {
    pub score: f64,
    pub evidence: Vec<String>,
}

impl CriterionFinding {
    /// A criterion that either holds or does not, saying which either way.
    pub fn holds(it_holds: bool, evidence: Vec<String>) -> Self {
        Self {
            score: f64::from(it_holds),
            evidence: bounded_diagnostics(evidence),
        }
    }
}

/// A case's criteria after the suite's own thresholds have been applied to
/// them: the numbers that count, what each was read off, and anything the
/// scorer itself got wrong.
struct ScoredCase {
    scores: BTreeMap<String, f64>,
    evidence: BTreeMap<String, Vec<String>>,
    diagnostics: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvaluationCase {
    pub key: String,
    /// The class and subject this case stands for. A suite that scores well on
    /// one class says nothing about another, and without this that is invisible
    /// until a teacher finds it.
    pub covers: CaseCoverage,
    pub input: Value,
    pub expected: Value,
}

/// One class and subject a case speaks for.
#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, schemars::JsonSchema,
)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseCoverage {
    pub subject: String,
    pub class_level: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetricThreshold {
    pub metric: String,
    pub minimum: f64,
}

#[derive(Clone)]
pub struct EvaluationSuite {
    pub id: String,
    pub version: String,
    pub cases: Vec<EvaluationCase>,
    pub thresholds: Vec<MetricThreshold>,
    pub score: EvaluationScorer,
}

impl EvaluationSuite {
    /// Every class and subject the suite's cases speak for, which is what a
    /// shipped class and subject can be held against.
    pub fn covers(&self) -> BTreeSet<CaseCoverage> {
        self.cases.iter().map(|case| case.covers.clone()).collect()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvaluationDatasetPackage {
    pub id: String,
    pub version: String,
    pub cases: Vec<EvaluationCase>,
    pub thresholds: Vec<MetricThreshold>,
    pub review: Value,
}

impl EvaluationDatasetPackage {
    pub fn parse(contents: &str) -> Result<Self, RuntimeFault> {
        serde_json::from_str(contents).map_err(|error| {
            registration_fault(format!("The evaluation dataset is invalid: {error}"))
        })
    }

    pub fn bind(self, scorer: EvaluationScorer) -> Result<EvaluationSuite, RuntimeFault> {
        let suite = EvaluationSuite {
            id: self.id,
            version: self.version,
            cases: self.cases,
            thresholds: self.thresholds,
            score: scorer,
        };
        validate_suite(&suite)?;
        Ok(suite)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EvaluationResult {
    pub evaluation_run_id: String,
    pub aggregate_scores: BTreeMap<String, f64>,
    pub passed: bool,
}

pub async fn evaluate<P: StructuredCompletionPort>(
    database: &Database,
    suite: &EvaluationSuite,
    program: &ValidatedProgram,
    model_identity: &str,
    completion_port: &P,
    cancellation: CancellationToken,
) -> Result<EvaluationResult, RuntimeFault> {
    validate_suite(suite)?;
    let evaluation_run_id = Uuid::new_v4().to_string();
    let dataset_sha256 = dataset_digest(suite);
    database
        .with_connection(|connection| {
            connection.execute(
                "INSERT INTO generation_evaluation_runs (
                    id, suite_id, suite_version, dataset_sha256, program_id,
                    program_version, program_digest, model_identity, status, started_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'running', ?9)",
                params![
                    evaluation_run_id,
                    suite.id,
                    suite.version,
                    dataset_sha256,
                    program.definition().id,
                    program.definition().version,
                    program.digest(),
                    model_identity,
                    now_ms(),
                ],
            )
        })
        .map_err(persistence_fault)?;

    let mut score_totals = suite
        .thresholds
        .iter()
        .map(|threshold| (threshold.metric.clone(), 0.0))
        .collect::<BTreeMap<_, _>>();
    let mut every_case_passed = true;
    for case in &suite.cases {
        if cancellation.is_cancelled() {
            mark_evaluation_failed(
                database,
                &evaluation_run_id,
                vec!["Evaluation was cancelled.".to_owned()],
            )?;
            return Err(RuntimeFault::new(
                RuntimeFaultKind::Cancelled,
                vec!["Evaluation was cancelled.".to_owned()],
            ));
        }
        let checkpoint = create_run(database, program, &case.input, model_identity, None)?;
        let program_run_id = checkpoint.run_id.clone();
        let execution = execute_checkpoint(
            database,
            program,
            checkpoint,
            model_identity,
            completion_port,
            cancellation.clone(),
        )
        .await;

        if let Err(fault) = &execution {
            if fault.kind == RuntimeFaultKind::Cancelled {
                mark_evaluation_failed(database, &evaluation_run_id, fault.diagnostics.clone())?;
                return Err(fault.clone());
            }
        }

        let (scored, output_sha256, case_passed) = match execution {
            Ok(result) => {
                let scored = scored_against(suite, (suite.score)(&case.expected, &result.outputs));
                let passed = scored.diagnostics.is_empty()
                    && suite.thresholds.iter().all(|threshold| {
                        scored.scores.get(&threshold.metric).copied().unwrap_or(0.0)
                            >= threshold.minimum
                    });
                (scored, Some(digest_json(&json!(result.outputs))), passed)
            }
            Err(fault) => (
                ScoredCase {
                    scores: suite
                        .thresholds
                        .iter()
                        .map(|threshold| (threshold.metric.clone(), 0.0))
                        .collect(),
                    evidence: BTreeMap::new(),
                    diagnostics: fault.diagnostics,
                },
                None,
                false,
            ),
        };
        for (metric, score) in &scored.scores {
            if let Some(total) = score_totals.get_mut(metric) {
                *total += score;
            }
        }
        every_case_passed &= case_passed;
        persist_case(
            database,
            &evaluation_run_id,
            case,
            &program_run_id,
            output_sha256.as_deref(),
            &scored,
            case_passed,
        )?;
    }

    let case_count = suite.cases.len() as f64;
    let aggregate_scores = score_totals
        .into_iter()
        .map(|(metric, total)| (metric, total / case_count))
        .collect::<BTreeMap<_, _>>();
    let aggregate_passed = suite.thresholds.iter().all(|threshold| {
        aggregate_scores
            .get(&threshold.metric)
            .copied()
            .unwrap_or(0.0)
            >= threshold.minimum
    });
    let passed = every_case_passed && aggregate_passed;
    database
        .with_connection(|connection| {
            connection.execute(
                "UPDATE generation_evaluation_runs
                 SET status = 'completed', aggregate_scores_json = ?1, completed_at_ms = ?2
                 WHERE id = ?3 AND status = 'running'",
                params![serialize(&aggregate_scores)?, now_ms(), evaluation_run_id],
            )
        })
        .map_err(persistence_fault)?;
    Ok(EvaluationResult {
        evaluation_run_id,
        aggregate_scores,
        passed,
    })
}

pub fn promote(
    database: &Database,
    suite: &EvaluationSuite,
    program: &ValidatedProgram,
    evaluation_run_id: &str,
) -> Result<String, RuntimeFault> {
    validate_suite(suite)?;
    let stored = database
        .with_connection(|connection| {
            connection
                .query_row(
                    "SELECT suite_id, suite_version, dataset_sha256, program_id,
                            program_version, program_digest, status
                     FROM generation_evaluation_runs WHERE id = ?1",
                    [evaluation_run_id],
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
        })
        .map_err(persistence_fault)?
        .ok_or_else(|| registration_fault("The evaluation run does not exist."))?;
    if stored.0 != suite.id
        || stored.1 != suite.version
        || stored.2 != dataset_digest(suite)
        || stored.3 != program.definition().id
        || stored.4 != program.definition().version
        || stored.5 != program.digest()
        || stored.6 != "completed"
    {
        return Err(registration_fault(
            "The evaluation run does not match this program and passing suite.",
        ));
    }
    // Read after review rather than off the run, so a score a person corrected
    // is the score promotion is decided on.
    let reviewed = after_review(database, suite, evaluation_run_id)?;
    if reviewed.cases_below_threshold != 0 {
        return Err(registration_fault(
            "The evaluation run does not match this program and passing suite.",
        ));
    }
    if suite.thresholds.iter().any(|threshold| {
        reviewed
            .aggregate
            .get(&threshold.metric)
            .copied()
            .unwrap_or(0.0)
            < threshold.minimum
    }) {
        return Err(registration_fault(
            "The evaluation does not meet every promotion threshold.",
        ));
    }

    let promotion_id = Uuid::new_v4().to_string();
    database
        .with_connection(|connection| {
            connection.execute(
                "INSERT INTO generation_program_promotions (
                    id, program_id, program_version, program_digest,
                    evaluation_run_id, thresholds_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    promotion_id,
                    program.definition().id,
                    program.definition().version,
                    program.digest(),
                    evaluation_run_id,
                    serialize(&suite.thresholds)?,
                ],
            )
        })
        .map_err(persistence_fault)?;
    Ok(promotion_id)
}

fn validate_suite(suite: &EvaluationSuite) -> Result<(), RuntimeFault> {
    if suite.id.trim().is_empty() || suite.version.trim().is_empty() || suite.cases.is_empty() {
        return Err(registration_fault(
            "An evaluation suite requires an identifier, version, and at least one case.",
        ));
    }
    let case_keys = suite
        .cases
        .iter()
        .map(|case| case.key.as_str())
        .collect::<BTreeSet<_>>();
    if case_keys.len() != suite.cases.len() || case_keys.contains("") {
        return Err(registration_fault(
            "Evaluation case keys must be non-empty and unique.",
        ));
    }
    let metrics = suite
        .thresholds
        .iter()
        .map(|threshold| threshold.metric.as_str())
        .collect::<BTreeSet<_>>();
    if suite.thresholds.is_empty()
        || metrics.len() != suite.thresholds.len()
        || metrics.contains("")
        || suite.thresholds.iter().any(|threshold| {
            !threshold.minimum.is_finite() || !(0.0..=1.0).contains(&threshold.minimum)
        })
    {
        return Err(registration_fault(
            "Evaluation thresholds must use unique metrics and finite values from zero to one.",
        ));
    }
    Ok(())
}

fn scored_against(suite: &EvaluationSuite, found: BTreeMap<String, CriterionFinding>) -> ScoredCase {
    let mut scores = BTreeMap::new();
    let mut evidence = BTreeMap::new();
    let mut diagnostics = Vec::new();
    // Everything the scorer reported is kept, whether or not it gates a
    // promotion. A criterion worth measuring before it is worth gating on has
    // nowhere else to be read, and dropping it here is how it stays unmeasured.
    for (metric, finding) in &found {
        scores.insert(metric.clone(), finding.score);
        evidence.insert(metric.clone(), finding.evidence.clone());
    }
    for threshold in &suite.thresholds {
        let finding = found.get(&threshold.metric);
        let usable = finding
            .filter(|finding| finding.score.is_finite() && (0.0..=1.0).contains(&finding.score));
        scores.insert(
            threshold.metric.clone(),
            usable.map_or(0.0, |finding| finding.score),
        );
        evidence.insert(
            threshold.metric.clone(),
            finding.map(|finding| finding.evidence.clone()).unwrap_or_default(),
        );
        if usable.is_none() {
            diagnostics.push(match finding {
                Some(_) => format!(
                    "Scorer {} returned a value outside zero to one.",
                    threshold.metric
                ),
                None => format!(
                    "Scorer {} did not return a required metric.",
                    threshold.metric
                ),
            });
        }
    }
    ScoredCase {
        scores,
        evidence,
        diagnostics: bounded_diagnostics(diagnostics),
    }
}

fn persist_case(
    database: &Database,
    evaluation_run_id: &str,
    case: &EvaluationCase,
    program_run_id: &str,
    output_sha256: Option<&str>,
    scored: &ScoredCase,
    passed: bool,
) -> Result<(), RuntimeFault> {
    database
        .with_connection(|connection| {
            connection.execute(
                "INSERT INTO generation_evaluation_cases (
                    id, evaluation_run_id, case_key, program_run_id, input_sha256,
                    output_sha256, scores_json, evidence_json, passed, diagnostics_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    Uuid::new_v4().to_string(),
                    evaluation_run_id,
                    case.key,
                    program_run_id,
                    digest_json(&case.input),
                    output_sha256,
                    serialize(&scored.scores)?,
                    serialize(&scored.evidence)?,
                    i64::from(passed),
                    serialize(&bounded_diagnostics(scored.diagnostics.clone()))?,
                ],
            )
        })
        .map_err(persistence_fault)?;
    Ok(())
}

fn mark_evaluation_failed(
    database: &Database,
    evaluation_run_id: &str,
    diagnostics: Vec<String>,
) -> Result<(), RuntimeFault> {
    database
        .with_connection(|connection| {
            connection.execute(
                "UPDATE generation_evaluation_runs SET status = 'failed',
                    diagnostics_json = ?1, completed_at_ms = ?2
                 WHERE id = ?3 AND status = 'running'",
                params![
                    serialize(&bounded_diagnostics(diagnostics))?,
                    now_ms(),
                    evaluation_run_id
                ],
            )
        })
        .map_err(persistence_fault)?;
    Ok(())
}

fn dataset_digest(suite: &EvaluationSuite) -> String {
    digest_json(&json!({
        "suiteId": suite.id,
        "suiteVersion": suite.version,
        "cases": suite.cases,
        "thresholds": suite.thresholds,
    }))
}

fn serialize(value: &impl Serialize) -> rusqlite::Result<String> {
    serde_json::to_string(value)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn persistence_fault(error: impl std::fmt::Display) -> RuntimeFault {
    RuntimeFault::new(RuntimeFaultKind::Persistence, vec![error.to_string()])
}

fn registration_fault(message: impl Into<String>) -> RuntimeFault {
    RuntimeFault::new(RuntimeFaultKind::Registration, vec![message.into()])
}

fn now_ms() -> i64 {
    SystemTime::UNIX_EPOCH
        .elapsed()
        .expect("system time is after Unix epoch")
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, sync::Mutex};

    use serde_json::json;

    use crate::generation_program::domain::{
        CompletionFailure, CompletionFailureKind, CompletionLimits, DataContract,
        GenerationProgram, GenerationSignature, ProgramNode, ProgramNodeKind, StructuredCompletion,
        StructuredCompletionRequest, ValidationReport,
    };

    use super::*;

    struct NoCompletionPort;

    impl StructuredCompletionPort for NoCompletionPort {
        fn model_identity(&self) -> &str {
            "model-a"
        }

        async fn complete(
            &self,
            _: StructuredCompletionRequest,
            _: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            panic!("deterministic evaluation must not request a completion")
        }
    }

    struct SingleCompletionPort {
        output: Mutex<Option<Value>>,
    }

    struct CancelledCompletionPort;

    impl StructuredCompletionPort for CancelledCompletionPort {
        fn model_identity(&self) -> &str {
            "model-a"
        }

        async fn complete(
            &self,
            _: StructuredCompletionRequest,
            _: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            Err(CompletionFailure::new(
                CompletionFailureKind::Cancelled,
                vec!["Evaluation was cancelled during completion.".to_owned()],
            ))
        }
    }

    impl SingleCompletionPort {
        fn new(output: Value) -> Self {
            Self {
                output: Mutex::new(Some(output)),
            }
        }
    }

    impl StructuredCompletionPort for SingleCompletionPort {
        fn model_identity(&self) -> &str {
            "model-a"
        }

        async fn complete(
            &self,
            _: StructuredCompletionRequest,
            _: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            Ok(StructuredCompletion {
                output_text: serde_json::to_string(
                    &self
                        .output
                        .lock()
                        .expect("output")
                        .take()
                        .expect("one output"),
                )
                .expect("JSON output"),
                model_identity: "model-a".to_owned(),
                input_tokens: 64,
                output_tokens: 48,
            })
        }
    }

    fn root_input(root: &Value, _: &BTreeMap<String, Value>) -> Result<Value, RuntimeFault> {
        Ok(root.clone())
    }

    fn create_classwork(input: &Value) -> Result<Value, RuntimeFault> {
        Ok(json!({"title": input["topic"].clone()}))
    }

    fn program() -> ValidatedProgram {
        GenerationProgram {
            id: "evaluated-lesson-classwork".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: DataContract::new("lesson-context", "1"),
            nodes: vec![ProgramNode {
                id: "create-classwork".to_owned(),
                module_id: "create-classwork".to_owned(),
                module_version: "1.0.0".to_owned(),
                output_key: "material".to_owned(),
                output_contract: DataContract::new("classwork", "1"),
                dependencies: vec![],
                build_input: root_input,
                kind: ProgramNodeKind::Deterministic {
                    execute: create_classwork,
                },
            }],
        }
        .validate()
        .expect("program")
    }

    fn exact_title_score(
        expected: &Value,
        outputs: &BTreeMap<String, Value>,
    ) -> BTreeMap<String, CriterionFinding> {
        let title = &outputs["material"]["title"];
        BTreeMap::from([(
            "exactTitle".to_owned(),
            CriterionFinding::holds(
                expected["title"] == *title,
                vec![format!("wanted {}, got {title}", expected["title"])],
            ),
        )])
    }

    fn decode_reviewed_lesson(_: &Value) -> ValidationReport {
        ValidationReport::pass("reviewed-lesson-structure")
    }

    fn validate_reviewed_lesson(_: &Value, _: &Value) -> ValidationReport {
        ValidationReport::pass("reviewed-lesson-policy")
    }

    fn golden_program() -> ValidatedProgram {
        let output_contract = DataContract::new("reviewed-lesson-output", "1");
        GenerationProgram {
            id: "ordering-fractions-lesson".to_owned(),
            version: "1.0.0".to_owned(),
            input_contract: DataContract::new("reviewed-lesson-input", "1"),
            nodes: vec![ProgramNode {
                id: "write-reviewed-lesson".to_owned(),
                module_id: "write-reviewed-lesson".to_owned(),
                module_version: "1.0.0".to_owned(),
                output_key: "lesson".to_owned(),
                output_contract: output_contract.clone(),
                dependencies: vec![],
                build_input: root_input,
                kind: ProgramNodeKind::ModelAuthored {
                    signature: Box::new(GenerationSignature {
                        id: "write-reviewed-lesson".to_owned(),
                        version: "1.0.0".to_owned(),
                        input_contract: DataContract::new("reviewed-lesson-input", "1"),
                        output_contract,
                        system_instructions: "Write the reviewed lesson from supplied goals and source material."
                            .to_owned(),
                        task_instructions: "Return every required lesson part and answer."
                            .to_owned(),
                        output_schema: json!({
                            "type": "object",
                            "properties": {
                                "learningGoalCodes": {"type": "array", "items": {"type": "string"}},
                                "sourceRecordIds": {"type": "array", "items": {"type": "string"}},
                                "lessonParts": {"type": "array", "items": {"type": "string"}},
                                "assessmentAnswers": {
                                    "type": "object",
                                    "properties": {
                                        "ascending": {"type": "string"},
                                        "descending": {"type": "string"}
                                    },
                                    "required": ["ascending", "descending"],
                                    "additionalProperties": false
                                }
                            },
                            "required": ["learningGoalCodes", "sourceRecordIds", "lessonParts", "assessmentAnswers"],
                            "additionalProperties": false
                        }),
                        validation_policy: "reviewed-ordering-fractions".to_owned(),
                        limits: CompletionLimits {
                            temperature: 0.0,
                            seed: 19,
                            max_output_tokens: 1_200,
                            timeout_seconds: 30,
                        },
                    }),
                    repair_signature: None,
                    repair_budget: 0,
                    decode: decode_reviewed_lesson,
                    validate: validate_reviewed_lesson,
                    build_output_schema: None,
                build_output_budget: None,
                },
            }],
        }
        .validate()
        .expect("golden program")
    }

    fn reviewed_lesson_score(
        expected: &Value,
        outputs: &BTreeMap<String, Value>,
    ) -> BTreeMap<String, CriterionFinding> {
        let lesson = &outputs["lesson"];
        let includes_all = |actual: &Value, required: &Value| {
            let actual = actual.as_array().expect("actual list");
            required
                .as_array()
                .expect("required list")
                .iter()
                .all(|item| actual.contains(item))
        };
        let excludes_all = expected["excludedSourceRecordIds"]
            .as_array()
            .expect("excluded sources")
            .iter()
            .all(|item| {
                !lesson["sourceRecordIds"]
                    .as_array()
                    .expect("source ids")
                    .contains(item)
            });
        let noted = |holds: bool, what: &str| {
            CriterionFinding::holds(holds, vec![format!("{what}: {holds}")])
        };
        BTreeMap::from([
            (
                "objectiveAlignment".to_owned(),
                noted(
                    includes_all(
                        &lesson["learningGoalCodes"],
                        &expected["requiredLearningGoalCodes"],
                    ),
                    "goals worked through",
                ),
            ),
            (
                "sourceBoundary".to_owned(),
                noted(
                    includes_all(
                        &lesson["sourceRecordIds"],
                        &expected["requiredSourceRecordIds"],
                    ) && excludes_all,
                    "sources stayed inside what was given",
                ),
            ),
            (
                "mathematicalCorrectness".to_owned(),
                noted(
                    lesson["assessmentAnswers"]["ascending"]
                        == expected["reviewedAnswers"]["ascending"]
                        && lesson["assessmentAnswers"]["descending"]
                            == expected["reviewedAnswers"]["descending"],
                    "answers matched the reviewed ones",
                ),
            ),
            (
                "lessonCompleteness".to_owned(),
                noted(
                    includes_all(&lesson["lessonParts"], &expected["requiredLessonParts"]),
                    "every asked-for part present",
                ),
            ),
        ])
    }

    fn jss1_mathematics() -> CaseCoverage {
        CaseCoverage {
            subject: "Mathematics".to_owned(),
            class_level: "JSS 1".to_owned(),
        }
    }

    fn suite(expected_second_title: &str) -> EvaluationSuite {
        EvaluationSuite {
            id: "reviewed-lesson-cases".to_owned(),
            version: "1.0.0".to_owned(),
            cases: vec![
                EvaluationCase {
                    key: "fractions".to_owned(),
                    covers: jss1_mathematics(),
                    input: json!({"topic": "Fractions"}),
                    expected: json!({"title": "Fractions"}),
                },
                EvaluationCase {
                    key: "geometry".to_owned(),
                    covers: jss1_mathematics(),
                    input: json!({"topic": "Geometry"}),
                    expected: json!({"title": expected_second_title}),
                },
            ],
            thresholds: vec![MetricThreshold {
                metric: "exactTitle".to_owned(),
                minimum: 1.0,
            }],
            score: exact_title_score,
        }
    }

    #[test]
    fn packaged_ordering_fractions_case_preserves_the_approved_review_boundary() {
        let package = EvaluationDatasetPackage::parse(include_str!(
            "../../../resources/content/generation-evaluation/ordering-fractions-v1.json"
        ))
        .expect("packaged dataset");

        assert_eq!(package.id, "nigeria-jss1-mathematics-ordering-fractions");
        assert_eq!(package.version, "1.0.0");
        assert_eq!(package.cases.len(), 1);
        assert_eq!(
            package.cases[0].input["sourceMaterial"]
                .as_array()
                .expect("source material")
                .iter()
                .map(|item| item["recordId"].as_str().expect("record id"))
                .collect::<Vec<_>>(),
            ["ch04-b032", "ch04-b033-i01", "ch04-b033-i02"]
        );
        assert_eq!(
            package.review["excludedSourceRecordIds"][0],
            "ch04-b033-i03"
        );
        package.bind(exact_title_score).expect("bound suite");
    }

    #[tokio::test]
    async fn replays_the_reviewed_ordering_fractions_case_through_the_native_executor() {
        let database = Database::in_memory();
        let suite = EvaluationDatasetPackage::parse(include_str!(
            "../../../resources/content/generation-evaluation/ordering-fractions-v1.json"
        ))
        .expect("packaged dataset")
        .bind(reviewed_lesson_score)
        .expect("bound suite");
        let port = SingleCompletionPort::new(json!({
            "learningGoalCodes": [
                "ordering-of-fractions-ao-arrange-ascending",
                "ordering-of-fractions-ao-arrange-descending"
            ],
            "sourceRecordIds": ["ch04-b032", "ch04-b033-i01", "ch04-b033-i02"],
            "lessonParts": ["explanation", "workedExample", "practice", "assessmentAnswer"],
            "assessmentAnswers": {
                "ascending": "5/6, 8/9, 11/12",
                "descending": "18/28, 5/8, 8/14"
            }
        }));

        let result = evaluate(
            &database,
            &suite,
            &golden_program(),
            "model-a",
            &port,
            CancellationToken::new(),
        )
        .await
        .expect("golden replay");

        assert!(result.passed);
        assert!(result.aggregate_scores.values().all(|score| *score == 1.0));
    }

    #[tokio::test]
    async fn cancellation_during_a_case_fails_the_evaluation_without_scoring_it() {
        let database = Database::in_memory();
        let suite = EvaluationDatasetPackage::parse(include_str!(
            "../../../resources/content/generation-evaluation/ordering-fractions-v1.json"
        ))
        .expect("packaged dataset")
        .bind(reviewed_lesson_score)
        .expect("bound suite");

        let fault = evaluate(
            &database,
            &suite,
            &golden_program(),
            "model-a",
            &CancelledCompletionPort,
            CancellationToken::new(),
        )
        .await
        .expect_err("cancelled evaluation");

        assert_eq!(fault.kind, RuntimeFaultKind::Cancelled);
        let (failed_runs, scored_cases) = database
            .with_connection(|connection| -> rusqlite::Result<(i64, i64)> {
                Ok((
                    connection.query_row(
                        "SELECT COUNT(*) FROM generation_evaluation_runs WHERE status = 'failed'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM generation_evaluation_cases",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("evaluation state");
        assert_eq!(failed_runs, 1);
        assert_eq!(scored_cases, 0);
    }

    #[tokio::test]
    async fn replays_versioned_cases_and_blocks_promotion_below_threshold() {
        let database = Database::in_memory();
        let suite = suite("Shapes");
        let program = program();

        let result = evaluate(
            &database,
            &suite,
            &program,
            "model-a",
            &NoCompletionPort,
            CancellationToken::new(),
        )
        .await
        .expect("evaluation");

        assert!(!result.passed);
        assert_eq!(result.aggregate_scores["exactTitle"], 0.5);
        let promotion = promote(&database, &suite, &program, &result.evaluation_run_id)
            .expect_err("threshold rejection");
        assert_eq!(promotion.kind, RuntimeFaultKind::Registration);
        let case_count = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM generation_evaluation_cases
                     WHERE evaluation_run_id = ?1",
                    [&result.evaluation_run_id],
                    |row| row.get::<_, i64>(0),
                )
            })
            .expect("case count");
        assert_eq!(case_count, 2);
    }

    /// A number nobody can check is not evidence of quality. What the scorer
    /// read has to survive to the record, or the person standing behind the
    /// product is taking the machine's word for it.
    #[tokio::test]
    async fn a_scored_case_keeps_what_each_criterion_was_scored_on() {
        let database = Database::in_memory();
        let suite = suite("Shapes");

        let result = evaluate(
            &database,
            &suite,
            &program(),
            "model-a",
            &NoCompletionPort,
            CancellationToken::new(),
        )
        .await
        .expect("evaluation");

        let evidence: BTreeMap<String, Vec<String>> = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT evidence_json FROM generation_evaluation_cases
                     WHERE evaluation_run_id = ?1 AND case_key = 'geometry'",
                    [&result.evaluation_run_id],
                    |row| row.get::<_, String>(0),
                )
            })
            .map(|stored| serde_json::from_str(&stored).expect("stored evidence"))
            .expect("the case that failed");

        assert_eq!(
            evidence["exactTitle"],
            vec![r#"wanted "Shapes", got "Geometry""#.to_owned()],
        );
    }

    /// A quality number should be a claim someone checked. The scorer marks
    /// this run down, a reviewer looks at what it was scored on and disagrees,
    /// and the run is promotable — because the person's number is the one that
    /// counts, not because the scorer was re-run.
    #[tokio::test]
    async fn a_reviewers_correction_is_the_score_that_counts() {
        let database = Database::in_memory();
        let suite = suite("Shapes");
        let program = program();

        let result = evaluate(
            &database,
            &suite,
            &program,
            "model-a",
            &NoCompletionPort,
            CancellationToken::new(),
        )
        .await
        .expect("evaluation");
        assert!(!result.passed);
        promote(&database, &suite, &program, &result.evaluation_run_id)
            .expect_err("not promotable on the scorer's reading");

        review(
            &database,
            &result.evaluation_run_id,
            &Correction {
                case_key: "geometry".to_owned(),
                metric: "exactTitle".to_owned(),
                score: 1.0,
                reviewer: "Tosin".to_owned(),
                because: "The title reads Geometry, which is what this case is about.".to_owned(),
            },
        )
        .expect("recorded review");

        let reviewed = after_review(&database, &suite, &result.evaluation_run_id).expect("reading");
        assert_eq!(reviewed.aggregate["exactTitle"], 1.0);
        assert_eq!(reviewed.cases_below_threshold, 0);
        assert_eq!(reviewed.corrections, 1);
        promote(&database, &suite, &program, &result.evaluation_run_id)
            .expect("promotable once a reviewer has corrected it");
    }

    /// A correction of a correction is another row, and the latest one stands —
    /// so a reviewer who changes their mind is not arguing with the record.
    #[tokio::test]
    async fn the_latest_correction_stands_and_the_earlier_one_is_kept() {
        let database = Database::in_memory();
        let suite = suite("Shapes");

        let result = evaluate(
            &database,
            &suite,
            &program(),
            "model-a",
            &NoCompletionPort,
            CancellationToken::new(),
        )
        .await
        .expect("evaluation");
        // Three readings that cannot be confused: 0.5 uncorrected, 1.0 on the
        // first correction, 0.75 once the second one stands.
        for score in [1.0, 0.5] {
            review(
                &database,
                &result.evaluation_run_id,
                &Correction {
                    case_key: "geometry".to_owned(),
                    metric: "exactTitle".to_owned(),
                    score,
                    reviewer: "Tosin".to_owned(),
                    because: "Looked again.".to_owned(),
                },
            )
            .expect("recorded review");
        }

        assert_eq!(
            after_review(&database, &suite, &result.evaluation_run_id)
                .expect("reading")
                .aggregate["exactTitle"],
            0.75,
        );
        let kept = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM generation_evaluation_reviews",
                    [],
                    |row| row.get::<_, i64>(0),
                )
            })
            .expect("review count");
        assert_eq!(kept, 2);
    }

    #[tokio::test]
    async fn promotes_only_a_completed_passing_evaluation_and_keeps_the_record_immutable() {
        let database = Database::in_memory();
        let suite = suite("Geometry");
        let program = program();
        let result = evaluate(
            &database,
            &suite,
            &program,
            "model-a",
            &NoCompletionPort,
            CancellationToken::new(),
        )
        .await
        .expect("evaluation");
        assert!(result.passed);

        let promotion_id =
            promote(&database, &suite, &program, &result.evaluation_run_id).expect("promotion");
        let mutation = database.with_connection(|connection| {
            connection.execute(
                "UPDATE generation_program_promotions SET program_digest = ?1 WHERE id = ?2",
                params!["0".repeat(64), promotion_id],
            )
        });
        assert!(mutation
            .expect_err("immutable promotion")
            .contains("generation promotions are immutable"));
        let evaluation_mutation = database.with_connection(|connection| {
            connection.execute(
                "UPDATE generation_evaluation_runs SET diagnostics_json = '[\"changed\"]'
                 WHERE id = ?1",
                [&result.evaluation_run_id],
            )
        });
        assert!(evaluation_mutation
            .expect_err("immutable evaluation")
            .contains("finished generation evaluations are immutable"));
        let case_mutation = database.with_connection(|connection| {
            connection.execute(
                "UPDATE generation_evaluation_cases SET passed = 0
                 WHERE evaluation_run_id = ?1",
                [&result.evaluation_run_id],
            )
        });
        assert!(case_mutation
            .expect_err("immutable evaluation case")
            .contains("generation evaluation cases are immutable"));
    }
}
