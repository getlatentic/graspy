ALTER TABLE lesson_material_runs
ADD COLUMN current_document_version_number INTEGER NOT NULL DEFAULT 0
CHECK (current_document_version_number >= 0);

CREATE TABLE lesson_material_document_versions (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
    previous_version_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TEXT,
    UNIQUE (run_id, version_number),
    UNIQUE (id, run_id),
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (previous_version_id) REFERENCES lesson_material_document_versions(id) ON DELETE RESTRICT,
    CHECK (
        (status = 'draft' AND approved_at IS NULL)
        OR (status = 'approved' AND approved_at IS NOT NULL)
    )
);

CREATE TABLE lesson_material_document_blocks (
    id TEXT PRIMARY KEY NOT NULL,
    document_version_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    base_block_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    kind TEXT NOT NULL CHECK (kind IN ('review', 'worked_example', 'practice', 'solution')),
    text TEXT NOT NULL CHECK (length(trim(text)) > 0 AND length(text) <= 12000),
    teacher_edited INTEGER NOT NULL DEFAULT 0 CHECK (teacher_edited IN (0, 1)),
    UNIQUE (document_version_id, base_block_id),
    FOREIGN KEY (document_version_id, run_id)
        REFERENCES lesson_material_document_versions(id, run_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES lesson_material_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (base_block_id) REFERENCES lesson_material_blocks(id) ON DELETE RESTRICT,
    FOREIGN KEY (section_id) REFERENCES lesson_material_sections(id) ON DELETE RESTRICT
);

CREATE INDEX lesson_material_document_blocks_version_sequence
ON lesson_material_document_blocks(document_version_id, section_id, sequence);

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

INSERT INTO lesson_material_document_versions (id, run_id, version_number, status)
SELECT 'material-version-' || lower(hex(randomblob(16))), runs.id, 1, 'draft'
FROM lesson_material_runs runs
WHERE runs.status = 'complete'
  AND EXISTS (
      SELECT 1
      FROM lesson_material_blocks blocks
      JOIN lesson_material_sections sections ON sections.id = blocks.section_id
      WHERE sections.run_id = runs.id
  );

INSERT INTO lesson_material_document_blocks (
    id, document_version_id, run_id, base_block_id, section_id, sequence, kind, text, teacher_edited
)
SELECT
    'material-version-block-' || lower(hex(randomblob(16))),
    versions.id,
    versions.run_id,
    blocks.id,
    blocks.section_id,
    blocks.sequence,
    blocks.kind,
    blocks.text,
    0
FROM lesson_material_document_versions versions
JOIN lesson_material_sections sections ON sections.run_id = versions.run_id
JOIN lesson_material_blocks blocks ON blocks.section_id = sections.id
WHERE versions.version_number = 1;

UPDATE lesson_material_runs
SET current_document_version_number = 1
WHERE EXISTS (
    SELECT 1
    FROM lesson_material_document_versions versions
    WHERE versions.run_id = lesson_material_runs.id AND versions.version_number = 1
);
