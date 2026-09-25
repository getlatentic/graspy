-- The scheme of work defines the lessons: one lesson per scheme entry. Existing
-- databases collected more than one where a lesson was created repeatedly for
-- the same week, so keep the most-developed lesson for each entry and release
-- the rest to stand off the scheme. Nothing a teacher wrote is deleted — the
-- released lessons keep their content and simply hold no scheme entry any more.
--
-- Most-developed means: a confirmed version first, then the one with the most
-- teaching steps, then the most recently updated. The lesson-to-scheme binding
-- is all-or-nothing under a table CHECK, so releasing a lesson clears every
-- binding column together, leaving it in the same shape as an unscheduled draft.
UPDATE lessons
SET scheme_entry_id = NULL,
    scheme_week_id = NULL,
    curriculum_course_id = NULL,
    curriculum_unit_id = NULL,
    curriculum_node_id = NULL
WHERE scheme_entry_id IS NOT NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT lessons.id,
             ROW_NUMBER() OVER (
               PARTITION BY lessons.scheme_entry_id
               ORDER BY (lessons.status = 'confirmed') DESC,
                        (SELECT COUNT(*) FROM lesson_steps
                         WHERE lesson_steps.lesson_id = lessons.id) DESC,
                        lessons.updated_at DESC,
                        lessons.id
             ) AS keep_rank
      FROM lessons
      WHERE lessons.scheme_entry_id IS NOT NULL
    )
    WHERE keep_rank = 1
  );

-- From here a scheme entry can hold only one lesson, so a second can never be
-- created against it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_scheme_entry
  ON lessons(scheme_entry_id)
  WHERE scheme_entry_id IS NOT NULL;
