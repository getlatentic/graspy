CREATE UNIQUE INDEX teaching_assignments_curriculum_context
ON teaching_assignments (id, academic_session_id, subject_id, grade_level_id);

CREATE TABLE curriculum_frameworks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    authority TEXT NOT NULL,
    normalized_authority TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    version TEXT NOT NULL,
    source_uri TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (normalized_name, normalized_authority, version)
);

CREATE TABLE curriculum_courses (
    id TEXT PRIMARY KEY NOT NULL,
    framework_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (framework_id, subject_id, grade_level_id),
    UNIQUE (id, subject_id, grade_level_id),
    FOREIGN KEY (framework_id) REFERENCES curriculum_frameworks(id) ON DELETE RESTRICT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id) ON DELETE RESTRICT
);

CREATE TABLE curriculum_units (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    code TEXT,
    title TEXT NOT NULL,
    normalized_title TEXT NOT NULL,
    description TEXT,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    UNIQUE (curriculum_course_id, normalized_title),
    UNIQUE (curriculum_course_id, sequence),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (curriculum_course_id) REFERENCES curriculum_courses(id) ON DELETE RESTRICT
);

CREATE TABLE curriculum_outcomes (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    curriculum_unit_id TEXT NOT NULL,
    code TEXT,
    statement TEXT NOT NULL,
    normalized_statement TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    UNIQUE (curriculum_unit_id, normalized_statement),
    UNIQUE (curriculum_unit_id, sequence),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (curriculum_unit_id, curriculum_course_id)
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE term_calendars (
    id TEXT PRIMARY KEY NOT NULL,
    academic_period_id TEXT NOT NULL UNIQUE,
    starts_on TEXT NOT NULL CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    ends_on TEXT NOT NULL CHECK (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ends_on >= starts_on),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (academic_period_id) REFERENCES academic_periods(id) ON DELETE RESTRICT
);

CREATE TABLE schemes_of_work (
    id TEXT PRIMARY KEY NOT NULL,
    academic_session_id TEXT NOT NULL,
    academic_period_id TEXT NOT NULL,
    teaching_assignment_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (academic_period_id, teaching_assignment_id),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (academic_period_id, academic_session_id)
        REFERENCES academic_periods(id, academic_session_id) ON DELETE RESTRICT,
    FOREIGN KEY (teaching_assignment_id, academic_session_id, subject_id, grade_level_id)
        REFERENCES teaching_assignments(id, academic_session_id, subject_id, grade_level_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_course_id, subject_id, grade_level_id)
        REFERENCES curriculum_courses(id, subject_id, grade_level_id) ON DELETE RESTRICT
);

CREATE TABLE scheme_weeks (
    id TEXT PRIMARY KEY NOT NULL,
    scheme_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    starts_on TEXT NOT NULL CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    ends_on TEXT NOT NULL CHECK (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ends_on >= starts_on),
    kind TEXT NOT NULL DEFAULT 'teaching' CHECK (kind IN ('teaching', 'break', 'examination')),
    title TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scheme_id, ordinal),
    UNIQUE (scheme_id, starts_on),
    UNIQUE (id, scheme_id),
    FOREIGN KEY (scheme_id) REFERENCES schemes_of_work(id) ON DELETE RESTRICT
);

CREATE TABLE scheme_entries (
    id TEXT PRIMARY KEY NOT NULL,
    scheme_week_id TEXT NOT NULL,
    scheme_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    curriculum_unit_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    topic TEXT NOT NULL,
    subtopic TEXT,
    objectives TEXT NOT NULL,
    assessment TEXT NOT NULL,
    materials TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scheme_week_id, sequence),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (scheme_week_id, scheme_id)
        REFERENCES scheme_weeks(id, scheme_id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_id, curriculum_course_id)
        REFERENCES schemes_of_work(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_unit_id, curriculum_course_id)
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE scheme_entry_outcomes (
    scheme_entry_id TEXT NOT NULL,
    curriculum_outcome_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (scheme_entry_id, curriculum_outcome_id),
    FOREIGN KEY (scheme_entry_id, curriculum_course_id)
        REFERENCES scheme_entries(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_outcome_id, curriculum_course_id)
        REFERENCES curriculum_outcomes(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TRIGGER scheme_entries_teaching_week_insert
BEFORE INSERT ON scheme_entries
WHEN (SELECT kind FROM scheme_weeks WHERE id = NEW.scheme_week_id) <> 'teaching'
BEGIN
    SELECT RAISE(ABORT, 'scheme entries require a teaching week');
END;

CREATE TRIGGER scheme_entries_teaching_week_update
BEFORE UPDATE OF scheme_week_id ON scheme_entries
WHEN (SELECT kind FROM scheme_weeks WHERE id = NEW.scheme_week_id) <> 'teaching'
BEGIN
    SELECT RAISE(ABORT, 'scheme entries require a teaching week');
END;

CREATE TRIGGER scheme_week_kind_preserves_entries
BEFORE UPDATE OF kind ON scheme_weeks
WHEN NEW.kind <> 'teaching'
 AND EXISTS (SELECT 1 FROM scheme_entries WHERE scheme_week_id = OLD.id AND status = 'active')
BEGIN
    SELECT RAISE(ABORT, 'archive teaching entries before changing the week kind');
END;
