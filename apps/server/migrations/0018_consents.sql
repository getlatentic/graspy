-- A parent's consent for one learner, of two kinds: to use graspy at all ('service'), and to keep
-- the learner's voice recordings ('recordings', for retention_days). A grant is a row; revoking sets
-- revoked_at. Granting again first revokes the row it replaces, so at most one row of a scope is
-- active for a learner.
CREATE TABLE consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    learner_key TEXT NOT NULL,
    account_uid TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('service', 'recordings')),
    notice_version INTEGER NOT NULL,
    retention_days INTEGER,
    granted_at INTEGER NOT NULL,
    revoked_at INTEGER,
    CHECK (
        (scope = 'recordings' AND retention_days IN (30, 90, 365))
        OR (scope = 'service' AND retention_days IS NULL)
    )
);

CREATE UNIQUE INDEX consents_active ON consents (learner_key, scope)
    WHERE revoked_at IS NULL;
CREATE INDEX consents_account ON consents (account_uid);
