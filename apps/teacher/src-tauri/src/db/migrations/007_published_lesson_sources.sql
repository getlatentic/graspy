ALTER TABLE lesson_material_sources ADD COLUMN source_record_id TEXT;
ALTER TABLE lesson_material_sources ADD COLUMN publisher TEXT;
ALTER TABLE lesson_material_sources ADD COLUMN source_url TEXT;
ALTER TABLE lesson_material_sources ADD COLUMN licence_name TEXT;
ALTER TABLE lesson_material_sources ADD COLUMN licence_url TEXT;
ALTER TABLE lesson_material_sources ADD COLUMN attribution TEXT;
ALTER TABLE lesson_material_sources ADD COLUMN sequence INTEGER NOT NULL DEFAULT 1 CHECK (sequence > 0);

DELETE FROM lesson_material_section_sources
WHERE source_id IN (
    SELECT id FROM lesson_material_sources WHERE kind = 'teacher_plan'
);

DELETE FROM lesson_material_sources WHERE kind = 'teacher_plan';

CREATE UNIQUE INDEX lesson_material_sources_record_per_run
    ON lesson_material_sources(run_id, source_record_id)
    WHERE source_record_id IS NOT NULL;

CREATE UNIQUE INDEX lesson_material_sources_sequence_per_run
    ON lesson_material_sources(run_id, sequence);
