use tauri::{AppHandle, Emitter, Runtime, State};

use crate::{db::Database, inference::InferenceRuntime, lesson_planning::LessonContextRequest};

use super::{domain::BackgroundTask, repository, TASKS_CHANGED_EVENT};

/// The tasks the selected class and term has seen lately — what the
/// return-to-task element renders, newest first.
#[tauri::command(async)]
pub fn list_background_tasks(
    database: State<'_, Database>,
    context: LessonContextRequest,
) -> Result<Vec<BackgroundTask>, String> {
    repository::list_for_context(
        &database,
        &context.academic_period_id,
        &context.teaching_assignment_id,
    )
}

/// One task by its id — how a screen re-attaches to work it did not start,
/// or checks on a task it was returned to.
#[tauri::command(async)]
pub fn get_background_task(
    database: State<'_, Database>,
    task_id: String,
) -> Result<Option<BackgroundTask>, String> {
    repository::get(&database, &task_id)
}

/// Puts ended work away, so a failure a teacher has read stops greeting them.
///
/// Recorded rather than held on the screen: the point of clearing it is that it
/// stays cleared after the app is closed.
#[tauri::command(async)]
pub fn dismiss_background_task<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    task_id: String,
) -> Result<(), String> {
    repository::mark_dismissed(&database, &task_id)?;
    let _ = app.emit(TASKS_CHANGED_EVENT, ());
    Ok(())
}

/// Stops a task on the teacher's say-so — the only way work is ever cancelled.
///
/// A live task is told to stop through its cancellation token and its row is
/// closed here so the change shows at once; the runner's own ending then finds
/// the row already closed and leaves it. An interrupted task has no runner, so
/// closing the row is the whole cancellation.
#[tauri::command]
pub async fn cancel_background_task<R: Runtime>(
    app: AppHandle<R>,
    database: State<'_, Database>,
    runtime: State<'_, InferenceRuntime>,
    task_id: String,
) -> Result<(), String> {
    runtime.cancel_request(&task_id).await;
    repository::mark_cancelled(&database, &task_id)?;
    let _ = app.emit(TASKS_CHANGED_EVENT, ());
    Ok(())
}

#[cfg(test)]
pub(crate) fn declare_answers(answers: &mut crate::command_answers::CommandAnswers) {
    answers.of::<()>("cancel_background_task");
    answers.of::<()>("dismiss_background_task");
    answers.of::<Option<BackgroundTask>>("get_background_task");
    answers.of::<Vec<BackgroundTask>>("list_background_tasks");
}
