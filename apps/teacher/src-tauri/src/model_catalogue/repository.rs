use rusqlite::{params, OptionalExtension};

use crate::db::Database;

use super::domain::{self, LessonModel};

/// The model a teacher chose, or the default when they have not chosen.
///
/// A stored id the catalogue no longer knows resolves to the default: a model
/// withdrawn in a later release must leave the teacher working, and the next
/// save records the resolved choice.
pub fn selected_model(database: &Database) -> Result<&'static LessonModel, String> {
    let stored: Option<String> = database.with_connection(|connection| {
        connection
            .query_row(
                "SELECT model_id FROM selected_lesson_model WHERE singleton_id = 1",
                [],
                |row| row.get(0),
            )
            .optional()
    })?;

    Ok(stored
        .as_deref()
        .and_then(domain::find)
        .filter(|model| model.is_offered())
        .unwrap_or_else(domain::default_model))
}

/// The identity stamped on everything the running model produces.
///
/// A lesson carries the name of the model that wrote it, so a lesson written on
/// the lighter choice is never later read as having come from the fuller one.
pub fn selected_model_identity(database: &Database) -> Result<&'static str, String> {
    selected_model(database).map(|model| model.manifest.id)
}

pub fn save_selection(database: &Database, model: &LessonModel) -> Result<(), String> {
    database.with_connection(|connection| {
        connection.execute(
            "INSERT INTO selected_lesson_model (singleton_id, model_id)
             VALUES (1, ?1)
             ON CONFLICT(singleton_id) DO UPDATE SET
                 model_id = excluded.model_id,
                 selected_at = CURRENT_TIMESTAMP",
            params![model.manifest.id],
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn database() -> Database {
        Database::in_memory()
    }

    #[test]
    fn a_teacher_who_has_not_chosen_gets_the_default() {
        let database = database();
        assert_eq!(
            selected_model(&database).expect("a selection").manifest.id,
            domain::default_model().manifest.id,
        );
    }

    #[test]
    fn a_choice_survives_being_read_back() {
        let database = database();
        save_selection(&database, domain::default_model()).expect("saved");
        assert_eq!(
            selected_model(&database).expect("a selection").manifest.id,
            domain::default_model().manifest.id,
        );
    }

    #[test]
    fn choosing_twice_replaces_rather_than_accumulates() {
        let database = database();
        save_selection(&database, domain::default_model()).expect("saved");
        save_selection(&database, domain::default_model()).expect("saved again");

        let rows: i64 = database
            .with_connection(|connection| {
                connection.query_row("SELECT COUNT(*) FROM selected_lesson_model", [], |row| {
                    row.get(0)
                })
            })
            .expect("counted");
        assert_eq!(rows, 1);
    }

    /// A model withdrawn from the catalogue between releases must not strand the
    /// teacher on a choice the program can no longer run.
    #[test]
    fn a_stored_model_the_catalogue_no_longer_knows_falls_back_to_the_default() {
        let database = database();
        database
            .with_connection(|connection| {
                connection.execute(
                    "INSERT INTO selected_lesson_model (singleton_id, model_id) VALUES (1, ?1)",
                    params!["a-model-from-a-later-release"],
                )
            })
            .expect("stored");

        assert_eq!(
            selected_model(&database).expect("a selection").manifest.id,
            domain::default_model().manifest.id,
        );
    }

    /// The same rule for a model that is still in the catalogue but has not
    /// passed its qualification — it cannot become the running model by having
    /// been chosen before it was withdrawn from the picker.
    #[test]
    fn a_stored_model_that_is_no_longer_offered_falls_back_to_the_default() {
        let database = database();
        let unqualified = domain::CATALOGUE
            .iter()
            .find(|model| !model.is_offered())
            .expect("the catalogue carries an unqualified model");
        database
            .with_connection(|connection| {
                connection.execute(
                    "INSERT INTO selected_lesson_model (singleton_id, model_id) VALUES (1, ?1)",
                    params![unqualified.manifest.id],
                )
            })
            .expect("stored");

        assert_eq!(
            selected_model(&database).expect("a selection").manifest.id,
            domain::default_model().manifest.id,
        );
    }
}
