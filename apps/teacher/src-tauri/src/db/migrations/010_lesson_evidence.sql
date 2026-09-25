CREATE TABLE lesson_evidence_sets (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    lesson_version_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE RESTRICT,
    FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id) ON DELETE RESTRICT,
    CHECK ((status = 'complete' AND completed_at IS NOT NULL) OR status = 'draft')
);

CREATE TABLE lesson_evidence_groups (
    id TEXT PRIMARY KEY NOT NULL,
    evidence_set_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    name_key TEXT NOT NULL,
    UNIQUE (id, evidence_set_id),
    UNIQUE (evidence_set_id, position),
    UNIQUE (evidence_set_id, name_key),
    FOREIGN KEY (evidence_set_id) REFERENCES lesson_evidence_sets(id) ON DELETE CASCADE
);

CREATE TABLE lesson_evidence_entries (
    id TEXT PRIMARY KEY NOT NULL,
    evidence_set_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    learning_goal_number INTEGER NOT NULL CHECK (learning_goal_number > 0),
    questions_correct INTEGER,
    questions_total INTEGER,
    misunderstanding_note TEXT CHECK (misunderstanding_note IS NULL OR length(misunderstanding_note) <= 500),
    confidence_score INTEGER CHECK (confidence_score BETWEEN 1 AND 5),
    difficulty_score INTEGER CHECK (difficulty_score BETWEEN 1 AND 5),
    UNIQUE (evidence_set_id, group_id, learning_goal_number),
    FOREIGN KEY (evidence_set_id) REFERENCES lesson_evidence_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id, evidence_set_id)
        REFERENCES lesson_evidence_groups(id, evidence_set_id) ON DELETE CASCADE,
    CHECK (
        (questions_correct IS NULL AND questions_total IS NULL)
        OR
        (questions_correct IS NOT NULL AND questions_total IS NOT NULL
         AND questions_total BETWEEN 1 AND 1000
         AND questions_correct BETWEEN 0 AND questions_total)
    )
);

CREATE INDEX lesson_evidence_entries_goal_index
    ON lesson_evidence_entries(evidence_set_id, learning_goal_number, group_id);
