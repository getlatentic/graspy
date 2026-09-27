-- A learner's conversations with the tutor, shared by their devices, under the account learner's key. A
-- learner has one thread for each thing a conversation is about (its scope); a device's copy of it may carry
-- another id, so a thread is found by its scope. Messages are appended by id. Every write takes the next
-- seq of its owner, so a device reads only what changed since the seq it last read.
CREATE TABLE tutor_threads (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    scope_json TEXT NOT NULL,
    agent_context_id TEXT,
    preview TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    PRIMARY KEY (owner_id, id),
    UNIQUE (owner_id, scope_key)
);

CREATE INDEX tutor_threads_changed ON tutor_threads (owner_id, seq);

CREATE TABLE tutor_messages (
    owner_id TEXT NOT NULL,
    id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    edited_at INTEGER NOT NULL,
    metadata_json TEXT,
    seq INTEGER NOT NULL,
    PRIMARY KEY (owner_id, id)
);

CREATE INDEX tutor_messages_changed ON tutor_messages (owner_id, seq, id);
CREATE INDEX tutor_messages_in_thread ON tutor_messages (owner_id, thread_id, timestamp);

CREATE TABLE tutor_sync (
    owner_id TEXT PRIMARY KEY,
    seq INTEGER NOT NULL
);
