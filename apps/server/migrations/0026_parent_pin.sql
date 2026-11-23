-- The parent PIN (docs/PARENT_PIN.md): what a parent types, in place of signing in with Google
-- again, for what only the parent may do.
--
-- One row per account. The PIN is never kept: `hash` is PBKDF2-HMAC-SHA256 over a keyed digest of
-- the PIN (the key is derived from the server's secret, so a copy of this table cannot be
-- guessed against), with this row's own random `salt`. The attempt counters are the lockout:
-- `failed_count` wrong PINs since the last lock or success, `lockouts` how many times it has
-- locked since the last success (which sets how long the next lock lasts), `locked_until` when
-- the lock ends. They belong to the account, not to a session or a device, so a new learner
-- session or a new phone does not reset them.
CREATE TABLE parent_pins (
    account_uid TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    kdf TEXT NOT NULL CHECK (kdf IN ('pbkdf2-sha256')),
    iterations INTEGER NOT NULL CHECK (iterations > 0),
    pin_length INTEGER NOT NULL CHECK (pin_length BETWEEN 4 AND 8),
    -- The account's address with most of it hidden, as the Google sign-in that set the PIN gave
    -- it: a parent's session made from the PIN carries it, for the TV to show who approved.
    hint TEXT,
    -- A parent's session made before this ends with it: setting a PIN revokes them.
    set_at INTEGER NOT NULL,
    failed_count INTEGER NOT NULL DEFAULT 0,
    lockouts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    last_failed_at INTEGER
);

-- Which way the parent proved themselves when they agreed: 'google' (a sign-in just made) or 'pin'.
-- A PIN is weaker evidence of a parent's agreement than a fresh sign-in with Google, so the
-- record says which it was. Every consent kept so far was given with Google.
ALTER TABLE consents ADD COLUMN gate TEXT NOT NULL DEFAULT 'google' CHECK (gate IN ('pin', 'google'));
