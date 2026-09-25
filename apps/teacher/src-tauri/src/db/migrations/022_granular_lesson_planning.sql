ALTER TABLE lessons
ADD COLUMN plan_format TEXT NOT NULL DEFAULT 'legacy_import'
CHECK (plan_format IN ('legacy_import', 'granular'));

ALTER TABLE lesson_preparations
ADD COLUMN plan_format TEXT NOT NULL DEFAULT 'legacy_import'
CHECK (plan_format IN ('legacy_import', 'granular'));

ALTER TABLE lesson_versions
ADD COLUMN plan_format TEXT NOT NULL DEFAULT 'legacy_import'
CHECK (plan_format IN ('legacy_import', 'granular'));

CREATE TABLE lesson_granular_drafts (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
    plan_sha256 TEXT NOT NULL CHECK (length(plan_sha256) = 64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
    curriculum_snapshot_json TEXT NOT NULL CHECK (json_valid(curriculum_snapshot_json)),
    curriculum_snapshot_sha256 TEXT NOT NULL CHECK (length(curriculum_snapshot_sha256) = 64 AND curriculum_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    source_evidence_snapshot_json TEXT NOT NULL CHECK (json_valid(source_evidence_snapshot_json)),
    source_evidence_snapshot_sha256 TEXT NOT NULL CHECK (length(source_evidence_snapshot_sha256) = 64 AND source_evidence_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    program_id TEXT NOT NULL,
    program_version TEXT NOT NULL,
    program_digest TEXT NOT NULL CHECK (length(program_digest) = 64 AND program_digest NOT GLOB '*[^0-9a-f]*'),
    program_run_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (program_run_id) REFERENCES generation_program_runs(id) ON DELETE RESTRICT
);

CREATE TABLE lesson_granular_preparations (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
    plan_sha256 TEXT NOT NULL CHECK (length(plan_sha256) = 64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
    curriculum_snapshot_json TEXT NOT NULL CHECK (json_valid(curriculum_snapshot_json)),
    curriculum_snapshot_sha256 TEXT NOT NULL CHECK (length(curriculum_snapshot_sha256) = 64 AND curriculum_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    source_evidence_snapshot_json TEXT NOT NULL CHECK (json_valid(source_evidence_snapshot_json)),
    source_evidence_snapshot_sha256 TEXT NOT NULL CHECK (length(source_evidence_snapshot_sha256) = 64 AND source_evidence_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    program_id TEXT NOT NULL,
    program_version TEXT NOT NULL,
    program_digest TEXT NOT NULL CHECK (length(program_digest) = 64 AND program_digest NOT GLOB '*[^0-9a-f]*'),
    program_run_id TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lesson_preparations(lesson_id) ON DELETE CASCADE,
    FOREIGN KEY (program_run_id) REFERENCES generation_program_runs(id) ON DELETE RESTRICT
);

CREATE TABLE lesson_granular_versions (
    lesson_version_id TEXT PRIMARY KEY NOT NULL,
    plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
    plan_sha256 TEXT NOT NULL CHECK (length(plan_sha256) = 64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
    curriculum_snapshot_json TEXT NOT NULL CHECK (json_valid(curriculum_snapshot_json)),
    curriculum_snapshot_sha256 TEXT NOT NULL CHECK (length(curriculum_snapshot_sha256) = 64 AND curriculum_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    source_evidence_snapshot_json TEXT NOT NULL CHECK (json_valid(source_evidence_snapshot_json)),
    source_evidence_snapshot_sha256 TEXT NOT NULL CHECK (length(source_evidence_snapshot_sha256) = 64 AND source_evidence_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
    program_id TEXT NOT NULL,
    program_version TEXT NOT NULL,
    program_digest TEXT NOT NULL CHECK (length(program_digest) = 64 AND program_digest NOT GLOB '*[^0-9a-f]*'),
    program_run_id TEXT,
    FOREIGN KEY (lesson_version_id) REFERENCES lesson_versions(id) ON DELETE RESTRICT,
    FOREIGN KEY (program_run_id) REFERENCES generation_program_runs(id) ON DELETE RESTRICT
);

CREATE TRIGGER lesson_granular_versions_immutable_update
BEFORE UPDATE ON lesson_granular_versions
BEGIN
    SELECT RAISE(ABORT, 'confirmed detailed lesson versions are immutable');
END;

CREATE TRIGGER lesson_granular_versions_immutable_delete
BEFORE DELETE ON lesson_granular_versions
BEGIN
    SELECT RAISE(ABORT, 'confirmed detailed lesson versions are immutable');
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

CREATE TRIGGER lesson_preparations_granular_format_requires_record_insert
BEFORE INSERT ON lesson_granular_preparations
WHEN (SELECT plan_format FROM lesson_preparations WHERE lesson_id = NEW.lesson_id) <> 'granular'
BEGIN
    SELECT RAISE(ABORT, 'detailed lesson preparation data requires the granular lesson format');
END;

CREATE TRIGGER lesson_versions_granular_format_requires_record_insert
BEFORE INSERT ON lesson_granular_versions
WHEN (SELECT plan_format FROM lesson_versions WHERE id = NEW.lesson_version_id) <> 'granular'
BEGIN
    SELECT RAISE(ABORT, 'detailed lesson version data requires the granular lesson format');
END;
