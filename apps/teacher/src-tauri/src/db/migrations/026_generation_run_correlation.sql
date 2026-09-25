-- Let the caller that asked for a run find it again while it is still running.
--
-- A run records what it is generating but not who asked, so a teacher watching
-- a lesson being prepared had no way to look up its progress: the work is one
-- long command that returns only when every node is finished, and the node
-- states written along the way were unreachable.
--
-- The correlation id is the handle the caller already holds — the same request
-- id it would use to cancel — so the runtime stays generic. It does not learn
-- what a lesson is; it learns that someone is waiting.

ALTER TABLE generation_program_runs ADD COLUMN correlation_id TEXT;

CREATE INDEX generation_program_runs_correlation
ON generation_program_runs (correlation_id)
WHERE correlation_id IS NOT NULL;
