-- `plan_format` is the last fact this codebase wrote down twice.
--
-- It records whether a lesson has been worked into a structured plan, which is
-- exactly whether a row exists in `lesson_granular_drafts` — and on a version,
-- in `lesson_granular_versions`; on a preparation, in
-- `lesson_granular_preparations`. Every reader derives it from that row now.
--
-- Four triggers existed only to hold the column to the plan it described,
-- refusing to store a plan for a lesson the column did not call granular. A
-- fact read from one place cannot disagree with itself, so the guard has
-- nothing left to guard and goes with the column.
--
-- One error message goes too. The classwork's step loader carried a branch for
-- a version whose column said 'granular' while no plan row existed — "The
-- confirmed detailed lesson is incomplete" — which was the drift the column
-- made possible. A version now has a plan or it has none.
--
-- SQLite will not drop a column named in a CHECK, and each of the three carries
-- its own, so each table is rebuilt. Every other column, check, key, default,
-- index and trigger is carried across as it stood.

DROP TRIGGER lessons_granular_format_requires_record_insert;
DROP TRIGGER lessons_granular_format_requires_record_update;
DROP TRIGGER lesson_versions_granular_format_requires_record_insert;
DROP TRIGGER lesson_preparations_granular_format_requires_record_insert;

-- Two triggers on another table read `lessons`, and a rebuild pulls the table
-- out from under them. They are dropped and put back unchanged around it.
DROP TRIGGER lesson_teacher_curriculum_requires_no_linkage_insert;
DROP TRIGGER lesson_teacher_curriculum_requires_no_linkage_update;

