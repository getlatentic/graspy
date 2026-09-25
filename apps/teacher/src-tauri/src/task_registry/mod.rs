pub(crate) mod commands;
pub(crate) mod domain;
mod repository;

pub use commands::{
    cancel_background_task, dismiss_background_task, get_background_task, list_background_tasks,
};
pub(crate) use domain::{NewTask, TaskOutcome};

use tauri::{AppHandle, Emitter, Runtime};

use crate::db::Database;

/// The event the frontend listens on to re-read the task list; the database
/// stays the one source of truth and this only says it changed.
pub(crate) const TASKS_CHANGED_EVENT: &str = "background-tasks-changed";

/// Records work about to run — the row lands before the work starts, so a
/// crash between the two leaves a visible interrupted task, never silence.
pub(crate) fn begin<R: Runtime>(
    app: &AppHandle<R>,
    database: &Database,
    task: NewTask,
) -> Result<(), String> {
    repository::insert(database, &task)?;
    let _ = app.emit(TASKS_CHANGED_EVENT, ());
    Ok(())
}

/// Marks waiting work as started, at the moment it takes the engine. `false`
/// says the teacher stopped it while it waited, so it must not run.
pub(crate) fn start_running<R: Runtime>(
    app: &AppHandle<R>,
    database: &Database,
    id: &str,
) -> Result<bool, String> {
    let started = repository::start_running(database, id)?;
    let _ = app.emit(TASKS_CHANGED_EVENT, ());
    Ok(started)
}

/// Reads one task, for a flow deciding whether it can be resumed.
pub(crate) fn get_task(
    database: &Database,
    id: &str,
) -> Result<Option<domain::BackgroundTask>, String> {
    repository::get(database, id)
}

/// Closes a task with how it ended. A task already closed keeps its first
/// ending, so a cancel that raced a finish stays cancelled.
pub(crate) fn finish<R: Runtime>(
    app: &AppHandle<R>,
    database: &Database,
    id: &str,
    outcome: TaskOutcome,
    failure_message: Option<&str>,
) -> Result<(), String> {
    repository::finish(database, id, outcome, failure_message)?;
    let _ = app.emit(TASKS_CHANGED_EVENT, ());
    Ok(())
}

/// At startup nothing can still be running: whatever claims to be was cut off
/// by the last shutdown and is marked interrupted for the teacher to resume or
/// discard.
pub(crate) fn mark_interrupted_on_startup(database: &Database) -> Result<usize, String> {
    repository::mark_interrupted_on_startup(database)
}
