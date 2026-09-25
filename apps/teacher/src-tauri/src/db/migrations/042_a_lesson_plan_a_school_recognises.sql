-- Carry the two parts of a lesson plan graspy never held.
--
-- A lesson plan handed in on a Monday carries previous knowledge — what the
-- class already knows that today builds on — and an assignment, the work set at
-- the end. graspy held neither, so a teacher exporting a plan still had to
-- write two sections in by hand.
--
-- Previous knowledge is already planned when graspy writes a lesson: the
-- generated plan names it. It lands on the preparation beside the goals and
-- materials it sits with, so confirming a lesson carries it across the same way
-- everything else does. An assignment is the teacher's own; nothing generates
-- one, so it has no column on the preparation.
ALTER TABLE lessons ADD COLUMN previous_knowledge TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lessons ADD COLUMN assignment TEXT NOT NULL DEFAULT '[]';
ALTER TABLE lesson_preparations ADD COLUMN previous_knowledge TEXT NOT NULL DEFAULT '[]';
