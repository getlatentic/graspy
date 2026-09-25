//! The Tauri commands the frontend invokes: thin wrappers that register a
//! request, route it through the runtime, signatures, and port, then release it.

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::{
    content_corpus::ContentCorpus,
    db::Database,
    generation_program::domain::{
        CompletionLimits, RuntimeFault, RuntimeFaultKind, StructuredCompletionPort,
        StructuredCompletionRequest,
    },
    generation_program::executor::execute_new,
    lesson_planning::domain::LessonContextRequest,
    lesson_planning::granular::{GranularLessonPlan, GranularLessonRecord, LessonProgramSnapshot},
    lesson_planning::program::{granular_lesson_program, GranularLessonProgramInput},
    lesson_planning::teacher_authored::{
        curriculum_snapshot_from_goals, retrieval_phrases, teaching_ground_input,
        teaching_ground_schema, TEACHING_GROUND_INSTRUCTIONS,
    },
    model_catalogue,
};

use super::port::LlamaServerStructuredCompletionPort;
use super::runtime::InferenceRuntime;
use super::signatures::{complete_product_request, ProductCompletionRequest};

#[tauri::command]
pub async fn create_lesson_preparation_completion<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
    request: ProductCompletionRequest,
) -> Result<String, String> {
    let cancellation = runtime.requests.register(&request_id).await?;
    let result = match runtime.wait_for_engine(&cancellation).await {
        Some(_engine) => {
            complete_product_request(&app, &database, &runtime, request, cancellation).await
        }
        None => Err(STOPPED_WHILE_WAITING.to_owned()),
    };
    runtime.requests.finish(&request_id).await;
    result
}

/// What a caller is told when its work was stopped before the engine ever saw
/// it. Nothing was generated, so there is nothing to keep or undo.
const STOPPED_WHILE_WAITING: &str = "This work was stopped before it started.";

/// The context a note or pack completion runs under, so the work appears in
/// the app-wide task registry and can be stopped from anywhere.
#[derive(Debug, Clone, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegisteredCompletionTask {
    pub context: LessonContextRequest,
    pub lesson_id: String,
    pub label: String,
}

async fn complete_registered<R: Runtime>(
    app: &AppHandle<R>,
    database: &Database,
    runtime: &InferenceRuntime,
    request_id: &str,
    kind: &str,
    task: RegisteredCompletionTask,
    request: ProductCompletionRequest,
) -> Result<String, String> {
    crate::task_registry::begin(
        app,
        database,
        crate::task_registry::NewTask {
            id: request_id.to_owned(),
            kind: kind.to_owned(),
            academic_session_id: task.context.academic_session_id,
            academic_period_id: task.context.academic_period_id,
            teaching_assignment_id: task.context.teaching_assignment_id,
            lesson_id: task.lesson_id,
            label: task.label,
        },
    )?;
    let cancellation = match runtime.requests.register(request_id).await {
        Ok(token) => token,
        Err(error) => {
            let _ = crate::task_registry::finish(
                app,
                database,
                request_id,
                crate::task_registry::TaskOutcome::Failed,
                Some(&error),
            );
            return Err(error);
        }
    };
    let stopped = cancellation.clone();
    let result = match runtime
        .admit(app, database, request_id, &cancellation)
        .await
    {
        Some(_engine) => {
            complete_product_request(app, database, runtime, request, cancellation).await
        }
        None => Err(STOPPED_WHILE_WAITING.to_owned()),
    };
    runtime.requests.finish(request_id).await;
    match &result {
        Ok(_) => {
            let _ = crate::task_registry::finish(
                app,
                database,
                request_id,
                crate::task_registry::TaskOutcome::Succeeded,
                None,
            );
        }
        Err(message) => {
            let outcome = if stopped.is_cancelled() {
                crate::task_registry::TaskOutcome::Cancelled
            } else {
                crate::task_registry::TaskOutcome::Failed
            };
            let _ = crate::task_registry::finish(app, database, request_id, outcome, Some(message));
        }
    }
    result
}

#[tauri::command]
pub async fn create_lesson_note_completion<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
    task: RegisteredCompletionTask,
    request: ProductCompletionRequest,
) -> Result<String, String> {
    complete_registered(
        &app,
        &database,
        &runtime,
        &request_id,
        "lesson_note",
        task,
        request,
    )
    .await
}

