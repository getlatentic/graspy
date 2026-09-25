-- A model can need more than its weights: the one graspy ships also carries the
-- projector that lets it read a photograph. Each file is downloaded, proved and
-- recorded on its own, so the record is keyed by the file rather than the model.
CREATE TABLE model_installations_rebuilt (
    manifest_id TEXT NOT NULL,
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
    verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (manifest_id, file_name)
);

INSERT INTO model_installations_rebuilt (
    manifest_id, repository, revision, file_name, byte_size, sha256,
    artifact_license, artifact_license_url, upstream_terms_url,
    installed_file_size, installed_file_modified_ns, verified_at
)
SELECT manifest_id, repository, revision, file_name, byte_size, sha256,
       artifact_license, artifact_license_url, upstream_terms_url,
       installed_file_size, installed_file_modified_ns, verified_at
FROM model_installations;

DROP TABLE model_installations;
ALTER TABLE model_installations_rebuilt RENAME TO model_installations;
