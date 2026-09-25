ALTER TABLE lesson_evidence_groups
ADD COLUMN interest_score INTEGER CHECK (interest_score BETWEEN 1 AND 5);

ALTER TABLE lesson_evidence_groups
ADD COLUMN lesson_feeling_score INTEGER CHECK (lesson_feeling_score BETWEEN 1 AND 5);

CREATE TABLE differentiated_material_runs (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    lesson_version_id TEXT NOT NULL,
    base_run_id TEXT NOT NULL,
    evidence_set_id TEXT NOT NULL,
    evidence_revision INTEGER NOT NULL CHECK (evidence_revision > 0),
    status TEXT NOT NULL DEFAULT 'paused'
        CHECK (status IN ('paused', 'running', 'failed', 'cancelled', 'complete')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (base_run_id, evidence_set_id, evidence_revision),
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE RESTRICT,
    FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id) ON DELETE RESTRICT,
    FOREIGN KEY (base_run_id) REFERENCES lesson_material_runs(id) ON DELETE RESTRICT,
    FOREIGN KEY (evidence_set_id) REFERENCES lesson_evidence_sets(id) ON DELETE RESTRICT
);

CREATE TABLE differentiated_material_groups (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    evidence_group_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    learner_state_snapshot TEXT NOT NULL CHECK (json_valid(learner_state_snapshot)),
    session_signals_snapshot TEXT NOT NULL CHECK (json_valid(session_signals_snapshot)),
    UNIQUE (id, run_id),
    UNIQUE (run_id, position),
    UNIQUE (run_id, evidence_group_id),
    FOREIGN KEY (run_id) REFERENCES differentiated_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (evidence_group_id) REFERENCES lesson_evidence_groups(id) ON DELETE RESTRICT
);

CREATE TABLE differentiated_material_sections (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    base_section_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    step_title TEXT NOT NULL,
    base_section_snapshot TEXT NOT NULL CHECK (json_valid(base_section_snapshot)),
    source_materials_snapshot TEXT NOT NULL CHECK (json_valid(source_materials_snapshot)),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'done', 'failed')),
    generation_token TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error TEXT,
    generated_title TEXT,
    learning_goal_numbers TEXT CHECK (learning_goal_numbers IS NULL OR json_valid(learning_goal_numbers)),
    quality_report TEXT CHECK (quality_report IS NULL OR json_valid(quality_report)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, run_id),
    UNIQUE (run_id, group_id, base_section_id),
    UNIQUE (run_id, group_id, sequence),
    FOREIGN KEY (run_id) REFERENCES differentiated_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id, run_id)
        REFERENCES differentiated_material_groups(id, run_id) ON DELETE CASCADE,
    FOREIGN KEY (base_section_id) REFERENCES lesson_material_sections(id) ON DELETE RESTRICT,
    CHECK (
        (status = 'generating' AND generation_token IS NOT NULL)
        OR (status != 'generating' AND generation_token IS NULL)
    ),
    CHECK (
        (status = 'done' AND generated_title IS NOT NULL
            AND learning_goal_numbers IS NOT NULL AND quality_report IS NOT NULL)
        OR status != 'done'
    )
);

CREATE TABLE differentiated_material_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    section_id TEXT NOT NULL,
    base_block_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    kind TEXT NOT NULL CHECK (kind IN ('review', 'worked_example', 'practice', 'solution')),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0),
    learning_goal_numbers TEXT NOT NULL CHECK (json_valid(learning_goal_numbers)),
    source_material_keys TEXT NOT NULL CHECK (json_valid(source_material_keys)),
    UNIQUE (section_id, sequence),
    UNIQUE (section_id, kind),
    FOREIGN KEY (section_id) REFERENCES differentiated_material_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (base_block_id) REFERENCES lesson_material_blocks(id) ON DELETE RESTRICT
);

CREATE INDEX differentiated_material_sections_next_index
    ON differentiated_material_sections(run_id, status, group_id, sequence);

