use rusqlite::{params, OptionalExtension, Row};

use crate::db::Database;

use super::domain::{BackgroundTask, NewTask, TaskOutcome, TaskStatus};

/// Every read of a task, including its place in line. The queue is global —
/// waiting work is held up by whatever holds the engine, in this class or any
/// other — so position counts every queued task, not just this context's.
const TASK_COLUMNS: &str = "id, kind, lesson_id, label, status,
     CASE WHEN status = 'queued' THEN (
         SELECT COUNT(*) + 1 FROM background_tasks AS ahead
         WHERE ahead.status = 'queued'
           AND (ahead.started_at < background_tasks.started_at
                OR (ahead.started_at = background_tasks.started_at
                    AND ahead.rowid < background_tasks.rowid))
     ) END AS queue_position,
     failure_message, started_at, updated_at, finished_at, dismissed_at";

/// Records work that is about to run. The row is written before the work is
/// started, so a crash between the two leaves a visible interrupted task
/// rather than silence.
/// Records a task as waiting for the engine. The row lands before any work
/// starts, so a crash between the two leaves a visible task rather than
/// silence, and the screen that would offer to start this work again can see
/// that it already exists.
///
/// A task id whose earlier run has ENDED — failed, been cancelled, or been
/// interrupted — is reopened under the same identity, which is how a retry or
/// a resume re-enters the registry. Work already queued or running refuses a
/// second beginning.
pub(super) fn insert(database: &Database, task: &NewTask) -> Result<(), String> {
    database.with_connection(|connection| {
        let changed = connection
            .execute(
                "INSERT INTO background_tasks (
                     id, kind, academic_session_id, academic_period_id,
                     teaching_assignment_id, lesson_id, label, status
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued')
                 ON CONFLICT(id) DO UPDATE SET
                     status = 'queued',
                     label = excluded.label,
                     failure_message = NULL,
                     started_at = datetime('now'),
                     updated_at = datetime('now'),
                     finished_at = NULL
                 WHERE background_tasks.status NOT IN ('queued', 'running')",
                params![
                    task.id,
                    task.kind,
                    task.academic_session_id,
                    task.academic_period_id,
                    task.teaching_assignment_id,
                    task.lesson_id,
                    task.label,
                ],
            )
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            return Err("This work is already under way.".to_owned());
        }
        Ok(())
    })
}

/// Marks waiting work as started, at the moment it takes the engine. Only a
/// queued task starts; one already cancelled while it waited stays cancelled
/// and its runner is told so.
pub(super) fn start_running(database: &Database, id: &str) -> Result<bool, String> {
    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE background_tasks SET
                     status = 'running',
                     started_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?1 AND status = 'queued'",
                params![id],
            )
            .map(|changed| changed > 0)
            .map_err(|error| error.to_string())
    })
}

/// Closes a live task with how it ended. Only work still queued or running can
/// finish, so a task already cancelled or closed keeps its first ending.
pub(super) fn finish(
    database: &Database,
    id: &str,
    outcome: TaskOutcome,
    failure_message: Option<&str>,
) -> Result<bool, String> {
    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE background_tasks SET
                     status = ?2,
                     failure_message = ?3,
                     updated_at = datetime('now'),
                     finished_at = datetime('now')
                 WHERE id = ?1 AND status IN ('queued', 'running')",
                params![id, outcome.status().as_str(), failure_message],
            )
            .map(|changed| changed > 0)
            .map_err(|error| error.to_string())
    })
}

/// At startup nothing can still be under way, so whatever claims to be —
/// running, or waiting for a turn that will never come — was interrupted by
/// the last shutdown and is marked so, for the teacher to resume or discard.
pub(super) fn mark_interrupted_on_startup(database: &Database) -> Result<usize, String> {
    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE background_tasks SET
                     status = 'interrupted',
                     updated_at = datetime('now')
                 WHERE status IN ('queued', 'running')",
                [],
            )
            .map_err(|error| error.to_string())
    })
}

/// Cancels a task that has no live future to close it — one still waiting for
/// the engine, one interrupted by a shutdown, or one whose runner is being told
/// to stop right now. Terminal tasks are left as they ended.
/// Puts ended work away at the teacher's say-so.
///
/// Only work that has ended: while something is still queued or running the
/// control offered is Stop, and stopping is `mark_cancelled`. Dismissing one
/// that is still going would hide work still using the engine.
pub(super) fn mark_dismissed(database: &Database, id: &str) -> Result<bool, String> {
    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE background_tasks SET
                     dismissed_at = COALESCE(dismissed_at, datetime('now')),
                     updated_at = datetime('now')
                 WHERE id = ?1 AND status NOT IN ('queued', 'running')",
                params![id],
            )
            .map(|changed| changed > 0)
            .map_err(|error| error.to_string())
    })
}

