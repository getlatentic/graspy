CREATE TABLE lesson_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    reason TEXT,
    at INTEGER NOT NULL
);

CREATE INDEX lesson_events_owner_at ON lesson_events (owner_id, at);
