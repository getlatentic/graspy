DROP TRIGGER lesson_versions_immutable_update;
DROP TRIGGER lesson_versions_immutable_delete;
DROP TRIGGER lessons_granular_format_requires_record_insert;
DROP TRIGGER lessons_granular_format_requires_record_update;
DROP TRIGGER lesson_versions_granular_format_requires_record_insert;

CREATE TABLE lessons_v23 (
    id TEXT PRIMARY KEY NOT NULL,
    academic_session_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    scheme_week_id TEXT,
    scheme_entry_id TEXT,
    curriculum_course_id TEXT,
    curriculum_unit_id TEXT,
    curriculum_node_id TEXT,
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
    source_plan_text TEXT,
    plan_format TEXT NOT NULL DEFAULT 'legacy_import'
        CHECK (plan_format IN ('legacy_import', 'granular')),
    UNIQUE (id, curriculum_course_id),
    CHECK (
        (scheme_week_id IS NULL AND scheme_entry_id IS NULL
         AND curriculum_course_id IS NULL AND curriculum_unit_id IS NULL
         AND curriculum_node_id IS NULL)
        OR
        (scheme_week_id IS NOT NULL AND scheme_entry_id IS NOT NULL
         AND curriculum_course_id IS NOT NULL
         AND ((curriculum_unit_id IS NOT NULL AND curriculum_node_id IS NULL)
              OR (curriculum_unit_id IS NULL AND curriculum_node_id IS NOT NULL)))
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
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT
);

INSERT INTO lessons_v23 (
    id, academic_session_id, academic_period_id, teaching_assignment_id,
    scheme_week_id, scheme_entry_id, curriculum_course_id, curriculum_unit_id,
    curriculum_node_id, input_mode, topic, subtopic, raw_plan, learning_goals,
    materials, assessment, reference_notes, status, latest_version_number,
    created_at, updated_at, source_plan_text, plan_format
)
SELECT
    id, academic_session_id, academic_period_id, teaching_assignment_id,
    scheme_week_id, scheme_entry_id, curriculum_course_id, curriculum_unit_id,
    NULL, input_mode, topic, subtopic, raw_plan, learning_goals, materials,
    assessment, reference_notes, status, latest_version_number, created_at,
    updated_at, source_plan_text, plan_format
FROM lessons;

DROP TABLE lessons;
ALTER TABLE lessons_v23 RENAME TO lessons;

CREATE TABLE lesson_versions_v23 (
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
    curriculum_node_id TEXT,
    topic TEXT NOT NULL,
    subtopic TEXT,
    learning_goals TEXT NOT NULL,
    materials TEXT NOT NULL,
    assessment TEXT NOT NULL,
    reference_notes TEXT NOT NULL,
    confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_plan_text TEXT,
    plan_format TEXT NOT NULL DEFAULT 'legacy_import'
        CHECK (plan_format IN ('legacy_import', 'granular')),
    UNIQUE (lesson_id, version_number),
    UNIQUE (id, curriculum_course_id),
    CHECK (
        (scheme_week_id IS NULL AND scheme_entry_id IS NULL
         AND curriculum_course_id IS NULL AND curriculum_unit_id IS NULL
         AND curriculum_node_id IS NULL)
        OR
        (scheme_week_id IS NOT NULL AND scheme_entry_id IS NOT NULL
         AND curriculum_course_id IS NOT NULL
         AND ((curriculum_unit_id IS NOT NULL AND curriculum_node_id IS NULL)
              OR (curriculum_unit_id IS NULL AND curriculum_node_id IS NOT NULL)))
    ),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE RESTRICT,
    FOREIGN KEY (academic_period_id, academic_session_id)
        REFERENCES academic_periods(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (teaching_assignment_id, academic_session_id)
        REFERENCES teaching_assignments(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_week_id) REFERENCES scheme_weeks(id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_entry_id, curriculum_course_id)
        REFERENCES scheme_entries(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_unit_id, curriculum_course_id)
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT
);

INSERT INTO lesson_versions_v23 (
    id, lesson_id, version_number, academic_session_id, academic_period_id,
    teaching_assignment_id, scheme_week_id, scheme_entry_id,
    curriculum_course_id, curriculum_unit_id, curriculum_node_id, topic,
    subtopic, learning_goals, materials, assessment, reference_notes,
    confirmed_at, source_plan_text, plan_format
)
SELECT
    id, lesson_id, version_number, academic_session_id, academic_period_id,
    teaching_assignment_id, scheme_week_id, scheme_entry_id,
    curriculum_course_id, curriculum_unit_id, NULL, topic, subtopic,
    learning_goals, materials, assessment, reference_notes, confirmed_at,
    source_plan_text, plan_format
FROM lesson_versions;

DROP TABLE lesson_versions;
ALTER TABLE lesson_versions_v23 RENAME TO lesson_versions;

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

CREATE TRIGGER lessons_granular_format_requires_record_insert
BEFORE INSERT ON lesson_granular_drafts
WHEN (SELECT plan_format FROM lessons WHERE id = NEW.lesson_id) <> 'granular'
BEGIN
    SELECT RAISE(ABORT, 'detailed lesson data requires the granular lesson format');
END;

CREATE TRIGGER lessons_granular_format_requires_record_update
BEFORE UPDATE ON lesson_granular_drafts
WHEN (SELECT plan_format FROM lessons WHERE id = NEW.lesson_id) <> 'granular'
BEGIN
    SELECT RAISE(ABORT, 'detailed lesson data requires the granular lesson format');
END;

CREATE TRIGGER lesson_versions_granular_format_requires_record_insert
BEFORE INSERT ON lesson_granular_versions
WHEN (SELECT plan_format FROM lesson_versions WHERE id = NEW.lesson_version_id) <> 'granular'
BEGIN
    SELECT RAISE(ABORT, 'detailed lesson version data requires the granular lesson format');
END;
