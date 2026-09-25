CREATE TABLE lesson_material_runs (
    id TEXT PRIMARY KEY NOT NULL,
    lesson_id TEXT NOT NULL,
    lesson_version_id TEXT NOT NULL UNIQUE,
    lesson_version_number INTEGER NOT NULL CHECK (lesson_version_number > 0),
    status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'failed', 'cancelled', 'complete')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE RESTRICT,
    FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id) ON DELETE RESTRICT
);

CREATE TABLE lesson_material_sources (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    source_key TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('teacher_plan', 'published_source')),
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    UNIQUE (run_id, source_key),
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE
);

CREATE TABLE lesson_material_sections (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    lesson_version_step_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    step_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'done', 'failed')),
    generated_title TEXT,
    learning_goal_numbers TEXT NOT NULL DEFAULT '[]',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    generation_token TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (run_id, sequence),
    UNIQUE (run_id, lesson_version_step_id),
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_version_step_id) REFERENCES lesson_version_steps(id) ON DELETE RESTRICT,
    CHECK (
        (status = 'generating' AND generation_token IS NOT NULL)
        OR (status <> 'generating' AND generation_token IS NULL)
    )
);

CREATE TABLE lesson_material_section_sources (
    section_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    PRIMARY KEY (section_id, source_id),
    FOREIGN KEY (section_id) REFERENCES lesson_material_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES lesson_material_sources(id) ON DELETE RESTRICT
);

CREATE TABLE lesson_material_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    section_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    kind TEXT NOT NULL CHECK (kind IN ('review', 'worked_example', 'practice', 'solution')),
    text TEXT NOT NULL,
    UNIQUE (section_id, sequence),
    UNIQUE (section_id, kind),
    FOREIGN KEY (section_id) REFERENCES lesson_material_sections(id) ON DELETE CASCADE
);