#[tauri::command]
pub async fn cancel_lesson_note_completion(
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
) -> Result<(), String> {
    runtime.requests.cancel(&request_id).await;
    Ok(())
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GranularLessonCompletionRequest {
    context: LessonContextRequest,
    lesson_id: String,
    input: GranularLessonProgramInput,
}

/// Works out what a teacher-authored lesson is taught against, so that a lesson
/// with no curriculum package behind it can still be prepared.
///
/// The teacher's own words find the sources; the model classifies the goals and
/// sets out the knowledge those sources support; the result is kept with the
/// lesson so preparing it afterwards needs none of this again.
#[tauri::command]
pub async fn work_through_teacher_lesson_goals<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    corpus: State<'_, ContentCorpus>,
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
    request: TeacherLessonGoalsRequest,
) -> Result<(), String> {
    let cancellation = runtime.requests.register(&request_id).await?;
    let result = async {
        let lesson =
            crate::lesson_planning::load_teacher_lesson_goals(&database, &request.context, &request.lesson_id)?;
        let goals: Vec<String> =
            serde_json::from_str(&lesson.learning_goals).map_err(|_| {
                "This lesson's learning goals could not be read.".to_owned()
            })?;
        if goals.is_empty() {
            return Err("Write at least one learning goal for this lesson.".to_owned());
        }

        let phrases = retrieval_phrases(&lesson.topic, lesson.subtopic.as_deref(), &goals);
        let records = corpus.find_source_material(&phrases, TEACHER_SOURCE_LIMIT)?;
        if records.is_empty() {
            return Err(
                "No source material in the installed library matches this lesson.".to_owned(),
            );
        }

        // Held until this classification is done, so it cannot interleave with
        // a lesson already generating and lose its own time waiting inside the
        // engine for a slot.
        let Some(_engine) = runtime.wait_for_engine(&cancellation).await else {
            return Err(STOPPED_WHILE_WAITING.to_owned());
        };
        let model_identity = model_catalogue::selected_model_identity(&database)?;
        let port = LlamaServerStructuredCompletionPort::new(&app, &runtime, model_identity);
        // One repair attempt, carrying back what was wrong with the first, the way
        // the lesson pipeline treats its own stages. A classification that leaves a
        // goal with nothing to teach is worth asking again about rather than
        // handing to the teacher as a failure.
        let mut complaint: Option<String> = None;
        let snapshot = loop {
            let instructions = match &complaint {
                None => TEACHING_GROUND_INSTRUCTIONS.to_owned(),
                Some(complaint) => format!(
                    "{TEACHING_GROUND_INSTRUCTIONS}\n\nThe previous answer was rejected: {complaint} Correct that and return the complete result."
                ),
            };
            let completion = port
                .complete(
                    StructuredCompletionRequest {
                        invocation_id: request_id.clone(),
                        signature_id: "lesson-plan.teaching-ground".to_owned(),
                        signature_version: "1".to_owned(),
                        system_instructions: instructions,
                        task_instructions: "Return the complete structured result.".to_owned(),
                        input: teaching_ground_input(
                            &lesson.topic,
                            lesson.subtopic.as_deref(),
                            &goals,
                            &records,
                        ),
                        output_schema: teaching_ground_schema(goals.len()),
                        limits: CompletionLimits {
                            temperature: 0.1,
                            // A retry pinned to the same sampling path is not a
                            // retry: the first attempt showed where that path leads.
                            seed: if complaint.is_some() { 32 } else { 31 },
                            max_output_tokens: 1600,
                            timeout_seconds: 180,
                        },
                        shown_page: None,
                    },
                    cancellation.clone(),
                )
                .await
                .map_err(|failure| failure.diagnostics.join(" "))?;

            let attempt = serde_json::from_str(&completion.output_text)
                .map_err(|error| format!("The lesson's learning goals could not be read: {error}"))
                .and_then(|drafted: crate::lesson_planning::teacher_authored::DraftedTeachingGround| {
                    curriculum_snapshot_from_goals(&goals, &records, &drafted)
                });
            match attempt {
                Ok(snapshot) => break snapshot,
                Err(error) if complaint.is_none() => complaint = Some(error),
                Err(error) => return Err(error),
            }
        };
        let record_ids = records
            .iter()
            .map(|record| record.record_id.clone())
            .collect::<Vec<_>>();
        crate::lesson_planning::save_teacher_lesson_curriculum(
            &database,
            &request.lesson_id,
            &lesson.learning_goals,
            &snapshot,
            &record_ids,
        )
    }
    .await;
    runtime.requests.finish(&request_id).await;
    result
}

/// How many sources a teacher-authored lesson is grounded in. Enough to cover a
/// lesson's worth of knowledge, few enough that the model reads all of them.
const TEACHER_SOURCE_LIMIT: usize = 5;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TeacherLessonGoalsRequest {
    pub context: LessonContextRequest,
    pub lesson_id: String,
}