pub(super) fn mark_cancelled(database: &Database, id: &str) -> Result<bool, String> {
    database.with_connection(|connection| {
        connection
            .execute(
                "UPDATE background_tasks SET
                     status = 'cancelled',
                     updated_at = datetime('now'),
                     finished_at = COALESCE(finished_at, datetime('now'))
                 WHERE id = ?1 AND status IN ('queued', 'running', 'interrupted')",
                params![id],
            )
            .map(|changed| changed > 0)
            .map_err(|error| error.to_string())
    })
}

/// The tasks a class and term has seen lately, newest first — what the
/// return-to-task element renders.
pub(super) fn list_for_context(
    database: &Database,
    academic_period_id: &str,
    teaching_assignment_id: &str,
) -> Result<Vec<BackgroundTask>, String> {
    database.with_connection(|connection| -> Result<Vec<BackgroundTask>, String> {
        let mut statement = connection
            .prepare(&format!(
                "SELECT {TASK_COLUMNS}
                 FROM background_tasks
                 WHERE academic_period_id = ?1 AND teaching_assignment_id = ?2
                 ORDER BY started_at DESC, rowid DESC
                 LIMIT 20",
            ))
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(
                params![academic_period_id, teaching_assignment_id],
                read_task,
            )
            .map_err(|error| error.to_string())?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row.map_err(|error| error.to_string())?);
        }
        Ok(tasks)
    })
}

pub(super) fn get(database: &Database, id: &str) -> Result<Option<BackgroundTask>, String> {
    database.with_connection(|connection| {
        connection
            .query_row(
                &format!("SELECT {TASK_COLUMNS} FROM background_tasks WHERE id = ?1"),
                params![id],
                read_task,
            )
            .optional()
            .map_err(|error| error.to_string())
    })
}

