CREATE TABLE review_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    reviewer TEXT NOT NULL,
    tool TEXT NOT NULL,
    arguments_json TEXT NOT NULL CHECK (json_valid(arguments_json)),
    row_count INTEGER NOT NULL
);

CREATE INDEX review_audit_reviewer_at ON review_audit (reviewer, at);
