-- Forget the slides runs, now that there is nothing for them to return to.
--
-- Migration 039 retired the pack but left its task records, so the app kept
-- offering an interrupted slides build with "Open the lesson to start it
-- again" — a run a teacher cannot start, for a feature that no longer exists.
-- Seen in the running app immediately after 039.
--
-- Only the retired kind is forgotten. Preparation, note, materials and group
-- materials runs are untouched, including their finished history.
DELETE FROM background_tasks WHERE kind = 'lesson_pack';
