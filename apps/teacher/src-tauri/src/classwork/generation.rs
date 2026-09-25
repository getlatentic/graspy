//! Drives a classworks run to its end inside the backend.
//!
//! The section loop used to live in the webview, which meant closing the
//! screen abandoned the run mid-section. Here the backend claims each section,
//! asks the model, judges the result, repairs or scrubs it, and records the
//! ending — registered as a background task the whole app can see and stop.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio_util::sync::CancellationToken;

use crate::content_corpus::ContentCorpus;
use crate::db::Database;
use crate::generation_program::domain::{RuntimeFaultKind, StructuredCompletionPort};
use crate::generation_program::executor::execute_new;
use crate::inference::{
    product_completion_program, product_signature, InferenceRuntime,
    LlamaServerStructuredCompletionPort,
};
use crate::model_catalogue;
use crate::task_registry::{self, NewTask, TaskOutcome};

use super::domain::{
    BeginClassworkSectionRegenerationRequest, BeginClassworkSectionRequest,
    CancelClassworkRunRequest, CancelClassworkSectionRegenerationRequest, ClassworkQualityReport,
    ClassworkSectionJob, ClassworkWorkspaceRequest, ClassworkWorkspaceSnapshot,
    CompleteClassworkSectionRegenerationRequest, CompleteClassworkSectionRequest,
    FailClassworkSectionRegenerationRequest, FailClassworkSectionRequest,
    GeneratedClassworkSectionInput, RunClassworkGenerationRequest, StartClassworkRunRequest,
};
use super::repository;
use super::validation::{
    failing_quality_details, invalid_structure_pass, only_unsupported_source_claims_failed,
    parse_candidate, quality_report, scrub_unsupported_source_claims, validate_candidate,
    ClassworkCandidate,
};

const QUALITY_FAILURE_MESSAGE: &str =
    "graspy was not happy with this part. The rest of your classwork is fine.";

/// The task under which a run's work is registered — derived from the run, so
/// any screen can stop the work knowing only the run it is looking at.
pub(crate) fn task_id_for_run(run_id: &str) -> String {
    format!("lesson-classwork-{run_id}")
}

/// Starts (or resumes, or retries one section of) a classwork run and returns
/// as soon as the work is registered. The run itself continues in the backend.
pub(super) async fn launch_run<R: Runtime>(
    app: &AppHandle<R>,
    request: RunClassworkGenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    let database = app.state::<Database>();
    let corpus = app.state::<ContentCorpus>();
    let snapshot = repository::get_workspace(
        &database,
        &corpus,
        ClassworkWorkspaceRequest {
            context: request.context.clone(),
            lesson_id: request.lesson_id.clone(),
        },
    )?;
    let snapshot = match (&snapshot.run, &request.section_id) {
        (None, Some(_)) => {
            return Err("There is no classwork run to retry a section in.".to_owned())
        }
        (None, None) => repository::start_run(
            &database,
            &corpus,
            StartClassworkRunRequest {
                context: request.context.clone(),
                lesson_id: request.lesson_id.clone(),
            },
        )?,
        (Some(_), _) => snapshot,
    };
    let run = snapshot.run.as_ref().expect("a started run");
    let has_work = request.section_id.is_some()
        || run
            .sections
            .iter()
            .any(|section| section.status == "pending");
    if !has_work {
        return Ok(snapshot);
    }

    let label = match &request.section_id {
        Some(_) => format!("Retrying a section — {}", lesson_name(&snapshot)),
        None => format!("Creating the classwork — {}", lesson_name(&snapshot)),
    };
    let work = Work::Run {
        lesson_id: request.lesson_id.clone(),
        only_section: request.section_id.clone(),
    };
    begin_task(
        app,
        &request.context,
        &request.lesson_id,
        &run.id,
        label,
        work,
    )
    .await?;
    Ok(snapshot)
}