CREATE TABLE lessons_v52 (
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
    instructional_materials TEXT NOT NULL,
    assessment TEXT NOT NULL,
    reference_notes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    latest_version_number INTEGER NOT NULL DEFAULT 0 CHECK (latest_version_number >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source_plan_text TEXT,
    previous_knowledge TEXT NOT NULL DEFAULT '[]',
    assignment TEXT NOT NULL DEFAULT '[]',
    UNIQUE (id, curriculum_course_id),
    CHECK (
        -- Not on the scheme at all.
        (scheme_week_id IS NULL AND scheme_entry_id IS NULL
         AND curriculum_course_id IS NULL AND curriculum_unit_id IS NULL
         AND curriculum_node_id IS NULL)
        OR
        -- One subtopic, which names the curriculum it plans.
        (scheme_entry_id IS NOT NULL AND scheme_week_id IS NULL
         AND curriculum_course_id IS NOT NULL
         AND ((curriculum_unit_id IS NOT NULL AND curriculum_node_id IS NULL)
              OR (curriculum_unit_id IS NULL AND curriculum_node_id IS NOT NULL)))
        OR
        -- The week, and every subtopic in it. A week spans several entries, so
        -- the curriculum it plans is theirs to name rather than one of its own.
        (scheme_week_id IS NOT NULL AND scheme_entry_id IS NULL
         AND curriculum_unit_id IS NULL AND curriculum_node_id IS NULL)
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

INSERT INTO lessons_v52
SELECT id, academic_session_id, academic_period_id, teaching_assignment_id,
       scheme_week_id, scheme_entry_id, curriculum_course_id, curriculum_unit_id,
       curriculum_node_id, input_mode, topic, subtopic, raw_plan, learning_goals,
       instructional_materials, assessment, reference_notes, status,
       latest_version_number, created_at, updated_at, source_plan_text,
       previous_knowledge, assignment
FROM lessons;

DROP TABLE lessons;
ALTER TABLE lessons_v52 RENAME TO lessons;

CREATE UNIQUE INDEX idx_lessons_scheme_entry
    ON lessons(scheme_entry_id)
    WHERE scheme_entry_id IS NOT NULL;

CREATE UNIQUE INDEX idx_lessons_scheme_week
    ON lessons(scheme_week_id)
    WHERE scheme_week_id IS NOT NULL;

CREATE TRIGGER lessons_one_plan_covering_a_subtopic
BEFORE INSERT ON lessons
WHEN NEW.scheme_entry_id IS NOT NULL
 AND EXISTS (
     SELECT 1 FROM lessons planned
     JOIN scheme_entries entry ON entry.id = NEW.scheme_entry_id
     WHERE planned.scheme_week_id = entry.scheme_week_id
 )
BEGIN
    SELECT RAISE(ABORT, 'This week already has a lesson plan covering that subtopic.');
END;

CREATE TRIGGER lessons_one_plan_covering_a_week
BEFORE INSERT ON lessons
WHEN NEW.scheme_week_id IS NOT NULL
 AND EXISTS (
     SELECT 1 FROM lessons planned
     JOIN scheme_entries entry ON entry.id = planned.scheme_entry_id
     WHERE entry.scheme_week_id = NEW.scheme_week_id
 )
BEGIN
    SELECT RAISE(ABORT, 'A subtopic of that week already has a lesson plan of its own.');
END;

CREATE TRIGGER lesson_teacher_curriculum_requires_no_linkage_insert
BEFORE INSERT ON lesson_teacher_curriculum
WHEN (SELECT curriculum_course_id FROM lessons WHERE id = NEW.lesson_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'a lesson linked to a curriculum does not need a derived one');
END;

CREATE TRIGGER lesson_teacher_curriculum_requires_no_linkage_update
BEFORE UPDATE ON lesson_teacher_curriculum
WHEN (SELECT curriculum_course_id FROM lessons WHERE id = NEW.lesson_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'a lesson linked to a curriculum does not need a derived one');
END;

DROP TRIGGER lesson_versions_immutable_update;
DROP TRIGGER lesson_versions_immutable_delete;

CREATE TABLE lesson_versions_v52 (
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
    confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lesson_id, version_number),
    UNIQUE (id, curriculum_course_id),
    CHECK (
        (scheme_week_id IS NULL AND scheme_entry_id IS NULL
         AND curriculum_course_id IS NULL AND curriculum_unit_id IS NULL
         AND curriculum_node_id IS NULL)
        OR
        (scheme_entry_id IS NOT NULL AND scheme_week_id IS NULL
         AND curriculum_course_id IS NOT NULL
         AND ((curriculum_unit_id IS NOT NULL AND curriculum_node_id IS NULL)
              OR (curriculum_unit_id IS NULL AND curriculum_node_id IS NOT NULL)))
        OR
        (scheme_week_id IS NOT NULL AND scheme_entry_id IS NULL
         AND curriculum_unit_id IS NULL AND curriculum_node_id IS NULL)
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

INSERT INTO lesson_versions_v52
SELECT id, lesson_id, version_number, academic_session_id, academic_period_id,
       teaching_assignment_id, scheme_week_id, scheme_entry_id,
       curriculum_course_id, curriculum_unit_id, curriculum_node_id, confirmed_at
FROM lesson_versions;

DROP TABLE lesson_versions;
ALTER TABLE lesson_versions_v52 RENAME TO lesson_versions;

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

DROP TRIGGER lesson_preparation_source_immutable;

CREATE TABLE lesson_preparations_v52 (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    source_raw_plan TEXT NOT NULL,
    topic TEXT NOT NULL,
    subtopic TEXT,
    learning_goals TEXT NOT NULL,
    instructional_materials TEXT NOT NULL,
    assessment TEXT NOT NULL,
    reference_notes TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_knowledge TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

INSERT INTO lesson_preparations_v52
SELECT lesson_id, source_raw_plan, topic, subtopic, learning_goals,
       instructional_materials, assessment, reference_notes, created_at,
       updated_at, previous_knowledge
FROM lesson_preparations;

DROP TABLE lesson_preparations;
ALTER TABLE lesson_preparations_v52 RENAME TO lesson_preparations;

CREATE TRIGGER lesson_preparation_source_immutable
BEFORE UPDATE OF source_raw_plan ON lesson_preparations
BEGIN
    SELECT RAISE(ABORT, 'lesson preparation source is immutable');
END;
