-- One word for the classwork, and one for the instructional materials.
--
-- The schema said "material" for three different things: the review, worked
-- examples, practice and answers graspy writes; the chalk, charts and counters
-- a teacher carries into the room; and the textbook a lesson is grounded in.
-- A school's lesson plan already gave two of those their own names, so the
-- tables take them: what graspy writes is the classwork, and the column that
-- holds what a teacher brings says so. Source material keeps its name, which
-- was never in question.
--
-- No row's meaning changes. Where a row carries one of these names as a
-- value, it is carried across with it.

-- The triggers and indexes are recreated rather than left under their old
-- names, so no name outlives the word it was built on.
DROP TRIGGER lesson_material_approved_versions_immutable_delete;
DROP TRIGGER lesson_material_approved_versions_immutable_update;
DROP TRIGGER lesson_material_document_blocks_immutable_delete;
DROP TRIGGER lesson_material_document_blocks_immutable_update;
DROP TRIGGER lesson_material_document_sections_immutable_delete;
DROP TRIGGER lesson_material_document_sections_immutable_update;
DROP TRIGGER lesson_material_regenerations_immutable_delete;
DROP TRIGGER lesson_material_terminal_regenerations_immutable_update;

DROP INDEX differentiated_material_sections_next_index;
DROP INDEX lesson_material_document_blocks_version_sequence;
DROP INDEX lesson_material_document_sections_version_sequence;
DROP INDEX lesson_material_one_active_section_regeneration;
DROP INDEX lesson_material_section_regeneration_history;
DROP INDEX lesson_material_sources_record_per_run;
DROP INDEX lesson_material_sources_sequence_per_run;

ALTER TABLE lesson_material_runs RENAME TO classwork_runs;
ALTER TABLE lesson_material_sections RENAME TO classwork_sections;
ALTER TABLE lesson_material_blocks RENAME TO classwork_blocks;
ALTER TABLE lesson_material_block_learning_goals RENAME TO classwork_block_learning_goals;
ALTER TABLE lesson_material_block_sources RENAME TO classwork_block_sources;
ALTER TABLE lesson_material_figures RENAME TO classwork_figures;
ALTER TABLE lesson_material_sources RENAME TO classwork_sources;
ALTER TABLE lesson_material_section_sources RENAME TO classwork_section_sources;
ALTER TABLE lesson_material_section_regenerations RENAME TO classwork_section_regenerations;
ALTER TABLE lesson_material_document_versions RENAME TO classwork_document_versions;
ALTER TABLE lesson_material_document_sections RENAME TO classwork_document_sections;
ALTER TABLE lesson_material_document_blocks RENAME TO classwork_document_blocks;
ALTER TABLE lesson_material_validation_passes RENAME TO classwork_validation_passes;
ALTER TABLE lesson_material_validation_checks RENAME TO classwork_validation_checks;

ALTER TABLE differentiated_material_runs RENAME TO differentiated_classwork_runs;
ALTER TABLE differentiated_material_groups RENAME TO differentiated_classwork_groups;
ALTER TABLE differentiated_material_sections RENAME TO differentiated_classwork_sections;
ALTER TABLE differentiated_material_blocks RENAME TO differentiated_classwork_blocks;

-- The column a teacher's own list is kept in, on every table that keeps one.
ALTER TABLE lessons RENAME COLUMN materials TO instructional_materials;
ALTER TABLE lesson_versions RENAME COLUMN materials TO instructional_materials;
ALTER TABLE lesson_preparations RENAME COLUMN materials TO instructional_materials;
ALTER TABLE scheme_entries RENAME COLUMN materials TO instructional_materials;
ALTER TABLE scheme_template_entries RENAME COLUMN materials TO instructional_materials;

CREATE INDEX differentiated_classwork_sections_next_index
    ON differentiated_classwork_sections(run_id, status, group_id, sequence);

CREATE INDEX classwork_document_blocks_version_sequence
    ON classwork_document_blocks(document_version_id, section_id, sequence);