/// Recreates one section under teacher direction, registered like a run.
pub(super) async fn launch_regeneration<R: Runtime>(
    app: &AppHandle<R>,
    request: BeginClassworkSectionRegenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot, String> {
    let database = app.state::<Database>();
    let context = request.context.clone();
    let run_id = request.run_id.clone();
    let start = repository::begin_section_regeneration(&database, request)?;
    let label = format!("Recreating a section — {}", start.workspace.lesson.topic);
    let lesson_id = start.workspace.lesson.lesson_id.clone();
    begin_task(
        app,
        &context,
        &lesson_id,
        &run_id,
        label,
        Work::Regeneration(Box::new(start.job.clone())),
    )
    .await?;
    Ok(start.workspace)
}

enum Work {
    Run {
        lesson_id: String,
        only_section: Option<String>,
    },
    Regeneration(Box<ClassworkSectionJob>),
}

fn lesson_name(snapshot: &ClassworkWorkspaceSnapshot) -> String {
    snapshot
        .lesson
        .subtopic
        .clone()
        .unwrap_or_else(|| snapshot.lesson.topic.clone())
}

/// Registers the task row and the cancellation handle, then hands the work to
/// the backend. The row is written before anything runs, so a crash in between
/// leaves a visible interrupted task rather than silence.
async fn begin_task<R: Runtime>(
    app: &AppHandle<R>,
    context: &crate::lesson_planning::LessonContextRequest,
    lesson_id: &str,
    run_id: &str,
    label: String,
    work: Work,
) -> Result<(), String> {
    let database = app.state::<Database>();
    let runtime = app.state::<InferenceRuntime>();
    let task_id = task_id_for_run(run_id);
    task_registry::begin(
        app,
        &database,
        NewTask {
            id: task_id.clone(),
            kind: "classwork".to_owned(),
            academic_session_id: context.academic_session_id.clone(),
            academic_period_id: context.academic_period_id.clone(),
            teaching_assignment_id: context.teaching_assignment_id.clone(),
            lesson_id: lesson_id.to_owned(),
            label,
        },
    )
    .map_err(|_| "This classwork is already being worked on.".to_owned())?;
    let token = match runtime.requests.register(&task_id).await {
        Ok(token) => token,
        Err(error) => {
            let _ =
                task_registry::finish(app, &database, &task_id, TaskOutcome::Failed, Some(&error));
            return Err(error);
        }
    };
    let model_identity = model_catalogue::selected_model_identity(&database)?;
    let app = app.clone();
    let context = context.clone();
    let run_id = run_id.to_owned();
    tauri::async_runtime::spawn(async move {
        drive(app, context, run_id, work, model_identity, token).await;
    });
    Ok(())
}

enum SectionOutcome {
    Completed(GeneratedClassworkSectionInput),
    Quality(ClassworkQualityReport),
    Transport(String),
    Cancelled,
}

enum Ending {
    Succeeded,
    Failed(String),
    Cancelled,
}

async fn drive<R: Runtime>(
    app: AppHandle<R>,
    context: crate::lesson_planning::LessonContextRequest,
    run_id: String,
    work: Work,
    model_identity: &'static str,
    token: CancellationToken,
) {
    let database = app.state::<Database>();
    let runtime = app.state::<InferenceRuntime>();
    let task_id = task_id_for_run(&run_id);
    let port = LlamaServerStructuredCompletionPort::new(&app, &runtime, model_identity);

    // The engine takes one job at a time and this run holds it for every
    // section, rather than trading sections with another lesson and leaving
    // both of them waiting inside the engine where graspy cannot see it.
    // Refused admission means the work was stopped before it began: cancelling
    // the token here sends it down the same path a stop takes, so the run's own
    // records close properly without a single call to the model.
    let _engine = runtime.admit(&app, &database, &task_id, &token).await;
    if _engine.is_none() {
        token.cancel();
    }

    let ending = match work {
        Work::Regeneration(job) => {
            drive_regeneration(&database, &port, &context, &task_id, &job, &token).await
        }
        Work::Run {
            lesson_id,
            only_section,
        } => {
            let corpus = app.state::<ContentCorpus>();
            drive_sections(
                &database,
                &corpus,
                &port,
                &context,
                &lesson_id,
                &run_id,
                only_section,
                &task_id,
                &token,
            )
            .await
        }
    };

    let (outcome, message) = match &ending {
        Ending::Succeeded => (TaskOutcome::Succeeded, None),
        Ending::Failed(message) => (TaskOutcome::Failed, Some(message.as_str())),
        Ending::Cancelled => (TaskOutcome::Cancelled, None),
    };
    let _ = task_registry::finish(&app, &database, &task_id, outcome, message);
    runtime.requests.finish(&task_id).await;
}

#[allow(clippy::too_many_arguments)]
async fn drive_sections<P: StructuredCompletionPort>(
    database: &Database,
    corpus: &ContentCorpus,
    port: &P,
    context: &crate::lesson_planning::LessonContextRequest,
    lesson_id: &str,
    run_id: &str,
    only_section: Option<String>,
    task_id: &str,
    token: &CancellationToken,
) -> Ending {
    let mut requested_section = only_section;
    loop {
        if token.is_cancelled() {
            return cancel_with_claim(database, context, run_id, requested_section.as_deref());
        }
        if requested_section.is_none() {
            let workspace = match repository::get_workspace(
                database,
                corpus,
                ClassworkWorkspaceRequest {
                    context: context.clone(),
                    lesson_id: lesson_id.to_owned(),
                },
            ) {
                Ok(workspace) => workspace,
                Err(error) => return Ending::Failed(error),
            };
            let Some(run) = workspace.run else {
                return Ending::Failed("This classwork run is no longer available.".to_owned());
            };
            if run
                .sections
                .iter()
                .any(|section| section.status == "failed")
            {
                return Ending::Failed(QUALITY_FAILURE_MESSAGE.to_owned());
            }
            if !run
                .sections
                .iter()
                .any(|section| section.status == "pending")
            {
                return Ending::Succeeded;
            }
        }
        let section_id = requested_section.take();
        let single_section = section_id.is_some();
        let start = match repository::begin_section(
            database,
            BeginClassworkSectionRequest {
                context: context.clone(),
                run_id: run_id.to_owned(),
                section_id,
            },
        ) {
            Ok(start) => start,
            Err(error) => return Ending::Failed(error),
        };
        let job = start.job;
        match generate_section(database, port, &job, task_id, token).await {
            SectionOutcome::Completed(section) => {
                if let Err(error) = repository::complete_section(
                    database,
                    CompleteClassworkSectionRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        section_id: job.section_id.clone(),
                        generation_token: job.generation_token.clone(),
                        section,
                    },
                ) {
                    return Ending::Failed(error);
                }
                if single_section {
                    return Ending::Succeeded;
                }
            }
            SectionOutcome::Quality(quality) => {
                if let Err(error) = repository::fail_section(
                    database,
                    FailClassworkSectionRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        section_id: job.section_id.clone(),
                        generation_token: job.generation_token.clone(),
                        message: QUALITY_FAILURE_MESSAGE.to_owned(),
                        quality: Some(quality),
                    },
                ) {
                    return Ending::Failed(error);
                }
                return Ending::Failed(QUALITY_FAILURE_MESSAGE.to_owned());
            }
            SectionOutcome::Transport(message) => {
                if let Err(error) = repository::fail_section(
                    database,
                    FailClassworkSectionRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        section_id: job.section_id.clone(),
                        generation_token: job.generation_token.clone(),
                        message: message.clone(),
                        quality: None,
                    },
                ) {
                    return Ending::Failed(error);
                }
                return Ending::Failed(message);
            }
            SectionOutcome::Cancelled => {
                let _ = repository::cancel_run(
                    database,
                    CancelClassworkRunRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        section_id: job.section_id.clone(),
                        generation_token: job.generation_token.clone(),
                    },
                );
                return Ending::Cancelled;
            }
        }
    }
}

