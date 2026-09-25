-- The last place a plan was copied out of itself.
--
-- `lesson_preparations` stages a pasted plan while graspy works it into a
-- structured one. It kept the goals, instructional materials, previous
-- knowledge, assessment and references in its own columns, and
-- `lesson_granular_preparations` kept the plan those were copied from — the
-- same arrangement `lessons` had, with the same reference line flattened to
-- "{title} — {attribution}" and the same way of drifting.
--
-- A preparation with a plan behind it reads from that plan now. One still being
-- worked up from pasted text has only its own columns, which is what they are
-- for. The copies are cleared so nothing can read a stale one by mistake.
--
-- This finishes it: no table holds a second copy of a lesson's content.

UPDATE lesson_preparations
   SET learning_goals = '[]',
       instructional_materials = '[]',
       previous_knowledge = '[]',
       assessment = '[]',
       reference_notes = '[]'
 WHERE lesson_id IN (SELECT lesson_id FROM lesson_granular_preparations);
