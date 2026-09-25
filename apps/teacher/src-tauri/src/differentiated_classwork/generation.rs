//! Drives a teaching-group classwork run to its end inside the backend.
//!
//! Each section is adapted block by block: the model answers per base block,
//! the answers are judged as one section, failing blocks are repaired once,
//! and unsupported wording is scrubbed when it is the only failure — all
//! registered as one background task the whole app can see and stop.

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio_util::sync::CancellationToken;

use crate::classwork::domain::{
    ClassworkQualityReport, GeneratedClassworkBlockInput, GeneratedClassworkSectionInput,
};
use crate::db::Database;
use crate::generation_program::domain::{RuntimeFaultKind, StructuredCompletionPort};
use crate::generation_program::executor::execute_new;
use crate::inference::{
    product_completion_program, product_signature, InferenceRuntime,
    LlamaServerStructuredCompletionPort,
};
use crate::lesson_planning::LessonContextRequest;
use crate::model_catalogue;
use crate::task_registry::{self, NewTask, TaskOutcome};

use super::domain::{
    BeginDifferentiatedSectionRequest, CancelDifferentiatedRunRequest,
    CompleteDifferentiatedSectionRequest, DifferentiatedClassworkSectionJob,
    DifferentiatedClassworkWorkspaceSnapshot, DifferentiatedWorkspaceRequest,
    FailDifferentiatedSectionRequest, RunDifferentiatedGenerationRequest,
    StartDifferentiatedRunRequest,
};
use super::repository;
use super::validation::{
    failing_quality_details, invalid_structure_pass, only_unsupported_claims_failed, parse_block,
    quality_report, scrub_unsupported_claims, validate_candidate, DifferentiatedCandidate,
};

const QUALITY_FAILURE_MESSAGE: &str =
    "graspy was not happy with this part. The rest of your classwork is fine.";

pub(crate) fn task_id_for_run(run_id: &str) -> String {
    format!("group-classwork-{run_id}")
}

