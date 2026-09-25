use tauri::{AppHandle, Runtime, State};

use crate::{
    db::Database,
    inference::{InferenceRuntime, LlamaServerStructuredCompletionPort},
    model_acquisition::ModelAcquisitionRuntime,
    model_catalogue,
};

use super::{photograph, ImportedLessonPlan, LessonPlanPhotograph};

/// Reads a lesson plan out of a document the teacher picked.
///
/// The picker runs in the frontend, so what arrives here is a path the teacher
/// chose in their own file dialog rather than one graspy went looking for.
#[tauri::command]
pub async fn import_lesson_plan_document(path: String) -> Result<ImportedLessonPlan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::read_plan_document(std::path::Path::new(&path))
    })
    .await
    .map_err(|_| "Reading that file was interrupted. Try again.".to_owned())?
}

/// Whether a photograph of a lesson plan can be read on this machine.
///
/// It takes a second file beside the weights, so a teacher who has not got one
/// is not offered a way in that would fail. Nothing about it is said on screen
/// until there is something for them to do about it.
#[tauri::command]
pub async fn can_read_a_lesson_plan_photograph<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    acquisition: State<'_, ModelAcquisitionRuntime>,
) -> Result<bool, String> {
    Ok(acquisition.sight_is_installed(&app, &database).await)
}

/// Reads a lesson plan off a photograph of the page the teacher wrote it on.
///
/// Unlike a Word file this one goes through the engine, so it takes the best
/// part of a minute, waits its turn behind a lesson already being written, and
/// stops when the teacher stops it. The words land where a paste lands, beside
/// the photograph they were read from, for the teacher to correct.
#[tauri::command]
pub async fn read_lesson_plan_photograph<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
    path: String,
) -> Result<LessonPlanPhotograph, String> {
    let cancellation = runtime.requests.register(&request_id).await?;
    let result = async {
        let chosen = std::path::Path::new(&path);
        let bytes = super::bytes_of(
            chosen,
            "That photograph is too large to read. Take one of a single page and try again.",
        )?;
        let page = photograph::photograph_in(&bytes)?;
        let Some(_engine) = runtime.wait_for_engine(&cancellation).await else {
            return Err("Reading that photograph was stopped before it started.".to_owned());
        };
        let model_identity = model_catalogue::selected_model_identity(&database)?;
        let port = LlamaServerStructuredCompletionPort::new(&app, &runtime, model_identity);
        let text =
            photograph::copy_out_page(&port, &request_id, &page, cancellation.clone()).await?;
        Ok(LessonPlanPhotograph {
            file_name: super::name_of(chosen),
            text,
            page: photograph::as_shown(&page)?,
        })
    }
    .await;
    runtime.requests.finish(&request_id).await;
    result
}

/// Stops a reading a teacher no longer wants to wait for.
#[tauri::command]
pub async fn stop_reading_lesson_plan_photograph(
    runtime: State<'_, InferenceRuntime>,
    request_id: String,
) -> Result<(), String> {
    runtime.requests.cancel(&request_id).await;
    Ok(())
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<bool>("can_read_a_lesson_plan_photograph");
    answers.of::<ImportedLessonPlan>("import_lesson_plan_document");
    answers.of::<LessonPlanPhotograph>("read_lesson_plan_photograph");
    answers.of::<()>("stop_reading_lesson_plan_photograph");
}
