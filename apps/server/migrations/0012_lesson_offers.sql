CREATE TABLE lesson_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    redeemed_at INTEGER
);

CREATE INDEX lesson_offers_open ON lesson_offers (owner_id, plan_id, event_id, redeemed_at);