CREATE INDEX classwork_document_sections_version_sequence
    ON classwork_document_sections(document_version_id, base_section_id);

CREATE UNIQUE INDEX classwork_one_active_section_regeneration
    ON classwork_section_regenerations(run_id)
    WHERE status = 'generating';

CREATE INDEX classwork_section_regeneration_history
    ON classwork_section_regenerations(run_id, section_id, sequence DESC);

CREATE UNIQUE INDEX classwork_sources_record_per_run
    ON classwork_sources(run_id, source_record_id)
    WHERE source_record_id IS NOT NULL;

CREATE UNIQUE INDEX classwork_sources_sequence_per_run
    ON classwork_sources(run_id, sequence);

CREATE TRIGGER classwork_approved_versions_immutable_delete
BEFORE DELETE ON classwork_document_versions
WHEN OLD.status = 'approved'
BEGIN
    SELECT RAISE(ABORT, 'approved classwork versions are immutable');
END;

CREATE TRIGGER classwork_approved_versions_immutable_update
BEFORE UPDATE ON classwork_document_versions
WHEN OLD.status = 'approved'
BEGIN
    SELECT RAISE(ABORT, 'approved classwork versions are immutable');
END;

CREATE TRIGGER classwork_document_blocks_immutable_delete
BEFORE DELETE ON classwork_document_blocks
BEGIN
    SELECT RAISE(ABORT, 'classwork version blocks are immutable');
END;

CREATE TRIGGER classwork_document_blocks_immutable_update
BEFORE UPDATE ON classwork_document_blocks
BEGIN
    SELECT RAISE(ABORT, 'classwork version blocks are immutable');
END;

CREATE TRIGGER classwork_document_sections_immutable_delete
BEFORE DELETE ON classwork_document_sections
BEGIN
    SELECT RAISE(ABORT, 'classwork version sections are immutable');
END;

CREATE TRIGGER classwork_document_sections_immutable_update
BEFORE UPDATE ON classwork_document_sections
BEGIN
    SELECT RAISE(ABORT, 'classwork version sections are immutable');
END;

CREATE TRIGGER classwork_regenerations_immutable_delete
BEFORE DELETE ON classwork_section_regenerations
BEGIN
    SELECT RAISE(ABORT, 'section recreation records are immutable');
END;

CREATE TRIGGER classwork_terminal_regenerations_immutable_update
BEFORE UPDATE ON classwork_section_regenerations
WHEN OLD.status <> 'generating'
BEGIN
    SELECT RAISE(ABORT, 'completed section recreation records are immutable');
END;

-- The word also outlived itself in rows a previous release wrote. A task
-- recorded under the old kind would still be listed and still be reachable, but
-- the screen it opens is decided by that kind, so it would land on the plan
-- instead of the classwork the teacher left running.
UPDATE background_tasks SET kind = 'classwork' WHERE kind = 'lesson_materials';
UPDATE background_tasks SET kind = 'differentiated_classwork' WHERE kind = 'differentiated_materials';
UPDATE background_tasks
   SET label = replace(label, 'Creating materials — ', 'Creating the classwork — ')
 WHERE label LIKE 'Creating materials — %';

-- Generation history keeps the names it ran under. Those rows are read by run,
-- never by these identifiers, and a trigger holds a finished run immutable
-- precisely so the record says what happened rather than what is called what
-- now.

-- A confirmed lesson is stored as its own JSON, sealed by a digest and held
-- immutable by a trigger, so its keys are fixed at the moment it was confirmed.
-- The reader carries the old key deliberately; see GranularLessonPlan.

-- A lesson a teacher wrote by hand is stored as their own document and read
-- straight onto the editing screen, which now names the field the way the rest
-- of the app does. Nothing seals this one, so it moves with the name.
UPDATE lesson_authored_content
   SET content = json_remove(
         json_set(content, '$.instructionalMaterials', content -> '$.materials'),
         '$.materials')
 WHERE json_extract(content, '$.materials') IS NOT NULL;
