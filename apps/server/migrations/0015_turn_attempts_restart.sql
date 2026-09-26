-- Turns failed under the retry on every request had their attempts spent in seconds. Each gets its
-- second attempt again, now spaced out, rather than being refused as marking_failed on deploy.
UPDATE tutoring_turns SET attempts = MIN(attempts, 1) WHERE state <> 'complete';
