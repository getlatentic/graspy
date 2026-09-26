CREATE TABLE oauth_authorizations (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    client_name TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

ALTER TABLE review_audit ADD COLUMN rows_json TEXT NOT NULL DEFAULT '[]';
