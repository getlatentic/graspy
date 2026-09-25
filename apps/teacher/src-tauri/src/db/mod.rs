mod command_threading;
mod migrations;

use std::{fs, path::Path, sync::Mutex, time::Duration};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Default)]
pub struct Database {
    connection: Mutex<Option<Connection>>,
}

/// Why the lesson library could not be opened.
///
/// A library written by a newer graspy is told apart from every other failure
/// because it is the one case a teacher resolves by updating rather than by
/// reporting it.
#[derive(Debug)]
pub enum DatabaseInitError {
    NeedsAppUpdate { recorded: i64, supported: i64 },
    Unavailable(String),
}

impl std::fmt::Display for DatabaseInitError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NeedsAppUpdate {
                recorded,
                supported,
            } => write!(
                formatter,
                "The lesson library was created by a newer version of graspy \
                 (library version {recorded}, this app supports up to {supported})."
            ),
            Self::Unavailable(detail) => formatter.write_str(detail),
        }
    }
}

#[cfg(test)]
pub(crate) fn newest_known_schema_version() -> i64 {
    migrations::newest_known_version()
}

fn configure_connection(connection: &Connection) -> rusqlite::Result<()> {
    connection.busy_timeout(BUSY_TIMEOUT)?;
    connection.pragma_update_and_check(None, "journal_mode", "wal", |_| Ok(()))?;
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

impl Database {
    pub fn init_from_app(&self, app: &AppHandle) -> Result<(), DatabaseInitError> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| DatabaseInitError::Unavailable(error.to_string()))?;
        fs::create_dir_all(&data_dir)
            .map_err(|error| DatabaseInitError::Unavailable(error.to_string()))?;
        self.init_at(&data_dir.join("graspy.sqlite"))
    }

    fn init_at(&self, path: &Path) -> Result<(), DatabaseInitError> {
        let unavailable =
            |error: &dyn std::fmt::Display| DatabaseInitError::Unavailable(error.to_string());
        let mut connection = Connection::open(path).map_err(|error| unavailable(&error))?;
        configure_connection(&connection).map_err(|error| unavailable(&error))?;
        let recorded =
            migrations::recorded_version(&connection).map_err(|error| unavailable(&error))?;
        let supported = migrations::newest_known_version();
        if recorded > supported {
            return Err(DatabaseInitError::NeedsAppUpdate {
                recorded,
                supported,
            });
        }
        migrations::apply(&mut connection).map_err(|error| unavailable(&error))?;
        *self
            .connection
            .lock()
            .map_err(|error| unavailable(&error))? = Some(connection);
        Ok(())
    }

    pub fn with_connection<T, E>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, E>,
    ) -> Result<T, String>
    where
        E: std::fmt::Display,
    {
        let connection = self.connection.lock().map_err(|error| error.to_string())?;
        let connection = connection
            .as_ref()
            .ok_or_else(|| "The local database is not initialized.".to_owned())?;
        operation(connection).map_err(|error| error.to_string())
    }

    pub fn with_connection_mut<T, E>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, E>,
    ) -> Result<T, String>
    where
        E: std::fmt::Display,
    {
        let mut connection = self.connection.lock().map_err(|error| error.to_string())?;
        let connection = connection
            .as_mut()
            .ok_or_else(|| "The local database is not initialized.".to_owned())?;
        operation(connection).map_err(|error| error.to_string())
    }

    /// The library a release that stopped at `ceiling` would have left behind.
    #[cfg(test)]
    pub(crate) fn in_memory_through(ceiling: i64) -> Self {
        let database = Self::default();
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        configure_connection(&connection).expect("connection settings");
        migrations::apply_through(&mut connection, ceiling).expect("database migrations");
        *database.connection.lock().expect("database connection") = Some(connection);
        database
    }

    /// Upgrade an already-open library, the way a first launch after an update does.
    #[cfg(test)]
    pub(crate) fn upgrade_to_current_schema(&self) -> Result<(), String> {
        self.with_connection_mut(migrations::apply)
    }

    #[cfg(test)]
    pub(crate) fn in_memory() -> Self {
        let database = Self::default();
        let mut connection = Connection::open_in_memory().expect("in-memory database");
        migrations::apply(&mut connection).expect("database migrations");
        *database.connection.lock().expect("database connection") = Some(connection);
        database
    }
}

#[cfg(test)]
mod tests {
    use super::Database;

    #[test]
    fn initializes_the_local_schema() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database = Database::default();

        database
            .init_at(&directory.path().join("test.sqlite"))
            .expect("database initialization");

        let migration_count = database
            .with_connection(|connection| {
                connection.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                    row.get::<_, i64>(0)
                })
            })
            .expect("migration count");
        assert_eq!(migration_count, super::migrations::newest_known_version());
    }

    #[test]
    fn upgrades_a_database_created_before_versioned_migrations() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("legacy.sqlite");
        let legacy = rusqlite::Connection::open(&path).expect("legacy database");
        legacy
            .execute_batch(
                "CREATE TABLE app_metadata (
                    key TEXT PRIMARY KEY NOT NULL,
                    value TEXT NOT NULL
                );",
            )
            .expect("legacy schema");
        drop(legacy);

        let database = Database::default();
        database.init_at(&path).expect("database upgrade");

        let grade_count = database
            .with_connection(|connection| {
                connection.query_row("SELECT COUNT(*) FROM grade_levels", [], |row| {
                    row.get::<_, i64>(0)
                })
            })
            .expect("grade count");
        assert_eq!(grade_count, 27);
    }
}