/// Starts (or resumes, or retries a section of) a group-classwork run and
/// returns once the work is registered; the run continues in the backend.
pub(super) async fn launch_run<R: Runtime>(
    app: &AppHandle<R>,
    request: RunDifferentiatedGenerationRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot, String> {
    let database = app.state::<Database>();
    let snapshot = repository::get_workspace(
        &database,
        DifferentiatedWorkspaceRequest {
            context: request.context.clone(),
            lesson_id: request.lesson_id.clone(),
        },
    )?;
    let snapshot = match (&snapshot.run, &request.section_id) {
        (None, Some(_)) => {
            return Err("There is no group classwork run to retry a section in.".to_owned())
        }
        (None, None) => repository::start_run(
            &database,
            StartDifferentiatedRunRequest {
                context: request.context.clone(),
                lesson_id: request.lesson_id.clone(),
            },
        )?,
        (Some(_), _) => snapshot,
    };
    let run = snapshot.run.as_ref().expect("a started run");
    let has_work = request.section_id.is_some()
        || run.groups.iter().any(|group| {
            group
                .sections
                .iter()
                .any(|section| section.status == "pending")
        });
    if !has_work {
        return Ok(snapshot);
    }

    let database = app.state::<Database>();
    let runtime = app.state::<InferenceRuntime>();
    let task_id = task_id_for_run(&run.id);
    task_registry::begin(
        app,
        &database,
        NewTask {
            id: task_id.clone(),
            kind: "differentiated_classwork".to_owned(),
            academic_session_id: request.context.academic_session_id.clone(),
            academic_period_id: request.context.academic_period_id.clone(),
            teaching_assignment_id: request.context.teaching_assignment_id.clone(),
            lesson_id: request.lesson_id.clone(),
            label: format!("Creating the group classwork — {}", snapshot.lesson.topic),
        },
    )
    .map_err(|_| "This group classwork is already being worked on.".to_owned())?;
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
    let context = request.context.clone();
    let lesson_id = request.lesson_id.clone();
    let run_id = run.id.clone();
    let only_section = request.section_id.clone();
    tauri::async_runtime::spawn(async move {
        drive(
            app,
            context,
            lesson_id,
            run_id,
            only_section,
            model_identity,
            token,
        )
        .await;
    });
    Ok(snapshot)
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
    context: LessonContextRequest,
    lesson_id: String,
    run_id: String,
    only_section: Option<String>,
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

    let ending = drive_sections(
        &database,
        &port,
        &context,
        &lesson_id,
        &run_id,
        only_section,
        &task_id,
        &token,
    )
    .await;

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
    port: &P,
    context: &LessonContextRequest,
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
                DifferentiatedWorkspaceRequest {
                    context: context.clone(),
                    lesson_id: lesson_id.to_owned(),
                },
            ) {
                Ok(workspace) => workspace,
                Err(error) => return Ending::Failed(error),
            };
            let Some(run) = workspace.run else {
                return Ending::Failed(
                    "This group classwork run is no longer available.".to_owned(),
                );
            };
            let sections = || run.groups.iter().flat_map(|group| group.sections.iter());
            if sections().any(|section| section.status == "failed") {
                return Ending::Failed(QUALITY_FAILURE_MESSAGE.to_owned());
            }
            if !sections().any(|section| section.status == "pending") {
                return Ending::Succeeded;
            }
        }
        let start = match repository::begin_section(
            database,
            BeginDifferentiatedSectionRequest {
                context: context.clone(),
                run_id: run_id.to_owned(),
                section_id: requested_section.take(),
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
                    CompleteDifferentiatedSectionRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        group_id: job.group_id.clone(),
                        section_id: job.section_id.clone(),
                        generation_token: job.generation_token.clone(),
                        section,
                    },
                ) {
                    return Ending::Failed(error);
                }
                // A retried section that comes good rejoins the run: the rest
                // of the pending sections carry on, as the screen always did.
            }
            SectionOutcome::Quality(quality) => {
                if let Err(error) = repository::fail_section(
                    database,
                    FailDifferentiatedSectionRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        group_id: job.group_id.clone(),
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
                    FailDifferentiatedSectionRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        group_id: job.group_id.clone(),
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
                    CancelDifferentiatedRunRequest {
                        context: context.clone(),
                        run_id: run_id.to_owned(),
                        group_id: job.group_id.clone(),
                        section_id: job.section_id.clone(),
                        generation_token: job.generation_token.clone(),
                    },
                );
                return Ending::Cancelled;
            }
        }
    }
}

/// A cancel between sections still has to leave the run marked cancelled;
/// claiming the next section for exactly long enough to cancel it is the
/// recorded way to do that.
fn cancel_with_claim(
    database: &Database,
    context: &LessonContextRequest,
    run_id: &str,
    section_id: Option<&str>,
) -> Ending {
    if let Ok(start) = repository::begin_section(
        database,
        BeginDifferentiatedSectionRequest {
            context: context.clone(),
            run_id: run_id.to_owned(),
            section_id: section_id.map(ToOwned::to_owned),
        },
    ) {
        let _ = repository::cancel_run(
            database,
            CancelDifferentiatedRunRequest {
                context: context.clone(),
                run_id: run_id.to_owned(),
                group_id: start.job.group_id,
                section_id: start.job.section_id,
                generation_token: start.job.generation_token,
            },
        );
    }
    Ending::Cancelled
}

struct ParsedBlock {
    base_index: usize,
    block: Option<GeneratedClassworkBlockInput>,
    raw: String,
    error: String,
}