#[tauri::command]
pub async fn create_granular_lesson_completion<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
    request: GranularLessonCompletionRequest,
) -> Result<GranularLessonRecord, String> {
    // The run is registered as a background task before it starts, under the
    // same id as its transport request, so every screen can see it and the
    // teacher can stop it from anywhere.
    let label = format!(
        "Preparing {}",
        request
            .input
            .subtopic
            .clone()
            .unwrap_or_else(|| request.input.topic.clone())
    );
    crate::task_registry::begin(
        &app,
        &database,
        crate::task_registry::NewTask {
            id: request_id.clone(),
            kind: "lesson_preparation".to_owned(),
            academic_session_id: request.context.academic_session_id.clone(),
            academic_period_id: request.context.academic_period_id.clone(),
            teaching_assignment_id: request.context.teaching_assignment_id.clone(),
            lesson_id: request.lesson_id.clone(),
            label,
        },
    )?;
    let cancellation = match runtime.requests.register(&request_id).await {
        Ok(token) => token,
        Err(error) => {
            let _ = crate::task_registry::finish(
                &app,
                &database,
                &request_id,
                crate::task_registry::TaskOutcome::Failed,
                Some(&error),
            );
            return Err(error);
        }
    };
    let stopped = cancellation.clone();
    let result = async {
        // Held for the whole eleven-node program. A lesson that has the engine
        // keeps it until it is finished rather than trading nodes with another
        // run, which is what made both of them slow and neither of them safe.
        let Some(_engine) = runtime
            .admit(&app, &database, &request_id, &cancellation)
            .await
        else {
            return Err(STOPPED_WHILE_WAITING.to_owned());
        };
        let program = granular_lesson_program()?;
        let input_value = request.input.to_value()?;
        let model_identity = model_catalogue::selected_model_identity(&database)?;
        let port = LlamaServerStructuredCompletionPort::new(&app, &runtime, model_identity);
        let result = match execute_new(
            &database,
            &program,
            &input_value,
            Some(request_id.as_str()),
            &port,
            cancellation,
        )
        .await
        {
            Ok(result) => result,
            Err(fault) => {
                return Err(release_unproven_curriculum(
                    &database,
                    &request.context,
                    &request.lesson_id,
                    fault,
                ))
            }
        };
        keep_prepared_lesson(
            &database,
            &request.context,
            &request.lesson_id,
            request.input,
            &program,
            result,
        )
    }
    .await;
    runtime.requests.finish(&request_id).await;
    match &result {
        Ok(_) => crate::task_registry::finish(
            &app,
            &database,
            &request_id,
            crate::task_registry::TaskOutcome::Succeeded,
            None,
        )?,
        Err(message) => {
            let outcome = if stopped.is_cancelled() {
                crate::task_registry::TaskOutcome::Cancelled
            } else {
                crate::task_registry::TaskOutcome::Failed
            };
            let _ =
                crate::task_registry::finish(&app, &database, &request_id, outcome, Some(message));
        }
    }
    result
}

