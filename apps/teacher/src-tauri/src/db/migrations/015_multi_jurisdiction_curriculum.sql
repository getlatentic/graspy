CREATE TABLE countries (
    code TEXT PRIMARY KEY NOT NULL CHECK (length(code) = 2 AND code = upper(code)),
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jurisdictions (
    id TEXT PRIMARY KEY NOT NULL,
    country_code TEXT NOT NULL,
    parent_jurisdiction_id TEXT,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    authority_scope TEXT NOT NULL CHECK (authority_scope IN ('national', 'state', 'local')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (country_code, code),
    UNIQUE (id, country_code),
    FOREIGN KEY (country_code) REFERENCES countries(code) ON DELETE RESTRICT,
    FOREIGN KEY (parent_jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE RESTRICT
);

CREATE TABLE grade_systems (
    id TEXT PRIMARY KEY NOT NULL,
    jurisdiction_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (jurisdiction_id, code, version),
    FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE RESTRICT
);

INSERT INTO countries (code, name) VALUES
    ('NG', 'Nigeria'),
    ('US', 'United States');

INSERT INTO jurisdictions (id, country_code, code, name, authority_scope) VALUES
    ('jurisdiction-ng', 'NG', 'NG', 'Nigeria', 'national'),
    ('jurisdiction-us', 'US', 'US', 'United States', 'national');

INSERT INTO grade_systems (id, jurisdiction_id, code, name, version) VALUES
    ('grade-system-ng-basic-secondary', 'jurisdiction-ng', 'NG-BASIC-SECONDARY',
     'Nigerian basic and secondary education', '1'),
    ('grade-system-us-k12', 'jurisdiction-us', 'US-K12',
     'United States K–12', '1');

ALTER TABLE grade_levels ADD COLUMN grade_system_id TEXT
    REFERENCES grade_systems(id) ON DELETE RESTRICT;

UPDATE grade_levels
SET grade_system_id = 'grade-system-ng-basic-secondary'
WHERE grade_system_id IS NULL;

INSERT INTO grade_levels (id, code, display_name, sort_order, grade_system_id) VALUES
    ('grade-us-k', 'US-K', 'Kindergarten', 1000, 'grade-system-us-k12'),
    ('grade-us-1', 'US-1', 'Grade 1', 1010, 'grade-system-us-k12'),
    ('grade-us-2', 'US-2', 'Grade 2', 1020, 'grade-system-us-k12'),
    ('grade-us-3', 'US-3', 'Grade 3', 1030, 'grade-system-us-k12'),
    ('grade-us-4', 'US-4', 'Grade 4', 1040, 'grade-system-us-k12'),
    ('grade-us-5', 'US-5', 'Grade 5', 1050, 'grade-system-us-k12'),
    ('grade-us-6', 'US-6', 'Grade 6', 1060, 'grade-system-us-k12'),
    ('grade-us-7', 'US-7', 'Grade 7', 1070, 'grade-system-us-k12'),
    ('grade-us-8', 'US-8', 'Grade 8', 1080, 'grade-system-us-k12'),
    ('grade-us-9', 'US-9', 'Grade 9', 1090, 'grade-system-us-k12'),
    ('grade-us-10', 'US-10', 'Grade 10', 1100, 'grade-system-us-k12'),
    ('grade-us-11', 'US-11', 'Grade 11', 1110, 'grade-system-us-k12'),
    ('grade-us-12', 'US-12', 'Grade 12', 1120, 'grade-system-us-k12');

CREATE TRIGGER grade_levels_require_grade_system_insert
BEFORE INSERT ON grade_levels
WHEN NEW.grade_system_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'grade levels require a grade system');
END;

CREATE TRIGGER grade_levels_require_grade_system_update
BEFORE UPDATE OF grade_system_id ON grade_levels
WHEN NEW.grade_system_id IS NULL
BEGIN
    SELECT RAISE(ABORT, 'grade levels require a grade system');
END;

CREATE TABLE school_profiles (
    singleton_id INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (singleton_id = 1),
    jurisdiction_id TEXT NOT NULL,
    grade_system_id TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (jurisdiction_id) REFERENCES jurisdictions(id) ON DELETE RESTRICT,
    FOREIGN KEY (grade_system_id) REFERENCES grade_systems(id) ON DELETE RESTRICT
);

INSERT INTO school_profiles (singleton_id, jurisdiction_id, grade_system_id)
VALUES (1, 'jurisdiction-ng', 'grade-system-ng-basic-secondary');

ALTER TABLE academic_sessions ADD COLUMN calendar_kind TEXT NOT NULL DEFAULT 'terms'
    CHECK (calendar_kind IN ('terms', 'semesters', 'quarters', 'custom'));

CREATE TABLE academic_periods_v15 (
    id TEXT PRIMARY KEY NOT NULL,
    academic_session_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 12),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    normalized_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('term', 'semester', 'quarter', 'custom')),
    legacy_term_number INTEGER CHECK (legacy_term_number BETWEEN 1 AND 3),
    UNIQUE (academic_session_id, ordinal),
    UNIQUE (academic_session_id, normalized_name),
    UNIQUE (id, academic_session_id),
    FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT
);

