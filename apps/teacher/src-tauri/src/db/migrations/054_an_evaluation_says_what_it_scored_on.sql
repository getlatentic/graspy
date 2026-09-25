-- A score nobody can check is not evidence of quality. Each criterion now keeps
-- the lines it was read off, so a reviewer can tell an answer that was wrong
-- from a scorer that was.
ALTER TABLE generation_evaluation_cases
    ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}';
