CREATE TABLE model_installations (
    manifest_id TEXT PRIMARY KEY NOT NULL,
    repository TEXT NOT NULL,
    revision TEXT NOT NULL,
    file_name TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    sha256 TEXT NOT NULL,
    artifact_license TEXT NOT NULL,
    artifact_license_url TEXT NOT NULL,
    upstream_terms_url TEXT NOT NULL,
    installed_file_size INTEGER NOT NULL CHECK (installed_file_size > 0),
    installed_file_modified_ns INTEGER NOT NULL,
    verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
