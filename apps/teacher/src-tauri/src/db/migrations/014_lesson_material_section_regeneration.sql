ALTER TABLE lesson_material_document_versions
ADD COLUMN change_kind TEXT NOT NULL DEFAULT 'teacher_edit'
CHECK (change_kind IN ('initial', 'teacher_edit', 'section_regeneration', 'section_restore'));

DROP TRIGGER lesson_material_document_blocks_immutable_update;
DROP TRIGGER lesson_material_document_blocks_immutable_delete;
DROP TRIGGER lesson_material_approved_versions_immutable_update;
DROP TRIGGER lesson_material_approved_versions_immutable_delete;

ALTER TABLE lesson_material_document_versions
ADD COLUMN changed_section_id TEXT;

ALTER TABLE lesson_material_document_versions
ADD COLUMN teacher_direction TEXT
CHECK (teacher_direction IS NULL OR (length(trim(teacher_direction)) > 0 AND length(teacher_direction) <= 1000));

ALTER TABLE lesson_material_document_versions
ADD COLUMN restored_from_version_number INTEGER
CHECK (restored_from_version_number IS NULL OR restored_from_version_number > 0);

UPDATE lesson_material_document_versions
SET change_kind = CASE WHEN version_number = 1 THEN 'initial' ELSE 'teacher_edit' END;

UPDATE lesson_material_document_versions AS versions
SET changed_section_id = (
    SELECT current_blocks.section_id
    FROM lesson_material_document_blocks current_blocks
    JOIN lesson_material_document_versions previous_versions
      ON previous_versions.id = versions.previous_version_id
    JOIN lesson_material_document_blocks previous_blocks
      ON previous_blocks.document_version_id = previous_versions.id
     AND previous_blocks.base_block_id = current_blocks.base_block_id
    WHERE current_blocks.document_version_id = versions.id
      AND (
        current_blocks.text <> previous_blocks.text
        OR current_blocks.teacher_edited <> previous_blocks.teacher_edited
      )
    ORDER BY current_blocks.sequence
    LIMIT 1
)
WHERE versions.version_number > 1;

ALTER TABLE lesson_material_document_blocks
ADD COLUMN learning_goal_numbers TEXT NOT NULL DEFAULT '[]';

ALTER TABLE lesson_material_document_blocks
ADD COLUMN source_material_keys TEXT NOT NULL DEFAULT '[]';

UPDATE lesson_material_document_blocks AS version_blocks
SET learning_goal_numbers = COALESCE((
        SELECT json_group_array(goals.learning_goal_number)
        FROM (
            SELECT links.learning_goal_number
            FROM lesson_material_block_learning_goals links
            WHERE links.block_id = version_blocks.base_block_id
            ORDER BY links.learning_goal_number
        ) goals
    ), '[]'),
    source_material_keys = COALESCE((
        SELECT json_group_array(sources.source_key)
        FROM (
            SELECT material_sources.source_key
            FROM lesson_material_block_sources links
            JOIN lesson_material_sources material_sources ON material_sources.id = links.source_id
            WHERE links.block_id = version_blocks.base_block_id
            ORDER BY material_sources.sequence
        ) sources
    ), '[]');

CREATE TABLE lesson_material_document_sections (
    id TEXT PRIMARY KEY NOT NULL,
    document_version_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    base_section_id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 160),
    learning_goal_numbers TEXT NOT NULL,
    quality_report TEXT,
    regenerated INTEGER NOT NULL DEFAULT 0 CHECK (regenerated IN (0, 1)),
    UNIQUE (document_version_id, base_section_id),
    FOREIGN KEY (document_version_id, run_id)
        REFERENCES lesson_material_document_versions(id, run_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (base_section_id) REFERENCES lesson_material_sections(id) ON DELETE RESTRICT
);

CREATE INDEX lesson_material_document_sections_version_sequence
ON lesson_material_document_sections(document_version_id, base_section_id);

INSERT INTO lesson_material_document_sections (
    id, document_version_id, run_id, base_section_id, title, learning_goal_numbers, regenerated
)
SELECT
    'material-version-section-' || lower(hex(randomblob(16))),
    versions.id,
    versions.run_id,
    sections.id,
    sections.generated_title,
    sections.learning_goal_numbers,
    0
