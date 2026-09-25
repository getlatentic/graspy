-- A quality number should be a claim someone checked, not one the machine
-- awarded itself. A reviewer records what a criterion should have scored and
-- why, and that is the number that counts from then on.
--
-- Corrections are kept rather than written over the score they correct: a
-- scorer a person keeps overruling is the thing worth finding, and an
-- overwritten score hides it. A correction of a correction is another row, and
-- the latest one stands.
CREATE TABLE generation_evaluation_reviews (
    id TEXT PRIMARY KEY NOT NULL,
    evaluation_case_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    score REAL NOT NULL CHECK (score >= 0.0 AND score <= 1.0),
    reviewer TEXT NOT NULL CHECK (length(trim(reviewer)) > 0),
    because TEXT NOT NULL CHECK (length(trim(because)) > 0),
    reviewed_at_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluation_case_id) REFERENCES generation_evaluation_cases(id) ON DELETE RESTRICT
);

CREATE INDEX generation_evaluation_reviews_by_case
    ON generation_evaluation_reviews (evaluation_case_id, metric, reviewed_at_ms);

CREATE TRIGGER generation_evaluation_reviews_immutable_update
BEFORE UPDATE ON generation_evaluation_reviews
BEGIN
    SELECT RAISE(ABORT, 'evaluation reviews are immutable');
END;

CREATE TRIGGER generation_evaluation_reviews_immutable_delete
BEFORE DELETE ON generation_evaluation_reviews
BEGIN
    SELECT RAISE(ABORT, 'evaluation reviews are immutable');
END;