fn read_task(row: &Row<'_>) -> rusqlite::Result<BackgroundTask> {
    let status: String = row.get(4)?;
    Ok(BackgroundTask {
        id: row.get(0)?,
        kind: row.get(1)?,
        lesson_id: row.get(2)?,
        label: row.get(3)?,
        status: TaskStatus::parse(&status).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, error.into())
        })?,
        queue_position: row.get(5)?,
        failure_message: row.get(6)?,
        started_at: row.get(7)?,
        updated_at: row.get(8)?,
        finished_at: row.get(9)?,
        dismissed_at: row.get(10)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str) -> NewTask {
        NewTask {
            id: id.to_owned(),
            kind: "lesson_preparation".to_owned(),
            academic_session_id: "session-1".to_owned(),
            academic_period_id: "period-1".to_owned(),
            teaching_assignment_id: "assignment-1".to_owned(),
            lesson_id: "lesson-1".to_owned(),
            label: "Preparing Millions and billions".to_owned(),
        }
    }

    #[test]
    fn records_a_task_as_waiting_before_it_runs_and_reads_it_back() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("the task is recorded");

        let stored = get(&database, "task-1").expect("read").expect("present");
        assert_eq!(stored.status, TaskStatus::Queued);
        assert_eq!(stored.queue_position, Some(1));
        assert_eq!(stored.label, "Preparing Millions and billions");
        assert_eq!(stored.finished_at, None);

        let error =
            insert(&database, &task("task-1")).expect_err("live work refuses a second beginning");
        assert!(error.contains("already under way"), "unexpected: {error}");
    }

    #[test]
    fn waiting_work_starts_when_it_takes_the_engine_and_leaves_the_queue() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");

        assert!(start_running(&database, "task-1").expect("started"));
        let running = get(&database, "task-1").expect("read").expect("present");
        assert_eq!(running.status, TaskStatus::Running);
        assert_eq!(running.queue_position, None);

        assert!(
            !start_running(&database, "task-1").expect("start"),
            "work already running does not start twice",
        );
    }

    #[test]
    fn work_cancelled_while_it_waited_never_starts() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");
        assert!(mark_cancelled(&database, "task-1").expect("cancel"));

        assert!(
            !start_running(&database, "task-1").expect("start"),
            "a cancelled task must not take the engine",
        );
        assert_eq!(
            get(&database, "task-1").unwrap().unwrap().status,
            TaskStatus::Cancelled
        );
    }

    #[test]
    fn place_in_line_counts_every_class_and_only_waiting_work() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");
        let mut elsewhere = task("task-2");
        elsewhere.teaching_assignment_id = "assignment-2".to_owned();
        insert(&database, &elsewhere).expect("recorded");
        insert(&database, &task("task-3")).expect("recorded");

        assert_eq!(
            get(&database, "task-1").unwrap().unwrap().queue_position,
            Some(1)
        );
        assert_eq!(
            get(&database, "task-2").unwrap().unwrap().queue_position,
            Some(2)
        );
        assert_eq!(
            get(&database, "task-3").unwrap().unwrap().queue_position,
            Some(3)
        );

        start_running(&database, "task-1").expect("started");
        assert_eq!(
            get(&database, "task-2").unwrap().unwrap().queue_position,
            Some(1)
        );
        assert_eq!(
            get(&database, "task-3").unwrap().unwrap().queue_position,
            Some(2)
        );
    }

    #[test]
    fn an_ended_task_reopens_under_the_same_identity() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");
        assert!(finish(&database, "task-1", TaskOutcome::Failed, Some("broke")).expect("finish"));

        insert(&database, &task("task-1")).expect("a failed task reopens for its retry");
        let reopened = get(&database, "task-1").expect("read").expect("present");
        assert_eq!(reopened.status, TaskStatus::Queued);
        assert_eq!(reopened.failure_message, None);
        assert_eq!(reopened.finished_at, None);
    }

    #[test]
    fn a_task_ends_once_and_keeps_its_first_ending() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");

        assert!(finish(&database, "task-1", TaskOutcome::Succeeded, None).expect("finish"));
        let stored = get(&database, "task-1").expect("read").expect("present");
        assert_eq!(stored.status, TaskStatus::Succeeded);
        assert!(stored.finished_at.is_some());

        assert!(!finish(&database, "task-1", TaskOutcome::Failed, Some("late")).expect("finish"));
        let unchanged = get(&database, "task-1").expect("read").expect("present");
        assert_eq!(unchanged.status, TaskStatus::Succeeded);
        assert_eq!(unchanged.failure_message, None);
    }

    #[test]
    fn startup_marks_running_and_waiting_work_interrupted_but_not_endings() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");
        start_running(&database, "task-1").expect("started");
        insert(&database, &task("task-3")).expect("recorded");
        insert(&database, &task("task-2")).expect("recorded");
        finish(&database, "task-2", TaskOutcome::Succeeded, None).expect("finish");

        let marked = mark_interrupted_on_startup(&database).expect("marked");
        assert_eq!(marked, 2, "the running task and the one still waiting");
        assert_eq!(
            get(&database, "task-3").unwrap().unwrap().status,
            TaskStatus::Interrupted
        );
        assert_eq!(
            get(&database, "task-1").unwrap().unwrap().status,
            TaskStatus::Interrupted
        );
        assert_eq!(
            get(&database, "task-2").unwrap().unwrap().status,
            TaskStatus::Succeeded
        );
    }

    /// The whole point of clearing a failure is that it stays cleared, and that
    /// clearing never reaches work still using the engine.
    #[test]
    fn a_teacher_clears_ended_work_for_good_and_never_clears_live_work() {
        let database = Database::in_memory();
        insert(&database, &task("failed-one")).expect("recorded");
        start_running(&database, "failed-one").expect("started");
        finish(
            &database,
            "failed-one",
            TaskOutcome::Failed,
            Some("the engine stopped"),
        )
        .expect("finish");

        assert!(mark_dismissed(&database, "failed-one").expect("dismiss"));
        let cleared = get(&database, "failed-one").unwrap().unwrap();
        assert!(cleared.dismissed_at.is_some(), "the clearing is recorded");
        assert_eq!(
            cleared.status,
            TaskStatus::Failed,
            "putting it away keeps what happened to the lesson"
        );

        insert(&database, &task("still-running")).expect("recorded");
        start_running(&database, "still-running").expect("started");
        assert!(
            !mark_dismissed(&database, "still-running").expect("dismiss"),
            "work still using the engine cannot be put away"
        );
        assert!(get(&database, "still-running")
            .unwrap()
            .unwrap()
            .dismissed_at
            .is_none());
    }

    #[test]
    fn cancelling_closes_live_and_interrupted_work_but_never_rewrites_an_ending() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");
        mark_interrupted_on_startup(&database).expect("marked");
        assert!(mark_cancelled(&database, "task-1").expect("cancel"));
        assert_eq!(
            get(&database, "task-1").unwrap().unwrap().status,
            TaskStatus::Cancelled
        );

        insert(&database, &task("task-2")).expect("recorded");
        start_running(&database, "task-2").expect("started");
        finish(
            &database,
            "task-2",
            TaskOutcome::Failed,
            Some("the engine stopped"),
        )
        .expect("finish");
        assert!(!mark_cancelled(&database, "task-2").expect("cancel"));
        assert_eq!(
            get(&database, "task-2").unwrap().unwrap().status,
            TaskStatus::Failed
        );
    }

    #[test]
    fn lists_the_context_newest_first_and_no_other_class() {
        let database = Database::in_memory();
        insert(&database, &task("task-1")).expect("recorded");
        insert(&database, &task("task-2")).expect("recorded");
        let mut elsewhere = task("task-3");
        elsewhere.teaching_assignment_id = "assignment-2".to_owned();
        insert(&database, &elsewhere).expect("recorded");

        let tasks = list_for_context(&database, "period-1", "assignment-1").expect("list");
        assert_eq!(
            tasks
                .iter()
                .map(|task| task.id.as_str())
                .collect::<Vec<_>>(),
            vec!["task-2", "task-1"],
        );
    }
}