/// One section, adapted the way the application always has: every base block
/// answered, judged together, repaired item by item, scrubbed if that is all.
async fn generate_section<P: StructuredCompletionPort>(
    database: &Database,
    port: &P,
    job: &DifferentiatedClassworkSectionJob,
    task_id: &str,
    token: &CancellationToken,
) -> SectionOutcome {
    let mut initial_items = Vec::new();
    for index in 0..job.base_section.blocks.len() {
        match complete_signature(
            database,
            port,
            "differentiated-classwork.create",
            item_input(job, index),
            task_id,
            token,
        )
        .await
        {
            Ok(completion) => initial_items.push(parsed_block(index, completion, job)),
            Err(CompletionError::Cancelled) => return SectionOutcome::Cancelled,
            Err(CompletionError::Failed(message)) => return SectionOutcome::Transport(message),
        }
    }

    let initial_candidate = candidate_from(job, &initial_items);
    let initial = match &initial_candidate {
        Some(candidate) => validate_candidate(candidate, job, "initial"),
        None => invalid_structure_pass("initial", item_errors(&initial_items)),
    };
    if let Some(candidate) = &initial_candidate {
        if initial.passed {
            return SectionOutcome::Completed(section_input(
                candidate,
                quality_report("passed", false, 0, vec![initial]),
            ));
        }
    }

    let mut repaired_items = Vec::new();
    for item in initial_items.iter() {
        let issues = item_findings(item, job);
        if issues.is_empty() && item.block.is_some() {
            repaired_items.push(ParsedBlock {
                base_index: item.base_index,
                block: item.block.clone(),
                raw: item.raw.clone(),
                error: item.error.clone(),
            });
            continue;
        }
        let failed_block = match &item.block {
            Some(block) => serde_json::to_value(block).expect("a block serializes"),
            None => Value::String(item.raw.clone()),
        };
        let mut input = item_input(job, item.base_index);
        if let Some(fields) = input.as_object_mut() {
            fields.insert("failedBlock".to_owned(), failed_block);
            fields.insert(
                "validationIssues".to_owned(),
                serde_json::to_value(&issues).expect("issues serialize"),
            );
        }
        match complete_signature(
            database,
            port,
            "differentiated-classwork.repair",
            input,
            task_id,
            token,
        )
        .await
        {
            Ok(completion) => repaired_items.push(parsed_block(item.base_index, completion, job)),
            Err(CompletionError::Cancelled) => return SectionOutcome::Cancelled,
            Err(CompletionError::Failed(_)) => repaired_items.push(ParsedBlock {
                base_index: item.base_index,
                block: None,
                raw: item.raw.clone(),
                error: "The repair request did not complete.".to_owned(),
            }),
        }
    }

    let repaired_candidate = candidate_from(job, &repaired_items);
    let repaired_pass = match &repaired_candidate {
        Some(candidate) => validate_candidate(candidate, job, "repair"),
        None => invalid_structure_pass("repair", item_errors(&repaired_items)),
    };
    let passes = vec![initial, repaired_pass];
    if let Some(candidate) = &repaired_candidate {
        if passes[1].passed {
            return SectionOutcome::Completed(section_input(
                candidate,
                quality_report("repaired", true, 0, passes),
            ));
        }
    }

    let scrub_target = if repaired_candidate.is_some() && only_unsupported_claims_failed(&passes[1])
    {
        repaired_candidate.as_ref()
    } else if initial_candidate.is_some() && only_unsupported_claims_failed(&passes[0]) {
        initial_candidate.as_ref()
    } else {
        None
    };
    if let Some(target) = scrub_target {
        let scrubbed = scrub_unsupported_claims(target);
        let scrub_pass = validate_candidate(&scrubbed.candidate, job, "scrub");
        let passed = scrubbed.removed_claim_count > 0 && scrub_pass.passed;
        let mut passes = passes;
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

fn parsed_block(
    base_index: usize,
    completion: String,
    job: &DifferentiatedClassworkSectionJob,
) -> ParsedBlock {
    let base_kind = job.base_section.blocks[base_index].kind.as_str();
    match parse_block(&completion, base_kind) {
        Ok(block) => ParsedBlock {
            base_index,
            block: Some(block),
            raw: completion,
            error: String::new(),
        },
        Err(error) => ParsedBlock {
            base_index,
            block: None,
            raw: completion,
            error,
        },
    }
}

fn candidate_from(
    job: &DifferentiatedClassworkSectionJob,
    items: &[ParsedBlock],
) -> Option<DifferentiatedCandidate> {
    if items.iter().any(|item| item.block.is_none()) {
        return None;
    }
    Some(DifferentiatedCandidate {
        title: job.base_section.title.clone(),
        learning_goal_numbers: job.base_section.learning_goal_numbers.clone(),
        blocks: items
            .iter()
            .map(|item| item.block.clone().expect("a parsed block"))
            .collect(),
    })
}

fn item_errors(items: &[ParsedBlock]) -> String {
    let errors: Vec<&str> = items
        .iter()
        .filter(|item| item.block.is_none())
        .map(|item| item.error.as_str())
        .collect();
    if errors.is_empty() {
        "A required material block could not be read.".to_owned()
    } else {
        errors.join(" ")
    }
}

/// What one answered block would fail on its own: the item judged inside a
/// section whose other blocks are the originals, nudged so the adapted-at-all
/// check cannot blame them.
fn item_findings(item: &ParsedBlock, job: &DifferentiatedClassworkSectionJob) -> Vec<String> {
    let Some(block) = &item.block else {
        return vec![format!("content_structure: {}", item.error)];
    };
    let base_block = &job.base_section.blocks[item.base_index];
    let candidate = DifferentiatedCandidate {
        title: job.base_section.title.clone(),
        learning_goal_numbers: job.base_section.learning_goal_numbers.clone(),
        blocks: job
            .base_section
            .blocks
            .iter()
            .enumerate()
            .map(|(index, base)| {
                if index == item.base_index {
                    block.clone()
                } else {
                    GeneratedClassworkBlockInput {
                        kind: base.kind.clone(),
                        text: format!("{}\nAdjusted for validation.", base.text),
                        learning_goal_numbers: base.learning_goal_numbers.clone(),
                        source_material_keys: base.source_material_keys.clone(),
                    }
                }
            })
            .collect(),
    };
    let mut findings = failing_quality_details(&validate_candidate(&candidate, job, "initial"));
    if block.text.trim() == base_block.text.trim() {
        findings.push(format!(
            "differentiation_presence: Adapt the {} block to the supplied group results.",
            base_block.kind
        ));
    }
    findings
}

fn item_input(job: &DifferentiatedClassworkSectionJob, base_index: usize) -> Value {
    let base_block = &job.base_section.blocks[base_index];
    let sources: Vec<_> = job
        .source_materials
        .iter()
        .filter(|source| base_block.source_material_keys.contains(&source.key))
        .collect();
    json!({
        "lesson": job.lesson,
        "group": job.group,
        "baseSection": {
            "id": job.base_section.id,
            "sequence": job.base_section.sequence,
            "stepTitle": job.base_section.step_title,
            "title": job.base_section.title,
            "learningGoalNumbers": job.base_section.learning_goal_numbers,
        },
        "baseBlock": base_block,
        "sourceMaterials": sources,
    })
}

fn section_input(
    candidate: &DifferentiatedCandidate,
    quality: ClassworkQualityReport,
) -> GeneratedClassworkSectionInput {
    GeneratedClassworkSectionInput {
        title: candidate.title.clone(),
        learning_goal_numbers: candidate.learning_goal_numbers.clone(),
        blocks: candidate.blocks.clone(),
        quality,
    }
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
        CompletionError::Failed(format!("The adapted block could not be read: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pinned for the same reason as the lesson run's: a screen stops the work
    /// by the task id the run carries, and a cancel that misses stops nothing
    /// quietly.
    #[test]
    fn a_group_run_names_its_task_the_same_way_every_screen_reads_it() {
        assert_eq!(task_id_for_run("run-7"), "group-classwork-run-7");
    }
}
