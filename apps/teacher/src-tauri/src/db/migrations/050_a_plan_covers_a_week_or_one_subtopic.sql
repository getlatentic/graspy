-- A lesson plan is the week's, or one subtopic's, and it says which.
--
-- A teacher prepares one lesson plan for the week. The form a head of
-- department signs leads with the week and holds one Presentation section, not
-- one per period, and the scheme's own unit is the week: about three subtopics
-- of it at a time. graspy bound a lesson to a single scheme entry, so a week of
-- three subtopics became three plans and three signatures.
--
-- The week is what a teacher is offered now. A subtopic of its own stays
-- available, because sometimes that is the lesson.
--
-- The binding becomes a scope, and a lesson is in exactly one of three states:
--
--   scheme_week_id set, scheme_entry_id null   — the week, and every subtopic in it
--   scheme_entry_id set, scheme_week_id null   — one subtopic of that week
--   both null                                  — not on the scheme at all
--
-- The week a subtopic belongs to is its entry's, so holding it beside the entry
-- was another copy of a fact already recorded. Every one of the owner's eight
-- scheme-bound lessons held both, and not one disagreed with its entry — which
-- is what makes dropping it a rename rather than a loss.
--
-- The old rule was a CHECK demanding both together. SQLite cannot drop a check,
-- so the table is rebuilt around the new one, with every other column, check,
-- key and default carried across as it stood.

-- Four triggers on other tables read `lessons`, and a rebuild pulls the table
-- out from under them. They are dropped and put back unchanged around it.
DROP TRIGGER lessons_granular_format_requires_record_insert;
DROP TRIGGER lessons_granular_format_requires_record_update;
DROP TRIGGER lesson_teacher_curriculum_requires_no_linkage_insert;
DROP TRIGGER lesson_teacher_curriculum_requires_no_linkage_update;

CREATE TABLE lessons_v50 (
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
    plan_format TEXT NOT NULL DEFAULT 'legacy_import'
        CHECK (plan_format IN ('legacy_import', 'granular')),
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

-- A lesson bound to an entry keeps that entry and lets the week go, because the
-- entry already says which week it is.
INSERT INTO lessons_v50
SELECT id, academic_session_id, academic_period_id, teaching_assignment_id,
       CASE WHEN scheme_entry_id IS NOT NULL THEN NULL ELSE scheme_week_id END,
       scheme_entry_id, curriculum_course_id, curriculum_unit_id, curriculum_node_id,
       input_mode, topic, subtopic, raw_plan, learning_goals, instructional_materials,
       assessment, reference_notes, status, latest_version_number, created_at,
       updated_at, source_plan_text, plan_format, previous_knowledge, assignment
FROM lessons;

DROP TABLE lessons;
ALTER TABLE lessons_v50 RENAME TO lessons;

CREATE UNIQUE INDEX idx_lessons_scheme_entry
    ON lessons(scheme_entry_id)
    WHERE scheme_entry_id IS NOT NULL;

-- One plan per week, beside the one plan per subtopic that already held.
CREATE UNIQUE INDEX idx_lessons_scheme_week
    ON lessons(scheme_week_id)
    WHERE scheme_week_id IS NOT NULL;

-- A subtopic is planned once: by the week's plan that spans it, or by its own.
-- Two plans covering the same ground would put two signed documents in front of
-- a head of department for one lesson.
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

-- A version records the scope its lesson had, so it carries the same rule and
-- needs the same rebuild. Its immutability triggers are put back after it, and
-- the rows move under them rather than through them.
DROP TRIGGER lesson_versions_immutable_update;
DROP TRIGGER lesson_versions_immutable_delete;
DROP TRIGGER lesson_versions_granular_format_requires_record_insert;

CREATE TABLE lesson_versions_v50 (
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
    plan_format TEXT NOT NULL DEFAULT 'legacy_import'
        CHECK (plan_format IN ('legacy_import', 'granular')),
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

INSERT INTO lesson_versions_v50
SELECT id, lesson_id, version_number, academic_session_id, academic_period_id,
       teaching_assignment_id,
       CASE WHEN scheme_entry_id IS NOT NULL THEN NULL ELSE scheme_week_id END,
       scheme_entry_id, curriculum_course_id, curriculum_unit_id, curriculum_node_id,
       confirmed_at, plan_format
FROM lesson_versions;

DROP TABLE lesson_versions;
ALTER TABLE lesson_versions_v50 RENAME TO lesson_versions;

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

CREATE TRIGGER lesson_versions_granular_format_requires_record_insert
BEFORE INSERT ON lesson_granular_versions
WHEN (SELECT plan_format FROM lesson_versions WHERE id = NEW.lesson_version_id) <> 'granular'
BEGIN
    SELECT RAISE(ABORT, 'detailed lesson version data requires the granular lesson format');
END;
