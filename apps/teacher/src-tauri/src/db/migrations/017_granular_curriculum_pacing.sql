DROP TRIGGER IF EXISTS installed_knowledge_components_immutable_update;
DROP TRIGGER IF EXISTS installed_knowledge_components_immutable_delete;
DROP TRIGGER IF EXISTS installed_knowledge_prerequisites_immutable_update;
DROP TRIGGER IF EXISTS installed_knowledge_prerequisites_immutable_delete;

CREATE TABLE knowledge_components_v17 (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    curriculum_node_id TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    bloom_level TEXT CHECK (bloom_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
    knowledge_type TEXT CHECK (knowledge_type IN ('concept', 'procedure', 'representation')),
    UNIQUE (curriculum_course_id, code),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (curriculum_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT
);

INSERT INTO knowledge_components_v17 (
    id, curriculum_course_id, curriculum_node_id, code, description,
    bloom_level, knowledge_type
)
SELECT
    knowledge_components.id,
    knowledge_components.curriculum_course_id,
    atomic_learning_objectives.curriculum_node_id,
    knowledge_components.code,
    knowledge_components.description,
    atomic_learning_objectives.bloom_level,
    knowledge_components.knowledge_type
FROM knowledge_components
JOIN atomic_learning_objectives
  ON atomic_learning_objectives.id = knowledge_components.atomic_objective_id
 AND atomic_learning_objectives.curriculum_course_id = knowledge_components.curriculum_course_id;

CREATE TABLE knowledge_component_objectives (
    knowledge_component_id TEXT NOT NULL,
    atomic_objective_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (knowledge_component_id, atomic_objective_id),
    FOREIGN KEY (knowledge_component_id, curriculum_course_id)
        REFERENCES knowledge_components_v17(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (atomic_objective_id, curriculum_course_id)
        REFERENCES atomic_learning_objectives(id, curriculum_course_id) ON DELETE RESTRICT
);

INSERT INTO knowledge_component_objectives (
    knowledge_component_id, atomic_objective_id, curriculum_course_id
)
SELECT id, atomic_objective_id, curriculum_course_id
FROM knowledge_components;

CREATE TABLE knowledge_component_prerequisites_v17 (
    knowledge_component_id TEXT NOT NULL,
    prerequisite_knowledge_component_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (knowledge_component_id, prerequisite_knowledge_component_id),
    CHECK (knowledge_component_id <> prerequisite_knowledge_component_id),
    FOREIGN KEY (knowledge_component_id, curriculum_course_id)
        REFERENCES knowledge_components_v17(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (prerequisite_knowledge_component_id, curriculum_course_id)
        REFERENCES knowledge_components_v17(id, curriculum_course_id) ON DELETE RESTRICT
);

INSERT INTO knowledge_component_prerequisites_v17
SELECT * FROM knowledge_component_prerequisites;

DROP TABLE knowledge_component_prerequisites;
DROP TABLE knowledge_components;
ALTER TABLE knowledge_components_v17 RENAME TO knowledge_components;
ALTER TABLE knowledge_component_prerequisites_v17 RENAME TO knowledge_component_prerequisites;

CREATE TABLE curriculum_source_links (
    id TEXT PRIMARY KEY NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    curriculum_node_id TEXT,
    atomic_objective_id TEXT,
    record_id TEXT NOT NULL CHECK (length(trim(record_id)) BETWEEN 1 AND 160),
    role TEXT NOT NULL CHECK (role IN ('foundation', 'instruction', 'worked_example', 'exercise')),
    method TEXT NOT NULL CHECK (length(trim(method)) BETWEEN 1 AND 80),
    rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 2000),
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    CHECK ((curriculum_node_id IS NOT NULL) <> (atomic_objective_id IS NOT NULL)),
    UNIQUE (curriculum_node_id, record_id),
    UNIQUE (atomic_objective_id, record_id),
    FOREIGN KEY (curriculum_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (atomic_objective_id, curriculum_course_id)
        REFERENCES atomic_learning_objectives(id, curriculum_course_id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS scheme_entries_teaching_week_insert;
DROP TRIGGER IF EXISTS scheme_entries_teaching_week_update;
DROP TRIGGER IF EXISTS scheme_week_kind_preserves_entries;

CREATE TABLE scheme_weeks_v17 (
    id TEXT PRIMARY KEY NOT NULL,
    scheme_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    starts_on TEXT NOT NULL CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    ends_on TEXT NOT NULL CHECK (ends_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ends_on >= starts_on),
    kind TEXT NOT NULL DEFAULT 'teaching' CHECK (kind IN ('teaching', 'revision', 'test', 'break', 'examination')),
    title TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scheme_id, ordinal),
    UNIQUE (scheme_id, starts_on),
    UNIQUE (id, scheme_id),
    FOREIGN KEY (scheme_id) REFERENCES schemes_of_work(id) ON DELETE RESTRICT
);

INSERT INTO scheme_weeks_v17 SELECT * FROM scheme_weeks;
DROP TABLE scheme_weeks;
ALTER TABLE scheme_weeks_v17 RENAME TO scheme_weeks;

CREATE TABLE scheme_entries_v17 (
    id TEXT PRIMARY KEY NOT NULL,
    scheme_week_id TEXT NOT NULL,
    scheme_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    curriculum_unit_id TEXT,
    curriculum_node_id TEXT,
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
    CHECK ((curriculum_unit_id IS NOT NULL) <> (curriculum_node_id IS NOT NULL)),
    UNIQUE (scheme_week_id, sequence),
    UNIQUE (id, curriculum_course_id),
    FOREIGN KEY (scheme_week_id, scheme_id)
        REFERENCES scheme_weeks(id, scheme_id) ON DELETE RESTRICT,
    FOREIGN KEY (scheme_id, curriculum_course_id)
        REFERENCES schemes_of_work(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_unit_id, curriculum_course_id)
        REFERENCES curriculum_units(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (curriculum_node_id, curriculum_course_id)
        REFERENCES curriculum_nodes(id, curriculum_course_id) ON DELETE RESTRICT
);

INSERT INTO scheme_entries_v17 (
    id, scheme_week_id, scheme_id, curriculum_course_id, curriculum_unit_id,
    curriculum_node_id, sequence, topic, subtopic, objectives, assessment,
    materials, notes, status, created_at, updated_at
)
SELECT
    id, scheme_week_id, scheme_id, curriculum_course_id, curriculum_unit_id,
    NULL, sequence, topic, subtopic, objectives, assessment, materials, notes,
    status, created_at, updated_at
FROM scheme_entries;

DROP TABLE scheme_entries;
ALTER TABLE scheme_entries_v17 RENAME TO scheme_entries;

CREATE TABLE scheme_entry_atomic_objectives (
    scheme_entry_id TEXT NOT NULL,
    atomic_objective_id TEXT NOT NULL,
    curriculum_course_id TEXT NOT NULL,
    PRIMARY KEY (scheme_entry_id, atomic_objective_id),
    FOREIGN KEY (scheme_entry_id, curriculum_course_id)
        REFERENCES scheme_entries(id, curriculum_course_id) ON DELETE RESTRICT,
    FOREIGN KEY (atomic_objective_id, curriculum_course_id)
        REFERENCES atomic_learning_objectives(id, curriculum_course_id) ON DELETE RESTRICT
);

CREATE TABLE scheme_entry_source_records (
    scheme_entry_id TEXT NOT NULL,
    record_id TEXT NOT NULL CHECK (length(trim(record_id)) BETWEEN 1 AND 160),
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    PRIMARY KEY (scheme_entry_id, record_id),
    UNIQUE (scheme_entry_id, sequence),
    FOREIGN KEY (scheme_entry_id) REFERENCES scheme_entries(id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS scheme_template_weeks_immutable_update;
DROP TRIGGER IF EXISTS scheme_template_weeks_immutable_delete;
DROP TRIGGER IF EXISTS scheme_template_week_kind_matches_entries;

CREATE TABLE scheme_template_weeks_v17 (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    kind TEXT NOT NULL CHECK (kind IN ('teaching', 'revision', 'test', 'break', 'examination')),
    title TEXT,
    UNIQUE (template_id, ordinal),
    UNIQUE (id, template_id),
    FOREIGN KEY (template_id) REFERENCES scheme_templates(id) ON DELETE RESTRICT
);

INSERT INTO scheme_template_weeks_v17 SELECT * FROM scheme_template_weeks;
DROP TABLE scheme_template_weeks;
ALTER TABLE scheme_template_weeks_v17 RENAME TO scheme_template_weeks;

ALTER TABLE scheme_template_packages ADD COLUMN source_sha256 TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN dataset_sha256 TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN licence_id TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN licence_name TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN licence_url TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN attribution TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN modification_notice TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN curriculum_package_key TEXT;
ALTER TABLE scheme_template_packages ADD COLUMN curriculum_course_key TEXT;

ALTER TABLE scheme_template_entries ADD COLUMN curriculum_node_code TEXT;
ALTER TABLE scheme_template_entries ADD COLUMN objective_codes TEXT;
ALTER TABLE scheme_template_entries ADD COLUMN source_record_ids TEXT;

ALTER TABLE curriculum_packages ADD COLUMN dataset_sha256 TEXT;
ALTER TABLE curriculum_courses ADD COLUMN course_key TEXT;

CREATE TRIGGER installed_knowledge_components_immutable_update
BEFORE UPDATE ON knowledge_components
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge components are immutable');
END;

CREATE TRIGGER installed_knowledge_components_immutable_delete
BEFORE DELETE ON knowledge_components
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge components are immutable');
END;

CREATE TRIGGER installed_knowledge_objectives_immutable_update
BEFORE UPDATE ON knowledge_component_objectives
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge alignments are immutable');
END;

CREATE TRIGGER installed_knowledge_objectives_immutable_delete
BEFORE DELETE ON knowledge_component_objectives
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge alignments are immutable');
END;

CREATE TRIGGER installed_knowledge_prerequisites_immutable_update
BEFORE UPDATE ON knowledge_component_prerequisites
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge prerequisites are immutable');
END;

CREATE TRIGGER installed_knowledge_prerequisites_immutable_delete
BEFORE DELETE ON knowledge_component_prerequisites
BEGIN
    SELECT RAISE(ABORT, 'installed knowledge prerequisites are immutable');
END;

CREATE TRIGGER installed_curriculum_source_links_immutable_update
BEFORE UPDATE ON curriculum_source_links
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum source links are immutable');
END;

CREATE TRIGGER installed_curriculum_source_links_immutable_delete
BEFORE DELETE ON curriculum_source_links
BEGIN
    SELECT RAISE(ABORT, 'installed curriculum source links are immutable');
END;

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

CREATE TRIGGER scheme_template_weeks_immutable_update
BEFORE UPDATE ON scheme_template_weeks
BEGIN
    SELECT RAISE(ABORT, 'installed scheme template weeks are immutable');
END;

CREATE TRIGGER scheme_template_weeks_immutable_delete
BEFORE DELETE ON scheme_template_weeks
BEGIN
    SELECT RAISE(ABORT, 'installed scheme template weeks are immutable');
END;

CREATE TRIGGER scheme_template_week_kind_matches_entries
BEFORE INSERT ON scheme_template_entries
WHEN (SELECT kind FROM scheme_template_weeks WHERE id = NEW.template_week_id) <> 'teaching'
BEGIN
    SELECT RAISE(ABORT, 'template entries require a teaching week');
END;
