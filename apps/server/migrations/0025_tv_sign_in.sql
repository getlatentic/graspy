-- Signing a TV in from a phone (docs/TV_SIGN_IN.md).
--
-- tv_links is one request from a TV: the code the TV polls with and the short code the person types
-- on their phone, both kept only as hashes. A request is pending until a signed-in parent's phone
-- approves or denies it, and 'consumed' once the TV has taken its session, which can happen once.
-- A phone that looks a code up holds it for a few minutes (locked_by, locked_until): no other
-- account can approve it meanwhile. Rows are purged soon after they expire, by the Worker's cron
-- trigger.
CREATE TABLE tv_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_code_hash TEXT NOT NULL UNIQUE,
    user_code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
    label TEXT NOT NULL,
    country TEXT,
    -- A keyed hash of the network the request came from (an IPv6 address counts as its /64): how
    -- many requests one source may hold open. The address itself is not kept.
    source_hash TEXT NOT NULL,
    -- The wider network (an IPv4 /24, an IPv6 /48), keyed the same way: its share of the open requests.
    prefix_hash TEXT NOT NULL,
    interval_s INTEGER NOT NULL,
    last_polled_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_until INTEGER,
    account_uid TEXT,
    learner_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    approved_at INTEGER,
    -- Who approved, as the TV shows it to the person there: the account's address with most of it
    -- hidden, and the approving phone's label and country.
    approved_hint TEXT,
    approved_label TEXT,
    approved_country TEXT,
    CHECK (status NOT IN ('approved', 'consumed') OR (account_uid IS NOT NULL AND learner_id IS NOT NULL))
);

-- A short code names one open request at a time.
CREATE UNIQUE INDEX tv_links_open_user_code ON tv_links (user_code_hash) WHERE status = 'pending';
CREATE INDEX tv_links_expiry ON tv_links (expires_at);
CREATE INDEX tv_links_source ON tv_links (source_hash) WHERE status = 'pending';
CREATE INDEX tv_links_prefix ON tv_links (prefix_hash) WHERE status = 'pending';
-- Requests made from a network in the last hour, whatever became of them.
CREATE INDEX tv_links_prefix_created ON tv_links (prefix_hash, created_at);
CREATE INDEX tv_links_country ON tv_links (country) WHERE status = 'pending';

-- A TV that signed in: the credential it renews its session with, kept as a hash. It changes at
-- every renewal, to a successor that follows from the one it replaces. The one it replaced
-- (prev_hash) is answered again, with the same successor, up to twice within a minute, in case the
-- answer was lost; after that, or when it is the one before (prev2_hash), it is a copy and revokes
-- the TV. It is the account's to list and
-- revoke, ends after 90 days or 30 days unused, and its sessions last an hour.
CREATE TABLE tv_sessions (
    id TEXT PRIMARY KEY,
    refresh_hash TEXT NOT NULL UNIQUE,
    prev_hash TEXT,
    prev2_hash TEXT,
    rotated_at INTEGER,
    grace_used INTEGER NOT NULL DEFAULT 0,
    account_uid TEXT NOT NULL,
    learner_id TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    -- Set at the first renewal: a TV that took its session and never renewed it may have lost the
    -- answer, and its credential is revoked a week after its first token ended.
    renewed_at INTEGER
);

CREATE INDEX tv_sessions_account ON tv_sessions (account_uid);
CREATE INDEX tv_sessions_expiry ON tv_sessions (expires_at);
CREATE INDEX tv_sessions_prev ON tv_sessions (prev_hash) WHERE prev_hash IS NOT NULL;
