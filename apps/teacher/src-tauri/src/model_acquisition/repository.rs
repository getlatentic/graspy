use rusqlite::{params, OptionalExtension};

use crate::db::Database;

use super::domain::{ModelFile, ModelManifest};

#[derive(Debug, PartialEq, Eq)]
pub struct VerifiedInstallation {
    pub installed_file_size: u64,
    pub installed_file_modified_ns: i64,
}

pub fn find_verified(
    database: &Database,
    manifest: ModelManifest,
    file: ModelFile,
) -> Result<Option<VerifiedInstallation>, String> {
    database.with_connection(|connection| {
        connection
            .query_row(
                "SELECT installed_file_size, installed_file_modified_ns
                 FROM model_installations
                 WHERE manifest_id = ?1
                   AND repository = ?2
                   AND revision = ?3
                   AND file_name = ?4
                   AND byte_size = ?5
                   AND sha256 = ?6
                   AND artifact_license = ?7
                   AND artifact_license_url = ?8
                   AND upstream_terms_url = ?9",
                params![
                    manifest.id,
                    manifest.repository,
                    manifest.revision,
                    file.file_name,
                    file.byte_size as i64,
                    file.sha256,
                    manifest.artifact_license,
                    manifest.artifact_license_url,
                    manifest.upstream_terms_url,
                ],
                |row| {
                    Ok(VerifiedInstallation {
                        installed_file_size: row.get::<_, i64>(0)? as u64,
                        installed_file_modified_ns: row.get(1)?,
                    })
                },
            )
            .optional()
    })
}

pub fn save_verified(
    database: &Database,
    manifest: ModelManifest,
    file: ModelFile,
    file_size: u64,
    file_modified_ns: i64,
) -> Result<(), String> {
    database.with_connection(|connection| {
        connection.execute(
            "INSERT INTO model_installations (
                manifest_id, repository, revision, file_name, byte_size, sha256,
                artifact_license, artifact_license_url, upstream_terms_url,
                installed_file_size, installed_file_modified_ns
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(manifest_id, file_name) DO UPDATE SET
                repository = excluded.repository,
                revision = excluded.revision,
                byte_size = excluded.byte_size,
                sha256 = excluded.sha256,
                artifact_license = excluded.artifact_license,
                artifact_license_url = excluded.artifact_license_url,
                upstream_terms_url = excluded.upstream_terms_url,
                installed_file_size = excluded.installed_file_size,
                installed_file_modified_ns = excluded.installed_file_modified_ns,
                verified_at = CURRENT_TIMESTAMP",
            params![
                manifest.id,
                manifest.repository,
                manifest.revision,
                file.file_name,
                file.byte_size as i64,
                file.sha256,
                manifest.artifact_license,
                manifest.artifact_license_url,
                manifest.upstream_terms_url,
                file_size as i64,
                file_modified_ns,
            ],
        )?;
        Ok::<(), rusqlite::Error>(())
    })
}

/// Forgets a file graspy can no longer prove, leaving the model's other files
/// alone: a projector that went missing does not make the weights unproven.
pub fn remove_verified(database: &Database, manifest_id: &str, file_name: &str) -> Result<(), String> {
    database.with_connection(|connection| {
        connection.execute(
            "DELETE FROM model_installations WHERE manifest_id = ?1 AND file_name = ?2",
            [manifest_id, file_name],
        )?;
        Ok::<(), rusqlite::Error>(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_catalogue::ModelFile;

    fn a_model() -> ModelManifest {
        crate::model_catalogue::default_model().manifest
    }

    /// A model can need more than one file, and proving one must not be taken
    /// as proof of another: the weights and the projector are recorded apart.
    #[test]
    fn each_file_a_model_needs_is_recorded_on_its_own() {
        let database = crate::db::Database::in_memory();
        let manifest = a_model();
        let projector = manifest.sight.expect("a projector");

        save_verified(&database, manifest, manifest.weights(), 10, 1).expect("the weights");
        save_verified(&database, manifest, projector, 20, 2).expect("the projector");

        assert_eq!(
            find_verified(&database, manifest, manifest.weights())
                .expect("a record")
                .map(|found| found.installed_file_size),
            Some(10),
        );
        assert_eq!(
            find_verified(&database, manifest, projector)
                .expect("a record")
                .map(|found| found.installed_file_size),
            Some(20),
        );
    }

    /// Forgetting one file leaves the others proved. A projector a teacher
    /// deleted does not make the weights unproven and the engine unstartable.
    #[test]
    fn forgetting_one_file_leaves_the_others_proved() {
        let database = crate::db::Database::in_memory();
        let manifest = a_model();
        let projector = manifest.sight.expect("a projector");
        save_verified(&database, manifest, manifest.weights(), 10, 1).expect("the weights");
        save_verified(&database, manifest, projector, 20, 2).expect("the projector");

        remove_verified(&database, manifest.id, projector.file_name).expect("forgotten");

        assert!(find_verified(&database, manifest, manifest.weights())
            .expect("a record")
            .is_some());
        assert!(find_verified(&database, manifest, projector)
            .expect("no record")
            .is_none());
    }

    /// A record only answers for the file it was written for, so a file whose
    /// pinned identity has moved on is not read as already installed.
    #[test]
    fn a_record_does_not_answer_for_a_file_it_was_not_written_for() {
        let database = crate::db::Database::in_memory();
        let manifest = a_model();
        save_verified(&database, manifest, manifest.weights(), 10, 1).expect("the weights");

        let moved_on = ModelFile {
            sha256: "0000000000000000000000000000000000000000000000000000000000000000",
            ..manifest.weights()
        };

        assert!(find_verified(&database, manifest, moved_on)
            .expect("no record")
            .is_none());
    }
}
