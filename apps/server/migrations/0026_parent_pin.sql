-- The parent PIN (docs/PARENT_PIN.md): what a parent types, in place of signing in with Google
-- again, for what only the parent may do.
--
-- One row per account. The PIN is never kept: `hash` is PBKDF2-HMAC-SHA256 over a keyed digest of
-- the PIN (the key is derived from the server's secret, so a copy of this table cannot be
-- guessed against), with this row's own random `salt`. `pepper_id` names the key the hash was made
-- with, so a rotated secret is seen as "no PIN" and the parent is not left to burn attempts.
-- `kdf` and `kdf_version` name the function and its parameters' version, so changing them needs no
-- table rebuild.
--
-- The attempt counters are the lockout, and they belong to the account, not to a session or a
-- device, so a new learner session or a new phone does not reset them:
--   failed_count  wrong PINs since the last lock or success;
--   lockouts      how long the next lock lasts (it decays one rung per 7 clean days, a success
--                 does not clear it); last_failed_at is when the last lock began;
--   proof_locks   locks since the last Google proof; at three the PIN is `disabled` until the
--                 parent proves themselves with Google again (which sets a new PIN);
--   locked_until  when the lock ends.
CREATE TABLE parent_pins (
    account_uid TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    kdf TEXT NOT NULL,
    kdf_version INTEGER NOT NULL DEFAULT 1,
    iterations INTEGER NOT NULL CHECK (iterations > 0),
    pepper_id TEXT NOT NULL,
    pin_length INTEGER NOT NULL CHECK (pin_length BETWEEN 6 AND 8),
    -- The account's address with most of it hidden, as the Google sign-in that set the PIN gave
    -- it: a parent's session made from the PIN carries it, for the TV to show who approved.
    hint TEXT,
    -- A parent's session made before this ends with it: setting a PIN revokes them.
    set_at INTEGER NOT NULL,
    failed_count INTEGER NOT NULL DEFAULT 0,
    lockouts INTEGER NOT NULL DEFAULT 0,
    proof_locks INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    last_failed_at INTEGER
);

-- What happened to an account's PIN, for its parent to read on their next Google-proved visit: a
-- child burning guesses shows here. A row is acknowledged only by a parent's session made from
-- Google, so a child cannot clear it. The newest 50 of an account are kept.
CREATE TABLE pin_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_uid TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('locked', 'disabled', 'set', 'reset', 'tv_linked', 'consent')),
    at INTEGER NOT NULL,
    -- How many: the wrong PINs of a lock, or the TVs a reset signed out.
    count INTEGER,
    acknowledged_at INTEGER
);
CREATE INDEX pin_events_account ON pin_events (account_uid, id);

-- Which way the parent proved themselves when they agreed: 'google' (a sign-in just made) or 'pin',
-- and when (`proved_at`, milliseconds: the start of the parent's session, or of the Google
-- sign-in). A PIN is weaker evidence of a parent's agreement than a fresh sign-in with Google, so
-- the record says which it was. Every consent kept so far was given with Google.
ALTER TABLE consents ADD COLUMN gate TEXT NOT NULL DEFAULT 'google' CHECK (gate IN ('pin', 'google'));
ALTER TABLE consents ADD COLUMN proved_at INTEGER;

-- Which gate the parent passed to approve a TV: a PIN reset by Google signs out the TVs linked
-- under the PIN.
ALTER TABLE tv_links ADD COLUMN approved_gate TEXT;
ALTER TABLE tv_sessions ADD COLUMN gate TEXT NOT NULL DEFAULT 'google' CHECK (gate IN ('pin', 'google'));