/// Turns a finished preparation run into the record the product keeps — built,
/// validated, and persisted here in the backend the moment it exists. The
/// webview reloads the lesson to show it; it never carries the only copy.
fn keep_prepared_lesson(
    database: &Database,
    context: &LessonContextRequest,
    lesson_id: &str,
    input: GranularLessonProgramInput,
    program: &crate::generation_program::domain::ValidatedProgram,
    result: crate::generation_program::executor::GenerationResult,
) -> Result<GranularLessonRecord, String> {
    let plan = result.outputs.get("lessonPlan").ok_or_else(|| {
        "The completed lesson-planning run did not contain its validated lesson.".to_owned()
    })?;
    let plan = serde_json::from_value::<GranularLessonPlan>(plan.clone())
        .map_err(|error| format!("The completed detailed lesson could not be read: {error}"))?;
    let record = GranularLessonRecord {
        plan,
        curriculum_snapshot: input.curriculum_snapshot,
        source_evidence_snapshot: input.source_evidence_snapshot,
        program_snapshot: LessonProgramSnapshot {
            program_id: program.definition().id.clone(),
            program_version: program.definition().version.clone(),
            program_digest: program.digest().to_owned(),
            program_run_id: Some(result.run_id),
        },
    };
    record
        .validate_complete()
        .map_err(|errors| errors.join("\n"))?;
    crate::lesson_planning::persist_prepared_lesson(
        database,
        crate::lesson_planning::domain::SaveGranularLessonRequest {
            context: context.clone(),
            lesson_id: lesson_id.to_owned(),
            record: record.clone(),
        },
    )?;
    Ok(record)
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResumeLessonPreparationRequest {
    pub context: LessonContextRequest,
    pub task_id: String,
}

/// Picks an interrupted preparation back up from its saved checkpoints. The
/// finished nodes are not re-run; the work continues in the backend and the
/// bar shows it running again.
#[tauri::command]
pub async fn resume_lesson_preparation<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    corpus: State<'_, crate::content_corpus::ContentCorpus>,
    runtime: State<'_, InferenceRuntime>,
    request: ResumeLessonPreparationRequest,
) -> Result<(), String> {
    let task = crate::task_registry::get_task(&database, &request.task_id)?
        .ok_or_else(|| "That work is no longer listed.".to_owned())?;
    if task.kind != "lesson_preparation"
        || task.status != crate::task_registry::domain::TaskStatus::Interrupted
    {
        return Err("Only an interrupted preparation can be resumed.".to_owned());
    }
    let run_id =
        crate::generation_program::repository::find_interrupted_run(&database, &request.task_id)
            .map_err(|fault| fault.to_string())?
            .ok_or_else(|| {
                "The interrupted work is no longer available. Start the preparation again."
                    .to_owned()
            })?;
    let input = crate::lesson_planning::load_granular_program_input(
        &database,
        &corpus,
        crate::lesson_planning::domain::GranularLessonProgramInputRequest {
            context: request.context.clone(),
            lesson_id: task.lesson_id.clone(),
            lesson_duration_minutes: 50,
        },
    )?;
    crate::task_registry::begin(
        &app,
        &database,
        crate::task_registry::NewTask {
            id: request.task_id.clone(),
            kind: task.kind.clone(),
            academic_session_id: request.context.academic_session_id.clone(),
            academic_period_id: request.context.academic_period_id.clone(),
            teaching_assignment_id: request.context.teaching_assignment_id.clone(),
            lesson_id: task.lesson_id.clone(),
            label: task.label.clone(),
        },
    )?;
    let token = match runtime.requests.register(&request.task_id).await {
        Ok(token) => token,
        Err(error) => {
            let _ = crate::task_registry::finish(
                &app,
                &database,
                &request.task_id,
                crate::task_registry::TaskOutcome::Failed,
                Some(&error),
            );
            return Err(error);
        }
    };
    let context = request.context.clone();
    let lesson_id = task.lesson_id.clone();
    let task_id = request.task_id.clone();
    tauri::async_runtime::spawn(async move {
        let database = app.state::<Database>();
        let runtime = app.state::<InferenceRuntime>();
        let stopped = token.clone();
        let result: Result<(), String> = async {
            let Some(_engine) = runtime.admit(&app, &database, &task_id, &token).await else {
                return Err(STOPPED_WHILE_WAITING.to_owned());
            };
            let program = granular_lesson_program()?;
            let input_value = input.to_value()?;
            let model_identity = model_catalogue::selected_model_identity(&database)?;
            let port = LlamaServerStructuredCompletionPort::new(&app, &runtime, model_identity);
            let result = crate::generation_program::executor::resume_interrupted(
                &database,
                &run_id,
                &program,
                &input_value,
                &port,
                token,
            )
            .await
            .map_err(|fault| release_unproven_curriculum(&database, &context, &lesson_id, fault))?;
            keep_prepared_lesson(&database, &context, &lesson_id, input, &program, result)
                .map(|_| ())
        }
        .await;
        runtime.requests.finish(&task_id).await;
        match &result {
            Ok(()) => {
                let _ = crate::task_registry::finish(
                    &app,
                    &database,
                    &task_id,
                    crate::task_registry::TaskOutcome::Succeeded,
                    None,
                );
            }
            Err(message) => {
                let outcome = if stopped.is_cancelled() {
                    crate::task_registry::TaskOutcome::Cancelled
                } else {
                    crate::task_registry::TaskOutcome::Failed
                };
                let _ =
                    crate::task_registry::finish(&app, &database, &task_id, outcome, Some(message));
            }
        }
    });
    Ok(())
}

/// Reports why a lesson could not be prepared, having first let go of any
/// curriculum derived for it that has still produced no lesson.
///
/// A teacher who stopped the work has not failed it, so a cancelled run keeps
/// what was derived and starts from it next time.
fn release_unproven_curriculum(
    database: &Database,
    context: &LessonContextRequest,
    lesson_id: &str,
    fault: RuntimeFault,
) -> String {
    if fault.kind == RuntimeFaultKind::Cancelled {
        return fault.to_string();
    }
    match crate::lesson_planning::discard_teacher_lesson_curriculum(database, context, lesson_id) {
        Ok(()) => fault.to_string(),
        Err(error) => format!("{fault} {error}"),
    }
}

#[tauri::command]
pub async fn cancel_lesson_preparation_completion(
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
) -> Result<(), String> {
    runtime.requests.cancel(&request_id).await;
    Ok(())
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<()>("cancel_lesson_note_completion");
    answers.of::<()>("cancel_lesson_preparation_completion");
    answers.of::<GranularLessonRecord>("create_granular_lesson_completion");
    answers.of::<String>("create_lesson_note_completion");
    answers.of::<String>("create_lesson_preparation_completion");
    answers.of::<()>("resume_lesson_preparation");
    answers.of::<()>("work_through_teacher_lesson_goals");
}