INSERT INTO academic_periods_v15 (
    id,
    academic_session_id,
    ordinal,
    name,
    normalized_name,
    kind,
    legacy_term_number
)
SELECT
    id,
    academic_session_id,
    term_number,
    CASE term_number
        WHEN 1 THEN 'First term'
        WHEN 2 THEN 'Second term'
        ELSE 'Third term'
    END,
    CASE term_number
        WHEN 1 THEN 'first term'
        WHEN 2 THEN 'second term'
        ELSE 'third term'
    END,
    'term',
    term_number
FROM academic_periods;

DROP TABLE academic_periods;
ALTER TABLE academic_periods_v15 RENAME TO academic_periods;

DROP TRIGGER scheme_templates_content_immutable_update;
DROP TRIGGER scheme_templates_immutable_delete;

CREATE TABLE scheme_templates_v15 (
    id TEXT PRIMARY KEY NOT NULL,
    package_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level_id TEXT NOT NULL,
    period_ordinal INTEGER NOT NULL CHECK (period_ordinal BETWEEN 1 AND 12),
    period_kind TEXT NOT NULL CHECK (period_kind IN ('term', 'semester', 'quarter', 'custom')),
    period_name TEXT NOT NULL CHECK (length(trim(period_name)) BETWEEN 1 AND 80),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    UNIQUE (package_id, subject_id, grade_level_id, period_ordinal),
    FOREIGN KEY (package_id) REFERENCES scheme_template_packages(id) ON DELETE RESTRICT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id) ON DELETE RESTRICT
);

INSERT INTO scheme_templates_v15 (
    id,
    package_id,
    subject_id,
    grade_level_id,
    period_ordinal,
    period_kind,
    period_name,
    title,
    status
)
SELECT
    id,
    package_id,
    subject_id,
    grade_level_id,
    term_number,
    'term',
    CASE term_number
        WHEN 1 THEN 'First term'
        WHEN 2 THEN 'Second term'
        ELSE 'Third term'
    END,
    title,
    status
FROM scheme_templates;

DROP TABLE scheme_templates;
ALTER TABLE scheme_templates_v15 RENAME TO scheme_templates;

CREATE TRIGGER scheme_templates_content_immutable_update
BEFORE UPDATE OF package_id, subject_id, grade_level_id,
                 period_ordinal, period_kind, period_name, title ON scheme_templates
BEGIN
    SELECT RAISE(ABORT, 'installed scheme templates are immutable');
END;

CREATE TRIGGER scheme_templates_immutable_delete
BEFORE DELETE ON scheme_templates
BEGIN
    SELECT RAISE(ABORT, 'installed scheme templates are immutable');
END;

ALTER TABLE curriculum_frameworks ADD COLUMN jurisdiction_id TEXT
    REFERENCES jurisdictions(id) ON DELETE RESTRICT;