/// A cancel that arrives between sections still has to leave the run marked
/// cancelled, and releasing a claim is the recorded way to do that — so the
/// next section is claimed for exactly long enough to cancel it.
fn cancel_with_claim(
    database: &Database,
    context: &crate::lesson_planning::LessonContextRequest,
    run_id: &str,
    section_id: Option<&str>,
) -> Ending {
    if let Ok(start) = repository::begin_section(
        database,
        BeginClassworkSectionRequest {
            context: context.clone(),
            run_id: run_id.to_owned(),
            section_id: section_id.map(ToOwned::to_owned),
        },
    ) {
        let _ = repository::cancel_run(
            database,
            CancelClassworkRunRequest {
                context: context.clone(),
                run_id: run_id.to_owned(),
                section_id: start.job.section_id,
                generation_token: start.job.generation_token,
            },
        );
    }
    Ending::Cancelled
}

async fn drive_regeneration<P: StructuredCompletionPort>(
    database: &Database,
    port: &P,
    context: &crate::lesson_planning::LessonContextRequest,
    task_id: &str,
    job: &ClassworkSectionJob,
    token: &CancellationToken,
) -> Ending {
    let regeneration_id = job
        .regeneration
        .as_ref()
        .map(|regeneration| regeneration.id.clone())
        .unwrap_or_default();
    match generate_section(database, port, job, task_id, token).await {
        SectionOutcome::Completed(section) => {
            match repository::complete_section_regeneration(
                database,
                CompleteClassworkSectionRegenerationRequest {
                    context: context.clone(),
                    run_id: job.run_id.clone(),
                    regeneration_id,
                    section_id: job.section_id.clone(),
                    generation_token: job.generation_token.clone(),
                    section,
                },
            ) {
                Ok(_) => Ending::Succeeded,
                Err(error) => Ending::Failed(error),
            }
        }
        SectionOutcome::Quality(_) | SectionOutcome::Transport(_) => {
            let message = QUALITY_FAILURE_MESSAGE.to_owned();
            let _ = repository::fail_section_regeneration(
                database,
                FailClassworkSectionRegenerationRequest {
                    context: context.clone(),
                    run_id: job.run_id.clone(),
                    regeneration_id,
                    section_id: job.section_id.clone(),
                    generation_token: job.generation_token.clone(),
                    message: message.clone(),
                },
            );
            Ending::Failed(message)
        }
        SectionOutcome::Cancelled => {
            let _ = repository::cancel_section_regeneration(
                database,
                CancelClassworkSectionRegenerationRequest {
                    context: context.clone(),
                    run_id: job.run_id.clone(),
                    regeneration_id,
                    section_id: job.section_id.clone(),
                    generation_token: job.generation_token.clone(),
                },
            );
            Ending::Cancelled
        }
    }
}

