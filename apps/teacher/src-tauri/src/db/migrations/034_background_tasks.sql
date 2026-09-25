-- The registry of long-running work: one row per task the app has started for a
-- teacher, kept so a task outlives the screen that started it and an app
-- restart. Rich per-kind state stays in each feature's own tables; this table
-- owns the uniform lifecycle every screen renders and the way back to a task.
-- Progress is not stored here: each kind derives it from its own records
-- (preparation summarises executor node runs), joined by the shared task id.
--
-- lesson_id carries no foreign key on purpose: the registry is an operational
-- journal, and a task row must stay visible and explainable even when the
-- lesson it worked on has since been removed.
CREATE TABLE background_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    academic_session_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','interrupted','succeeded','failed','cancelled')),
    failure_message TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
);

CREATE INDEX idx_background_tasks_context
    ON background_tasks (teaching_assignment_id, academic_period_id, started_at DESC);
