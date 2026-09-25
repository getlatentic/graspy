-- A confirmed version kept its content twice, and the copies had drifted.
--
-- Every confirmed version seals a plan in lesson_granular_versions, and the
-- columns beside it on lesson_versions held the same topic, subtopic, goals,
-- aids and assessment — written in the same breath, from the same lesson, and
-- unable to disagree honestly. One of five in the owner's library disagreed
-- anyway: migration 037 cleaned source filenames out of the column and could
-- not touch the seal, which is immutable by design.
--
-- Only a granular lesson can be confirmed now that the unreached confirm path
-- is gone, so the seal is always there and the columns are always the copy.
-- Four of them — instructional_materials, assessment, reference_notes and
-- source_plan_text — were never read at all.
--
-- What the version still holds is what makes it a version: which lesson, which
-- number, when it was confirmed, and the class and term it belongs to. Its
-- content is the plan it sealed.

ALTER TABLE lesson_versions DROP COLUMN topic;
ALTER TABLE lesson_versions DROP COLUMN subtopic;
ALTER TABLE lesson_versions DROP COLUMN learning_goals;
ALTER TABLE lesson_versions DROP COLUMN instructional_materials;
ALTER TABLE lesson_versions DROP COLUMN assessment;
ALTER TABLE lesson_versions DROP COLUMN reference_notes;
ALTER TABLE lesson_versions DROP COLUMN source_plan_text;