/// One section, judged the way the application always has: create, validate,
/// repair once if needed, and scrub source wording when that is all that failed.
async fn generate_section<P: StructuredCompletionPort>(
    database: &Database,
    port: &P,
    job: &ClassworkSectionJob,
    task_id: &str,
    token: &CancellationToken,
) -> SectionOutcome {
    let completion = match complete_signature(
        database,
        port,
        "classwork.create",
        create_input(job),
        task_id,
        token,
    )
    .await
    {
        Ok(completion) => completion,
        Err(CompletionError::Cancelled) => return SectionOutcome::Cancelled,
        Err(CompletionError::Failed(message)) => return SectionOutcome::Transport(message),
    };

    let parsed = parse_candidate(&completion);
    let initial = match &parsed {
        Ok(candidate) => validate_candidate(candidate, job, "initial"),
        Err(detail) => invalid_structure_pass("initial", detail.clone()),
    };
    if let Ok(candidate) = &parsed {
        if initial.passed {
            return SectionOutcome::Completed(section_input(
                candidate,
                quality_report("passed", false, 0, vec![initial]),
            ));
        }
    }

    let failed_section = match &parsed {
        Ok(candidate) => {
            serde_json::to_value(CandidateValue::from(candidate)).expect("a candidate serializes")
        }
        Err(_) => Value::String(completion.clone()),
    };
    let mut passes = vec![initial];
    let repaired = match complete_signature(
        database,
        port,
        "classwork.repair",
        repair_input(job, failed_section, failing_quality_details(&passes[0])),
        task_id,
        token,
    )
    .await
    {
        Ok(completion) => {
            let candidate = parse_candidate(&completion);
            let pass = match &candidate {
                Ok(candidate) => validate_candidate(candidate, job, "repair"),
                Err(detail) => invalid_structure_pass("repair", detail.clone()),
            };
            passes.push(pass);
            candidate.ok()
        }
        Err(CompletionError::Cancelled) => return SectionOutcome::Cancelled,
        Err(CompletionError::Failed(_)) => None,
    };

    if let Some(candidate) = &repaired {
        if passes[1].passed {
            return SectionOutcome::Completed(section_input(
                candidate,
                quality_report("repaired", true, 0, passes),
            ));
        }
    }

    let scrub_target = match (&repaired, passes.get(1)) {
        (Some(candidate), Some(pass)) if only_unsupported_source_claims_failed(pass) => {
            Some(candidate)
        }
        _ => match &parsed {
            Ok(candidate) if only_unsupported_source_claims_failed(&passes[0]) => Some(candidate),
            _ => None,
        },
    };
    if let Some(target) = scrub_target {
        let scrubbed = scrub_unsupported_source_claims(target);
        let scrub_pass = validate_candidate(&scrubbed.candidate, job, "scrub");
        let passed = scrubbed.removed_claim_count > 0 && scrub_pass.passed;
        passes.push(scrub_pass);
        if passed {
            return SectionOutcome::Completed(section_input(
                &scrubbed.candidate,
                quality_report("scrubbed", true, scrubbed.removed_claim_count, passes),
            ));
        }
        return SectionOutcome::Quality(quality_report(
            "failed",
            true,
            scrubbed.removed_claim_count,
            passes,
        ));
    }
    SectionOutcome::Quality(quality_report("failed", true, 0, passes))
}