FROM lesson_material_document_versions versions
JOIN lesson_material_sections sections ON sections.run_id = versions.run_id
WHERE sections.status = 'done' AND sections.generated_title IS NOT NULL;

CREATE TABLE lesson_material_section_regenerations (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    source_document_version_id TEXT NOT NULL,
    source_version_number INTEGER NOT NULL CHECK (source_version_number > 0),
    status TEXT NOT NULL CHECK (status IN ('generating', 'failed', 'cancelled', 'complete')),
    generation_token TEXT,
    teacher_direction TEXT
        CHECK (teacher_direction IS NULL OR (length(trim(teacher_direction)) > 0 AND length(teacher_direction) <= 1000)),
    target_document_version_id TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT,
    UNIQUE (run_id, sequence),
    UNIQUE (generation_token),
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES lesson_material_sections(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_document_version_id, run_id)
        REFERENCES lesson_material_document_versions(id, run_id) ON DELETE RESTRICT,
    FOREIGN KEY (target_document_version_id, run_id)
        REFERENCES lesson_material_document_versions(id, run_id) ON DELETE RESTRICT,
    CHECK (
        (status = 'generating' AND generation_token IS NOT NULL
            AND target_document_version_id IS NULL AND completed_at IS NULL)
        OR (status = 'failed' AND generation_token IS NULL
            AND target_document_version_id IS NULL AND last_error IS NOT NULL AND completed_at IS NOT NULL)
        OR (status = 'cancelled' AND generation_token IS NULL
            AND target_document_version_id IS NULL AND completed_at IS NOT NULL)
        OR (status = 'complete' AND generation_token IS NULL
            AND target_document_version_id IS NOT NULL AND last_error IS NULL AND completed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX lesson_material_one_active_section_regeneration
ON lesson_material_section_regenerations(run_id)
WHERE status = 'generating';

CREATE INDEX lesson_material_section_regeneration_history
ON lesson_material_section_regenerations(run_id, section_id, sequence DESC);

CREATE TRIGGER lesson_material_document_sections_immutable_update
BEFORE UPDATE ON lesson_material_document_sections
BEGIN
    SELECT RAISE(ABORT, 'lesson material version sections are immutable');
END;

CREATE TRIGGER lesson_material_approved_versions_immutable_update
BEFORE UPDATE ON lesson_material_document_versions
WHEN OLD.status = 'approved'
BEGIN
    SELECT RAISE(ABORT, 'approved lesson material versions are immutable');
END;

CREATE TRIGGER lesson_material_approved_versions_immutable_delete
BEFORE DELETE ON lesson_material_document_versions
WHEN OLD.status = 'approved'
BEGIN
    SELECT RAISE(ABORT, 'approved lesson material versions are immutable');
END;

CREATE TRIGGER lesson_material_document_blocks_immutable_update
BEFORE UPDATE ON lesson_material_document_blocks
BEGIN
    SELECT RAISE(ABORT, 'lesson material version blocks are immutable');
END;

CREATE TRIGGER lesson_material_document_blocks_immutable_delete
BEFORE DELETE ON lesson_material_document_blocks
BEGIN
    SELECT RAISE(ABORT, 'lesson material version blocks are immutable');
END;

CREATE TRIGGER lesson_material_document_sections_immutable_delete
BEFORE DELETE ON lesson_material_document_sections
BEGIN
    SELECT RAISE(ABORT, 'lesson material version sections are immutable');
END;

CREATE TRIGGER lesson_material_terminal_regenerations_immutable_update
BEFORE UPDATE ON lesson_material_section_regenerations
WHEN OLD.status <> 'generating'
BEGIN
    SELECT RAISE(ABORT, 'completed section recreation records are immutable');
END;

CREATE TRIGGER lesson_material_regenerations_immutable_delete
BEFORE DELETE ON lesson_material_section_regenerations
BEGIN
    SELECT RAISE(ABORT, 'section recreation records are immutable');
END;
