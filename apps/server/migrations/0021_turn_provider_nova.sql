-- SQLite cannot alter a CHECK constraint; rebuild the table so provider may also be 'nova', Deepgram's Nova-3 on Workers AI.
CREATE TABLE tutoring_turns_new (
    sample_id TEXT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('processing', 'complete', 'failed')),
    transcript TEXT,
    parsed_answer INTEGER,
    decision TEXT CHECK (decision IS NULL OR decision IN ('correct', 'try_again', 'not_understood')),
    feedback TEXT,
    provider TEXT CHECK (provider IS NULL OR provider IN ('sahara', 'intron_sync', 'whisper', 'nova')),
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    error_detail TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    exercise_json TEXT CHECK (exercise_json IS NULL OR json_valid(exercise_json)),
    result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
    spoken_language TEXT CHECK (spoken_language IS NULL OR spoken_language IN ('en', 'yo', 'pcm')),
    language_evidence_json TEXT CHECK (language_evidence_json IS NULL OR json_valid(language_evidence_json)),
    claim_token TEXT,
    verdict TEXT,
    heard_kind TEXT,
    CHECK (
        (state = 'complete' AND transcript IS NOT NULL AND decision IS NOT NULL
         AND feedback IS NOT NULL AND provider IS NOT NULL AND latency_ms IS NOT NULL)
        OR state <> 'complete'
    )
);

INSERT INTO tutoring_turns_new
    SELECT sample_id, state, transcript, parsed_answer, decision, feedback, provider, latency_ms,
           error_detail, attempts, updated_at, exercise_json, result_json, spoken_language,
           language_evidence_json, claim_token, verdict, heard_kind
    FROM tutoring_turns;

DROP TABLE tutoring_turns;

ALTER TABLE tutoring_turns_new RENAME TO tutoring_turns;