enum CompletionError {
    Cancelled,
    Failed(String),
}

async fn complete_signature<P: StructuredCompletionPort>(
    database: &Database,
    port: &P,
    signature_id: &str,
    input: Value,
    task_id: &str,
    token: &CancellationToken,
) -> Result<String, CompletionError> {
    let signature = product_signature(signature_id).map_err(CompletionError::Failed)?;
    let program = product_completion_program(signature).map_err(CompletionError::Failed)?;
    let result = execute_new(
        database,
        &program,
        &input,
        Some(task_id),
        port,
        token.clone(),
    )
    .await
    .map_err(|fault| {
        if fault.kind == RuntimeFaultKind::Cancelled || token.is_cancelled() {
            CompletionError::Cancelled
        } else {
            CompletionError::Failed(fault.to_string())
        }
    })?;
    let completion = result.outputs.get("completion").ok_or_else(|| {
        CompletionError::Failed(
            "The completed generation run did not contain its registered output.".to_owned(),
        )
    })?;
    serde_json::to_string(completion).map_err(|error| {
        CompletionError::Failed(format!("The completed section could not be read: {error}"))
    })
}

fn create_input(job: &ClassworkSectionJob) -> Value {
    let mut input = json!({
        "lesson": job.lesson,
        "activeStep": job.step,
        "sourceMaterials": job.source_materials,
    });
    add_regeneration_fields(&mut input, job);
    input
}

fn repair_input(job: &ClassworkSectionJob, failed_section: Value, issues: Vec<String>) -> Value {
    let mut input = json!({
        "lesson": job.lesson,
        "activeStep": job.step,
        "sourceMaterials": job.source_materials,
        "failedSection": failed_section,
        "qualityIssues": issues,
    });
    add_regeneration_fields(&mut input, job);
    input
}

fn add_regeneration_fields(input: &mut Value, job: &ClassworkSectionJob) {
    if let (Some(fields), Some(regeneration)) = (input.as_object_mut(), &job.regeneration) {
        fields.insert(
            "currentSectionToReplace".to_owned(),
            serde_json::to_value(&regeneration.previous_section).expect("a section serializes"),
        );
        fields.insert(
            "teacherDirection".to_owned(),
            serde_json::to_value(&regeneration.teacher_direction).expect("a direction serializes"),
        );
    }
}

/// A candidate as the repair prompt is shown it — the shape the model returned.
#[derive(serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct CandidateValue<'a> {
    title: &'a str,
    learning_goal_numbers: &'a [i64],
    blocks: Vec<BlockValue<'a>>,
}

#[derive(serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
struct BlockValue<'a> {
    kind: &'a str,
    text: &'a str,
    learning_goal_numbers: &'a [i64],
    source_material_keys: &'a [String],
}

impl<'a> From<&'a ClassworkCandidate> for CandidateValue<'a> {
    fn from(candidate: &'a ClassworkCandidate) -> Self {
        Self {
            title: &candidate.title,
            learning_goal_numbers: &candidate.learning_goal_numbers,
            blocks: candidate
                .blocks
                .iter()
                .map(|block| BlockValue {
                    kind: &block.kind,
                    text: &block.text,
                    learning_goal_numbers: &block.learning_goal_numbers,
                    source_material_keys: &block.source_material_keys,
                })
                .collect(),
        }
    }
}