ALTER TABLE curriculum_frameworks ADD COLUMN effective_from TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN effective_to TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN source_sha256 TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN licence_id TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN licence_name TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN licence_url TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN attribution TEXT;
ALTER TABLE curriculum_frameworks ADD COLUMN trust TEXT NOT NULL DEFAULT 'school'
    CHECK (trust IN ('verified', 'school'));

CREATE TABLE curriculum_nodes (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    parent_node_id TEXT,
    kind TEXT NOT NULL CHECK (length(trim(kind)) BETWEEN 1 AND 40),
    source_code TEXT,
    title TEXT NOT NULL,
    statement TEXT,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    source_payload TEXT NOT NULL DEFAULT '{}',
    UNIQUE (curriculum_course_id, parent_node_id, sequence),
    UNIQUE (curriculum_course_id, source_code),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (curriculum_course_id) REFERENCES curriculum_courses(id) ON DELETE RESTRICT,
    FOREIGN KEY (parent_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE atomic_learning_objectives (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    curriculum_node_id TEXT NOT NULL,
    source_code TEXT,
    statement TEXT NOT NULL,
    bloom_verb TEXT,
    bloom_level TEXT CHECK (bloom_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    UNIQUE (curriculum_node_id, sequence),
    UNIQUE (curriculum_course_id, source_code),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (curriculum_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_components (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    atomic_objective_id TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('concept', 'procedure', 'representation')),
    UNIQUE (curriculum_course_id, code),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (atomic_objective_id, curriculum_course_id)
        REFERENCES atomic_learning_objectives(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE knowledge_component_prerequisites (
    knowledge_component_id TEXT NOT NULL,
    prerequisite_knowledge_component_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (knowledge_component_id, prerequisite_knowledge_component_id),
    CHECK (knowledge_component_id <> prerequisite_knowledge_component_id),
    FOREIGN KEY (knowledge_component_id, curriculum_course_id)
        REFERENCES knowledge_components(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (prerequisite_knowledge_component_id, curriculum_course_id)
        REFERENCES knowledge_components(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE curriculum_node_alignments (
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    alignment_kind TEXT NOT NULL CHECK (alignment_kind IN ('exact', 'broader', 'narrower', 'related')),
    author TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source_node_id, target_node_id),
    CHECK (source_node_id <> target_node_id),
    FOREIGN KEY (source_node_id) REFERENCES curriculum_nodes(id) ON DELETE RESTRICT,
    FOREIGN KEY (target_node_id) REFERENCES curriculum_nodes(id) ON DELETE RESTRICT
);

ALTER TABLE teaching_assignments ADD COLUMN curriculum_course_id TEXT
    REFERENCES curriculum_courses(id) ON DELETE RESTRICT;

UPDATE teaching_assignments
SET curriculum_course_id = (
    SELECT MIN(schemes_of_work.curriculum_course_id)
    FROM schemes_of_work
    WHERE schemes_of_work.teaching_assignment_id = teaching_assignments.id
    HAVING COUNT(DISTINCT schemes_of_work.curriculum_course_id) = 1
);

CREATE TRIGGER teaching_assignment_curriculum_matches_insert
BEFORE INSERT ON teaching_assignments
WHEN NEW.curriculum_course_id IS NOT NULL
 AND NOT EXISTS (
     SELECT 1 FROM curriculum_courses
     WHERE id = NEW.curriculum_course_id
       AND subject_id = NEW.subject_id
       AND grade_level_id = NEW.grade_level_id
 )
BEGIN
    SELECT RAISE(ABORT, 'teaching assignment curriculum must match its subject and grade');
END;

CREATE TRIGGER teaching_assignment_curriculum_matches_update
BEFORE UPDATE OF curriculum_course_id, subject_id, grade_level_id ON teaching_assignments
WHEN NEW.curriculum_course_id IS NOT NULL
 AND NOT EXISTS (
     SELECT 1 FROM curriculum_courses
     WHERE id = NEW.curriculum_course_id
       AND subject_id = NEW.subject_id
       AND grade_level_id = NEW.grade_level_id
 )
BEGIN
    SELECT RAISE(ABORT, 'teaching assignment curriculum must match its subject and grade');
END;
