CREATE TABLE samples (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    metadata_fingerprint TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('awaiting_audio', 'ready')),
    metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
    audio_key TEXT UNIQUE,
    audio_content_type TEXT,
    audio_bytes INTEGER CHECK (audio_bytes IS NULL OR audio_bytes > 0),
    created_at INTEGER NOT NULL,
    uploaded_at INTEGER,
    UNIQUE (owner_id, idempotency_key),
    CHECK (
        (state = 'awaiting_audio' AND audio_key IS NULL AND uploaded_at IS NULL)
        OR
        (state = 'ready' AND audio_key IS NOT NULL AND uploaded_at IS NOT NULL)
    )
);

CREATE INDEX samples_state_created_at ON samples (state, created_at);