fn section_input(
    candidate: &ClassworkCandidate,
    quality: ClassworkQualityReport,
) -> GeneratedClassworkSectionInput {
    GeneratedClassworkSectionInput {
        title: candidate.title.clone(),
        learning_goal_numbers: candidate.learning_goal_numbers.clone(),
        blocks: candidate.blocks.clone(),
        quality,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classwork::repository::test_fixtures::setup;
    use crate::generation_program::domain::{
        CompletionFailure, StructuredCompletion, StructuredCompletionRequest,
    };

    /// The screens stop a run by the task id the run carries, so this string is
    /// a contract and not an implementation detail. It is pinned here because a
    /// cancel that names a task nobody registered stops nothing and says so to
    /// no one.
    #[test]
    fn a_run_names_its_task_the_same_way_every_screen_reads_it() {
        assert_eq!(task_id_for_run("run-7"), "lesson-classwork-run-7");
    }
    use crate::lesson_planning::LessonContextRequest;

    /// Answers every completion with the same section, the way a scripted
    /// engine would — goal numbers and source keys chosen by the test.
    struct ScriptedPort {
        goal: i64,
        source_key: &'static str,
    }

    impl StructuredCompletionPort for ScriptedPort {
        fn model_identity(&self) -> &str {
            crate::model_catalogue::default_model().manifest.id
        }

        async fn complete(
            &self,
            request: StructuredCompletionRequest,
            _cancellation: CancellationToken,
        ) -> Result<StructuredCompletion, CompletionFailure> {
            let block = |kind: &str| {
                json!({
                    "kind": kind,
                    "text": format!("{kind} content for the class."),
                    "learningGoalNumbers": [self.goal],
                    "sourceMaterialKeys": [self.source_key],
                })
            };
            let section = json!({
                "title": "Comparing the models",
                "learningGoalNumbers": [self.goal],
                "blocks": [block("review"), block("worked_example"), block("practice"), block("solution")],
            });
            let _ = &request;
            Ok(StructuredCompletion {
                output_text: section.to_string(),
                model_identity: crate::model_catalogue::default_model()
                    .manifest
                    .id
                    .to_owned(),
                input_tokens: 10,
                output_tokens: 20,
            })
        }
    }

    fn started_run(
        database: &Database,
        corpus: &ContentCorpus,
        context: &LessonContextRequest,
    ) -> String {
        let snapshot = repository::start_run(
            database,
            corpus,
            StartClassworkRunRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("a started run");
        snapshot.run.expect("a run").id
    }

    fn workspace(
        database: &Database,
        corpus: &ContentCorpus,
        context: &LessonContextRequest,
    ) -> ClassworkWorkspaceSnapshot {
        repository::get_workspace(
            database,
            corpus,
            ClassworkWorkspaceRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("a workspace")
    }

    #[tokio::test]
    async fn drives_every_section_to_done_and_succeeds() {
        let (database, corpus, context) = setup();
        let run_id = started_run(&database, &corpus, &context);
        let port = ScriptedPort {
            goal: 1,
            source_key: "ch04-b016",
        };

        let ending = drive_sections(
            &database,
            &corpus,
            &port,
            &context,
            "lesson",
            &run_id,
            None,
            "task-run",
            &CancellationToken::new(),
        )
        .await;

        if let Ending::Failed(message) = &ending {
            panic!("run failed: {message}");
        }
        assert!(matches!(ending, Ending::Succeeded));
        let run = workspace(&database, &corpus, &context).run.expect("run");
        assert!(run.sections.iter().all(|section| section.status == "done"));
        assert!(run.document_version.is_some());
    }

    #[tokio::test]
    async fn a_section_that_fails_its_checks_ends_the_run_as_failed() {
        let (database, corpus, context) = setup();
        let run_id = started_run(&database, &corpus, &context);
        // Goal 9 is outside the confirmed lesson, so create and repair both fail.
        let port = ScriptedPort {
            goal: 9,
            source_key: "ch04-b016",
        };

        let ending = drive_sections(
            &database,
            &corpus,
            &port,
            &context,
            "lesson",
            &run_id,
            None,
            "task-run",
            &CancellationToken::new(),
        )
        .await;

        assert!(matches!(ending, Ending::Failed(_)));
        let run = workspace(&database, &corpus, &context).run.expect("run");
        let failed = run
            .sections
            .iter()
            .find(|section| section.status == "failed")
            .expect("a failed section");
        assert!(failed.last_error.is_some());
    }

    #[tokio::test]
    async fn a_cancel_between_sections_marks_the_run_cancelled() {
        let (database, corpus, context) = setup();
        let run_id = started_run(&database, &corpus, &context);
        let token = CancellationToken::new();
        token.cancel();
        let port = ScriptedPort {
            goal: 1,
            source_key: "ch04-b016",
        };

        let ending = drive_sections(
            &database, &corpus, &port, &context, "lesson", &run_id, None, "task-run", &token,
        )
        .await;

        assert!(matches!(ending, Ending::Cancelled));
        let run = workspace(&database, &corpus, &context).run.expect("run");
        assert_eq!(run.status, "cancelled");
    }
}
