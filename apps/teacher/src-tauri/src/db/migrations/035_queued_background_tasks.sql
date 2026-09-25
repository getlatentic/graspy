-- The engine runs one job at a time, so work now waits its turn before it
-- starts. A waiting task is 'queued': recorded, cancellable, and visible on the
-- screen that would otherwise offer to start it again — but it has not touched
-- the model and its own timeouts are not running.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. Existing
-- rows keep their status, their history and their identity.
CREATE TABLE background_tasks_next (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    academic_session_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('queued','running','interrupted','succeeded','failed','cancelled')
    ),
    failure_message TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
);

INSERT INTO background_tasks_next (
    id, kind, academic_session_id, academic_period_id, teaching_assignment_id,
    lesson_id, label, status, failure_message,
    started_at, updated_at, finished_at
)
SELECT
    id, kind, academic_session_id, academic_period_id, teaching_assignment_id,
    lesson_id, label, status, failure_message,
    started_at, updated_at, finished_at
FROM background_tasks;

DROP TABLE background_tasks;

ALTER TABLE background_tasks_next RENAME TO background_tasks;

CREATE INDEX idx_background_tasks_context
    ON background_tasks (teaching_assignment_id, academic_period_id, started_at DESC);

-- Queue position is read by ordering waiting work by when it was recorded, and
-- the queue is global: a lesson waiting in one class is held up by a lesson
-- running in another.
CREATE INDEX idx_background_tasks_queued
    ON background_tasks (started_at)
    WHERE status = 'queued';
