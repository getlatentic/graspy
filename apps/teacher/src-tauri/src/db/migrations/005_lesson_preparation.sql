ALTER TABLE lessons ADD COLUMN source_plan_text TEXT;
ALTER TABLE lesson_versions ADD COLUMN source_plan_text TEXT;

CREATE TABLE lesson_preparations (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    source_raw_plan TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    learning_goals TEXT NOT NULL,
    materials TEXT NOT NULL,
    assessment TEXT NOT NULL,
    reference_notes TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE lesson_preparation_steps (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    title TEXT NOT NULL,
    teacher_activity TEXT NOT NULL,
    learner_activity TEXT NOT NULL,
    duration_minutes INTEGER CHECK (duration_minutes BETWEEN 1 AND 240),
    UNIQUE (lesson_id, sequence),
    FOREIGN KEY (lesson_id) REFERENCES lesson_preparations(lesson_id) ON DELETE CASCADE
);

CREATE TRIGGER lesson_preparation_source_immutable
BEFORE UPDATE OF source_raw_plan ON lesson_preparations
BEGIN
    SELECT RAISE(ABORT, 'lesson preparation source is immutable');
END;
