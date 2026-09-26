CREATE TABLE tutoring_turns (
    sample_id TEXT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('processing', 'complete', 'failed')),
    transcript TEXT,
    parsed_answer INTEGER,
    decision TEXT CHECK (decision IS NULL OR decision IN ('correct', 'try_again', 'not_understood')),
    feedback TEXT,
    provider TEXT CHECK (provider IS NULL OR provider = 'sahara'),
    latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    error_detail TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    CHECK (
        (state = 'complete' AND transcript IS NOT NULL AND decision IS NOT NULL
         AND feedback IS NOT NULL AND provider IS NOT NULL AND latency_ms IS NOT NULL)
        OR state <> 'complete'
    )
);
