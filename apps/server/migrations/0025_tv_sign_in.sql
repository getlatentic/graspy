-- Signing a TV in from a phone (docs/TV_SIGN_IN.md).
--
-- tv_links is one request from a TV: the code the TV polls with and the short code the person types
-- on their phone, both kept only as hashes. A request is pending until a signed-in phone approves or
-- denies it, and 'consumed' once the TV has taken its session, which can happen once. Rows are
-- purged soon after they expire, by the Worker's cron trigger.
CREATE TABLE tv_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
    label TEXT NOT NULL,
    country TEXT,
    interval_s INTEGER NOT NULL,
    last_polled_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    account_uid TEXT,
    learner_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    approved_at INTEGER,
    CHECK (status NOT IN ('approved', 'consumed') OR (account_uid IS NOT NULL AND learner_id IS NOT NULL))
);

-- A short code names one open request at a time.
CREATE UNIQUE INDEX tv_links_open_user_code ON tv_links (user_code_hash) WHERE status = 'pending';
CREATE INDEX tv_links_expiry ON tv_links (expires_at);

-- A TV that signed in: the credential it renews its session with, kept as a hash. It is the account's
-- to list and revoke, ends after 90 days or 30 days unused, and its sessions last an hour.
CREATE TABLE tv_sessions (
    id TEXT PRIMARY KEY,
    refresh_hash TEXT NOT NULL UNIQUE,
    account_uid TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX tv_sessions_account ON tv_sessions (account_uid);
CREATE INDEX tv_sessions_expiry ON tv_sessions (expires_at);
