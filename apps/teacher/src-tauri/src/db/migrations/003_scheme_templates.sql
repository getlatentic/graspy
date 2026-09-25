CREATE TABLE scheme_template_packages (
    id TEXT PRIMARY KEY NOT NULL,
    package_key TEXT NOT NULL,
    title TEXT NOT NULL,
    publisher TEXT NOT NULL,
    normalized_publisher TEXT NOT NULL,
    jurisdiction TEXT NOT NULL,
    edition TEXT NOT NULL,
    source_uri TEXT,
    payload_sha256 TEXT NOT NULL UNIQUE CHECK (length(payload_sha256) = 64),
    trust TEXT NOT NULL CHECK (trust IN ('verified', 'school')),
    signer_key_id TEXT,
    payload TEXT NOT NULL,
    installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (package_key, edition),
    CHECK (
        (trust = 'verified' AND signer_key_id IS NOT NULL)
        OR (trust = 'school' AND signer_key_id IS NULL)
    )
);

CREATE TABLE scheme_templates (
    id TEXT PRIMARY KEY NOT NULL,
    package_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level_id TEXT NOT NULL,
    term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 3),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    UNIQUE (package_id, subject_id, grade_level_id, term_number),
    FOREIGN KEY (package_id) REFERENCES scheme_template_packages(id) ON DELETE RESTRICT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (grade_level_id) REFERENCES grade_levels(id) ON DELETE RESTRICT
);

CREATE TABLE scheme_template_weeks (
    id TEXT PRIMARY KEY NOT NULL,
    template_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL CHECK (ordinal > 0),
    kind TEXT NOT NULL CHECK (kind IN ('teaching', 'break', 'examination')),
    title TEXT,
    UNIQUE (template_id, ordinal),
    UNIQUE (id, template_id),
    FOREIGN KEY (template_id) REFERENCES scheme_templates(id) ON DELETE RESTRICT
);

CREATE TABLE scheme_template_entries (
    id TEXT PRIMARY KEY NOT NULL,
    template_week_id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    topic TEXT NOT NULL,
    subtopic TEXT,
    curriculum_unit TEXT NOT NULL,
    learning_outcomes TEXT NOT NULL,
    objectives TEXT NOT NULL,
    assessment TEXT NOT NULL,
    materials TEXT NOT NULL,
    notes TEXT,
    UNIQUE (template_week_id, sequence),
    FOREIGN KEY (template_week_id, template_id)
        REFERENCES scheme_template_weeks(id, template_id) ON DELETE RESTRICT,
    FOREIGN KEY (template_id) REFERENCES scheme_templates(id) ON DELETE RESTRICT
);

ALTER TABLE schemes_of_work ADD COLUMN scheme_template_id TEXT
    REFERENCES scheme_templates(id) ON DELETE RESTRICT;

CREATE TRIGGER scheme_template_packages_immutable_update
BEFORE UPDATE ON scheme_template_packages
BEGIN
    SELECT RAISE(ABORT, 'installed scheme packages are immutable');
END;

CREATE TRIGGER scheme_template_packages_immutable_delete
BEFORE DELETE ON scheme_template_packages
BEGIN
    SELECT RAISE(ABORT, 'installed scheme packages are immutable');
END;

CREATE TRIGGER scheme_templates_content_immutable_update
BEFORE UPDATE OF package_id, subject_id, grade_level_id, term_number, title ON scheme_templates
BEGIN
    SELECT RAISE(ABORT, 'installed scheme templates are immutable');
END;

CREATE TRIGGER scheme_templates_immutable_delete
BEFORE DELETE ON scheme_templates
BEGIN
    SELECT RAISE(ABORT, 'installed scheme templates are immutable');
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

CREATE TRIGGER scheme_template_entries_immutable_update
BEFORE UPDATE ON scheme_template_entries
BEGIN
    SELECT RAISE(ABORT, 'installed scheme template entries are immutable');
END;

CREATE TRIGGER scheme_template_entries_immutable_delete
BEFORE DELETE ON scheme_template_entries
BEGIN
    SELECT RAISE(ABORT, 'installed scheme template entries are immutable');
END;

CREATE TRIGGER scheme_template_week_kind_matches_entries
BEFORE INSERT ON scheme_template_entries
WHEN (SELECT kind FROM scheme_template_weeks WHERE id = NEW.template_week_id) <> 'teaching'
BEGIN
    SELECT RAISE(ABORT, 'template entries require a teaching week');
END;
