-- A lesson with a plan kept its content twice, and the copies had drifted.
--
-- `replace_lesson_projection` copied the plan's goals, instructional materials,
-- previous knowledge, assessment and references onto the lesson's own columns.
-- Three of the owner's nine planned lessons already disagreed with their plan
-- about the instructional materials, because a later migration cleaned one and
-- could not reach the other.
--
-- The reference line was the worst of them. It was flattened to
-- "{title} — {attribution}", which threw away the record id, and the classwork's
-- source resolver then could not find its way back — so every run resolved
-- nothing and was written ungrounded.
--
-- Nothing copies the plan out now. A lesson with a plan reads these from it; a
-- lesson typed into the form keeps its own, which is what these columns are for.
-- The copies are cleared so nothing can read a stale one by mistake.

UPDATE lessons
   SET learning_goals = '[]',
       instructional_materials = '[]',
       previous_knowledge = '[]',
       assessment = '[]',
       reference_notes = '[]'
 WHERE id IN (SELECT lesson_id FROM lesson_granular_drafts);
