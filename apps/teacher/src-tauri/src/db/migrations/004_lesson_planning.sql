CREATE TABLE lessons (
    id TEXT PRIMARY KEY NOT NULL,
    academic_session_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    scheme_week_id TEXT,
    scheme_entry_id TEXT,
    curriculum_course_id TEXT,
    curriculum_unit_id TEXT,
    input_mode TEXT NOT NULL CHECK (input_mode IN ('structured', 'pasted')),
    topic TEXT NOT NULL,
    subtopic TEXT,
    raw_plan TEXT,
    learning_goals TEXT NOT NULL,
    materials TEXT NOT NULL,
    assessment TEXT NOT NULL,
    reference_notes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    latest_version_number INTEGER NOT NULL DEFAULT 0 CHECK (latest_version_number >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, curriculum_course_id),
    CHECK (
        (scheme_week_id IS NULL AND scheme_entry_id IS NULL
         AND curriculum_course_id IS NULL AND curriculum_unit_id IS NULL)
        OR
        (scheme_week_id IS NOT NULL AND scheme_entry_id IS NOT NULL
         AND curriculum_course_id IS NOT NULL AND curriculum_unit_id IS NOT NULL)
    ),
    CHECK (
        (input_mode = 'pasted' AND raw_plan IS NOT NULL)
        OR (input_mode = 'structured' AND raw_plan IS NULL)
    ),
    FOREIGN KEY (academic_period_id, academic_session_id)
        REFERENCES academic_periods(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (teaching_assignment_id, academic_session_id)
        REFERENCES teaching_assignments(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_week_id) REFERENCES scheme_weeks(id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_entry_id, curriculum_course_id)
        REFERENCES scheme_entries(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_unit_id, curriculum_course_id)
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE lesson_steps (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    title TEXT NOT NULL,
    teacher_activity TEXT NOT NULL,
    learner_activity TEXT NOT NULL,
    duration_minutes INTEGER CHECK (duration_minutes BETWEEN 1 AND 240),
    UNIQUE (lesson_id, sequence),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE lesson_curriculum_outcomes (
    lesson_id TEXT NOT NULL,
    curriculum_outcome_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (lesson_id, curriculum_outcome_id),
    FOREIGN KEY (lesson_id, curriculum_course_id)
        REFERENCES lessons(id, curriculum_course_id) ON DELETE CASCADE,
    FOREIGN KEY (curriculum_outcome_id, curriculum_course_id)
        REFERENCES curriculum_outcomes(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE lesson_versions (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    academic_session_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    scheme_week_id TEXT,
    scheme_entry_id TEXT,
    curriculum_course_id TEXT,
    curriculum_unit_id TEXT,
    topic TEXT NOT NULL,
    subtopic TEXT,
    learning_goals TEXT NOT NULL,
    materials TEXT NOT NULL,
    assessment TEXT NOT NULL,
    reference_notes TEXT NOT NULL,
    confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lesson_id, version_number),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE RESTRICT,
    FOREIGN KEY (academic_period_id, academic_session_id)
        REFERENCES academic_periods(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (teaching_assignment_id, academic_session_id)
        REFERENCES teaching_assignments(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_week_id) REFERENCES scheme_weeks(id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_entry_id, curriculum_course_id)
        REFERENCES scheme_entries(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_unit_id, curriculum_course_id)
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE lesson_version_steps (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_version_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    title TEXT NOT NULL,
    teacher_activity TEXT NOT NULL,
    learner_activity TEXT NOT NULL,
    duration_minutes INTEGER CHECK (duration_minutes BETWEEN 1 AND 240),
    UNIQUE (lesson_version_id, sequence),
    FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id) ON DELETE RESTRICT
);

CREATE TABLE lesson_version_outcomes (
    lesson_version_id TEXT NOT NULL,
    curriculum_outcome_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (lesson_version_id, curriculum_outcome_id),
    FOREIGN KEY (lesson_version_id, curriculum_course_id)
        REFERENCES lesson_versions(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_outcome_id, curriculum_course_id)
        REFERENCES curriculum_outcomes(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TRIGGER lesson_versions_immutable_update
BEFORE UPDATE ON lesson_versions
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson versions are immutable');
END;

CREATE TRIGGER lesson_versions_immutable_delete
BEFORE DELETE ON lesson_versions
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson versions are immutable');
END;

CREATE TRIGGER lesson_version_steps_immutable_update
BEFORE UPDATE ON lesson_version_steps
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson version steps are immutable');
END;

CREATE TRIGGER lesson_version_steps_immutable_delete
BEFORE DELETE ON lesson_version_steps
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson version steps are immutable');
END;

CREATE TRIGGER lesson_version_outcomes_immutable_update
BEFORE UPDATE ON lesson_version_outcomes
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson version outcomes are immutable');
END;

CREATE TRIGGER lesson_version_outcomes_immutable_delete
BEFORE DELETE ON lesson_version_outcomes
BEGIN
    SELECT RAISE(ABORT, 'confirmed lesson version outcomes are immutable');
END;
