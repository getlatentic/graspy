-- A lesson the teacher wrote themselves has no curriculum package behind it, so
-- the objectives and knowledge it is taught against are worked out once from the
-- teacher's own goals and the sources found for them, and kept here.
--
-- The fingerprint is what the snapshot was derived from. When a teacher edits
-- their goals the fingerprint no longer matches and the snapshot is worked out
-- again, so materials can never be grounded in goals that have been replaced.
CREATE TABLE lesson_teacher_curriculum (
    lesson_id TEXT PRIMARY KEY NOT NULL,
    goals_fingerprint TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    source_record_ids TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

-- Only a lesson with no curriculum linkage is taught against a derived
-- curriculum; one that has a scheme entry uses the curriculum it is linked to.
CREATE TRIGGER lesson_teacher_curriculum_requires_no_linkage_insert
BEFORE INSERT ON lesson_teacher_curriculum
WHEN (SELECT curriculum_course_id FROM lessons WHERE id = NEW.lesson_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'a lesson linked to a curriculum does not need a derived one');
END;

CREATE TRIGGER lesson_teacher_curriculum_requires_no_linkage_update
BEFORE UPDATE ON lesson_teacher_curriculum
WHEN (SELECT curriculum_course_id FROM lessons WHERE id = NEW.lesson_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'a lesson linked to a curriculum does not need a derived one');
END;
