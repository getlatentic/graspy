use rusqlite::{params, Connection, OptionalExtension};

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("migrations/001_academic_workspace.sql")),
    (
        2,
        include_str!("migrations/002_curriculum_and_scheme_of_work.sql"),
    ),
    (3, include_str!("migrations/003_scheme_templates.sql")),
    (4, include_str!("migrations/004_lesson_planning.sql")),
    (5, include_str!("migrations/005_lesson_preparation.sql")),
    (6, include_str!("migrations/006_lesson_materials.sql")),
    (
        7,
        include_str!("migrations/007_published_lesson_sources.sql"),
    ),
    (
        8,
        include_str!("migrations/008_lesson_material_quality.sql"),
    ),
    (
        9,
        include_str!("migrations/009_lesson_material_documents.sql"),
    ),
    (10, include_str!("migrations/010_lesson_evidence.sql")),
    (
        11,
        include_str!("migrations/011_differentiated_materials.sql"),
    ),
    (12, include_str!("migrations/012_model_installations.sql")),
    (
        13,
        include_str!("migrations/013_lesson_material_editing.sql"),
    ),
    (
        14,
        include_str!("migrations/014_lesson_material_section_regeneration.sql"),
    ),
    (
        15,
        include_str!("migrations/015_multi_jurisdiction_curriculum.sql"),
    ),
    (16, include_str!("migrations/016_curriculum_packages.sql")),
    (
        17,
        include_str!("migrations/017_granular_curriculum_pacing.sql"),
    ),
    (18, include_str!("migrations/018_content_rights_basis.sql")),
    (
        19,
        include_str!("migrations/019_curriculum_package_origin.sql"),
    ),
    (20, include_str!("migrations/020_scheme_package_origin.sql")),
    (
        21,
        include_str!("migrations/021_generation_program_runtime.sql"),
    ),
    (
        22,
        include_str!("migrations/022_granular_lesson_planning.sql"),
    ),
    (
        23,
        include_str!("migrations/023_lesson_curriculum_nodes.sql"),
    ),
    (
        24,
        include_str!("migrations/024_teacher_authored_curriculum.sql"),
    ),
    (
        25,
        include_str!("migrations/025_curriculum_package_revision.sql"),
    ),
    (
        26,
        include_str!("migrations/026_generation_run_correlation.sql"),
    ),
    (
        27,
        include_str!("migrations/027_recover_swallowed_mathematics.sql"),
    ),
    (
        28,
        include_str!("migrations/028_restore_missing_knowledge_alignments.sql"),
    ),
    (
        29,
        include_str!("migrations/029_restore_missing_knowledge_types.sql"),
    ),
    (
        30,
        include_str!("migrations/030_authored_lesson_content.sql"),
    ),
    (
        31,
        include_str!("migrations/031_one_lesson_per_scheme_entry.sql"),
    ),
    (32, include_str!("migrations/032_student_lesson_notes.sql")),
    (33, include_str!("migrations/033_lesson_packs.sql")),
    (34, include_str!("migrations/034_background_tasks.sql")),
    (
        35,
        include_str!("migrations/035_queued_background_tasks.sql"),
    ),
    (36, include_str!("migrations/036_selected_lesson_model.sql")),
    (
        37,
        include_str!("migrations/037_materials_a_teacher_can_bring.sql"),
    ),
    (
        38,
        include_str!("migrations/038_node_runs_record_a_fanned_out_stage.sql"),
    ),
    (
        39,
        include_str!("migrations/039_retire_the_slides_pack.sql"),
    ),
    (
        40,
        include_str!("migrations/040_forget_retired_slides_runs.sql"),
    ),
    (
        41,
        include_str!("migrations/041_a_teacher_can_clear_work_they_have_read.sql"),
    ),
    (
        42,
        include_str!("migrations/042_a_lesson_plan_a_school_recognises.sql"),
    ),
    (
        43,
        include_str!("migrations/043_a_class_is_taught_on_a_day_at_a_period.sql"),
    ),
    (
        44,
        include_str!("migrations/044_a_school_day_has_a_shape.sql"),
    ),
    (
        45,
        include_str!("migrations/045_a_school_keeps_its_own_week.sql"),
    ),
    (
        46,
        include_str!("migrations/046_one_word_for_the_classwork.sql"),
    ),
    (
        47,
        include_str!("migrations/047_a_version_keeps_its_content_once.sql"),
    ),
    (
        48,
        include_str!("migrations/048_a_lessons_steps_live_in_its_plan.sql"),
    ),
    (
        49,
        include_str!("migrations/049_a_planned_lesson_reads_its_plan.sql"),
    ),
    (
        50,
        include_str!("migrations/050_a_plan_covers_a_week_or_one_subtopic.sql"),
    ),
    (
        51,
        include_str!("migrations/051_a_preparation_reads_its_plan.sql"),
    ),
    (
        52,
        include_str!("migrations/052_a_lessons_format_is_whether_it_has_a_plan.sql"),
    ),
    (
        53,
        include_str!("migrations/053_a_model_records_every_file_it_needs.sql"),
    ),
    (
        54,
        include_str!("migrations/054_an_evaluation_says_what_it_scored_on.sql"),
    ),
    (
        55,
        include_str!("migrations/055_a_reviewer_can_correct_a_score.sql"),
    ),
];

pub(super) fn newest_known_version() -> i64 {
    MIGRATIONS.last().map(|(version, _)| *version).unwrap_or(0)
}

pub(super) fn recorded_version(connection: &Connection) -> rusqlite::Result<i64> {
    let table_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations')",
        [],
        |row| row.get(0),
    )?;
    if !table_exists {
        return Ok(0);
    }
    connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
}

pub(super) fn apply(connection: &mut Connection) -> rusqlite::Result<()> {
    apply_through(connection, newest_known_version())
}

/// Migrate up to `ceiling`, so a test can build the library a previous release
/// left behind and then upgrade it the way a first launch does.
pub(super) fn apply_through(connection: &mut Connection, ceiling: i64) -> rusqlite::Result<()> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS schema_migrations (
             version INTEGER PRIMARY KEY NOT NULL,
             applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         );",
    )?;

    for (version, sql) in MIGRATIONS {
        if *version > ceiling {
            break;
        }
        let applied = connection
            .query_row(
                "SELECT version FROM schema_migrations WHERE version = ?1",
                params![version],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();
        if applied {
            continue;
        }

        if matches!(*version, 15 | 17 | 18 | 23 | 25) {
            apply_with_foreign_keys_disabled(connection, *version, sql)?;
        } else if matches!(*version, 38 | 48 | 50 | 52) {
            // A table rebuild needs foreign keys off — PRAGMA foreign_keys is
            // ignored inside a transaction, so the drop must run outside one —
            // but it rewrites no relationship, and the whole-database check the
            // other rebuilds run would fail on rows that were already dangling
            // before it ran. Each carries its own rows across and recreates its
            // own triggers and indexes, which is what the checkpoint tests hold
            // them to.
            apply_outside_a_transaction(connection, *version, sql)?;
        } else {
            let transaction = connection.transaction()?;
            transaction.execute_batch(sql)?;
            transaction.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                params![version],
            )?;
            transaction.commit()?;
        }
    }

    Ok(())
}

/// Apply a rebuild that must not be wrapped in a transaction, because SQLite
/// ignores `PRAGMA foreign_keys` inside one and the drop would meet live keys.
fn apply_outside_a_transaction(
    connection: &mut Connection,
    version: i64,
    sql: &str,
) -> rusqlite::Result<()> {
    connection.pragma_update(None, "foreign_keys", "OFF")?;
    let applied = (|| {
        connection.execute_batch(sql)?;
        connection.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            params![version],
        )
    })();
    connection.pragma_update(None, "foreign_keys", "ON")?;
    applied?;
    Ok(())
}

fn apply_with_foreign_keys_disabled(
    connection: &mut Connection,
    version: i64,
    sql: &str,
) -> rusqlite::Result<()> {
    connection.pragma_update(None, "foreign_keys", "OFF")?;
    let migration_result = (|| {
        let transaction = connection.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            params![version],
        )?;
        transaction.commit()
    })();
    connection.pragma_update(None, "foreign_keys", "ON")?;
    migration_result?;

    let foreign_key_error = connection
        .prepare("PRAGMA foreign_key_check")?
        .query_row([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .optional()?;
    if let Some((table, row_id, parent)) = foreign_key_error {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "migration {version} left an invalid foreign key: {table} row {row_id} references {parent}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every migration file has to be registered by hand in MIGRATIONS, and a
    /// file that is written but not listed does nothing while looking done.
    /// That is the one failure this hand-rolled scheme has that a
    /// directory-scanning library would not, so a test closes it.
    #[test]
    fn every_migration_file_is_registered_and_every_registration_has_a_file() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/db/migrations");
        let mut on_disk: Vec<String> = std::fs::read_dir(&directory)
            .expect("the migrations directory")
            .map(|entry| entry.expect("a directory entry").file_name())
            .filter_map(|name| name.to_str().map(str::to_owned))
            .filter(|name| name.ends_with(".sql"))
            .collect();
        on_disk.sort();

        assert_eq!(
            on_disk.len(),
            MIGRATIONS.len(),
            "{} migration files on disk, {} registered — a file written but not \
             listed in MIGRATIONS never runs",
            on_disk.len(),
            MIGRATIONS.len(),
        );

        for (index, (version, _)) in MIGRATIONS.iter().enumerate() {
            assert_eq!(
                *version,
                index as i64 + 1,
                "migration versions must run 1..n without a gap or a repeat",
            );
            let expected_prefix = format!("{version:03}_");
            assert!(
                on_disk[index].starts_with(&expected_prefix),
                "registration {version} does not line up with {} on disk",
                on_disk[index],
            );
        }
    }

    /// A rename that stopped at the schema would leave a teacher's stopped run
    /// listed under a kind no screen knows, so "Open" would land on the plan
    /// rather than the classwork they left running — and nothing would fail.
    #[test]
    fn the_rename_carries_a_running_teachers_work_across_with_it() {
        let database = crate::db::Database::in_memory_through(45);
        database
            .with_connection(|connection| {
                connection.execute_batch("PRAGMA foreign_keys = OFF")?;
                connection.execute(
                    "INSERT INTO background_tasks (id, kind, academic_session_id,
                         academic_period_id, teaching_assignment_id, lesson_id, label, status)
                     VALUES ('task', 'lesson_materials', 'session', 'period', 'assignment',
                         'lesson', 'Creating materials — Trillions', 'running')",
                    [],
                )
            })
            .expect("a library left by a previous release");

        database
            .upgrade_to_current_schema()
            .expect("upgrade to the current schema");

        let (kind, label): (String, String) = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT kind, label FROM background_tasks WHERE id = 'task'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
            })
            .expect("the row read back");

        assert_eq!(kind, "classwork");
        assert_eq!(label, "Creating the classwork — Trillions");
    }

    /// A lesson written by hand is stored as the teacher's own document and
    /// read straight onto the editing screen. Left under the old key, their
    /// list of aids would come back empty on a screen that had them yesterday.
    #[test]
    fn the_rename_reaches_inside_a_hand_written_lesson() {
        let database = crate::db::Database::in_memory_through(45);
        database
            .with_connection(|connection| {
                connection.execute_batch("PRAGMA foreign_keys = OFF")?;
                connection.execute(
                    "INSERT INTO lesson_authored_content (lesson_id, content)
                     VALUES ('lesson', json('{\"objectives\":[],\"materials\":[\"Fraction wall\"]}'))",
                    [],
                )
            })
            .expect("a lesson written by hand under a previous release");

        database
            .upgrade_to_current_schema()
            .expect("upgrade to the current schema");

        let (aid, old_key): (String, Option<String>) = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT json_extract(content, '$.instructionalMaterials[0]'),
                            json_extract(content, '$.materials')
                     FROM lesson_authored_content WHERE lesson_id = 'lesson'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
            })
            .expect("the lesson read back");

        assert_eq!(aid, "Fraction wall");
        assert_eq!(old_key, None, "the old key outlived the rename");
    }

    /// Found on screen in the packaged app: a lesson listing
    /// "ebw-jss1-01-007.png" under Materials — a source file graspy drew the
    /// lesson from, handed to a teacher as something to bring to class.
    /// Generation refuses these now; lessons written before it still carried
    /// them.
    #[test]
    fn the_upgrade_drops_source_filenames_and_keeps_the_aids_beside_them() {
        let database = crate::db::Database::in_memory_through(36);
        database
            .with_connection(|connection| {
                // The fixture is about one column's contents, not about which
                // class the lesson belongs to, so it does not build a workspace
                // around it.
                connection.execute_batch("PRAGMA foreign_keys = OFF")?;
                connection.execute(
                    "INSERT INTO lessons (
                         id, academic_session_id, academic_period_id, teaching_assignment_id,
                         input_mode, raw_plan, topic, learning_goals, materials, assessment,
                         reference_notes, status
                     ) VALUES (
                         'lesson-mixed', 'session', 'period', 'assignment',
                         'pasted', 'Count in millions.', 'Whole numbers', json('[]'),
                         json('[\"Number cards\", \"ebw-jss1-01-007.png\", \"Place value chart\"]'),
                         json('[]'), json('[]'), 'draft'
                     )",
                    [],
                )
            })
            .expect("a lesson written before the generator refused source files");

        database
            .upgrade_to_current_schema()
            .expect("upgrade to the current schema");

        let instructional_materials: String = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT CAST(instructional_materials AS TEXT) FROM lessons WHERE id = 'lesson-mixed'",
                    [],
                    |row| row.get(0),
                )
            })
            .expect("instructional_materials read back");

        assert!(
            !instructional_materials.contains(".png"),
            "a source filename survived: {instructional_materials}"
        );
        // The aids either side of it are the point: a migration that emptied the
        // list would have passed the first assertion and lost the teacher's work.
        assert!(
            instructional_materials.contains("Number cards"),
            "an aid was lost: {instructional_materials}"
        );
        assert!(
            instructional_materials.contains("Place value chart"),
            "an aid was lost: {instructional_materials}"
        );
    }

    #[test]
    fn preserves_period_template_and_lesson_identity_during_the_multi_jurisdiction_upgrade() {
        let mut connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );",
            )
            .expect("migration ledger");
        for (version, sql) in MIGRATIONS.iter().take(14) {
            let transaction = connection.transaction().expect("migration transaction");
            transaction.execute_batch(sql).expect("migration");
            transaction
                .execute(
                    "INSERT INTO schema_migrations (version) VALUES (?1)",
                    params![version],
                )
                .expect("migration record");
            transaction.commit().expect("migration commit");
        }
        connection
            .execute_batch(
                "INSERT INTO academic_sessions (id, start_year, end_year)
                 VALUES ('session-kept', 2026, 2027);
                 INSERT INTO academic_periods (id, academic_session_id, term_number)
                 VALUES ('period-kept', 'session-kept', 2);
                 INSERT INTO teaching_assignments
                    (id, academic_session_id, subject_id, grade_level_id,
                     class_section, class_section_key)
                 VALUES ('assignment-kept', 'session-kept', 'subject-mathematics',
                         'grade-jss-2', 'A', 'a');
                 INSERT INTO lessons
                    (id, academic_session_id, academic_period_id, teaching_assignment_id,
                     input_mode, topic, learning_goals, materials, assessment,
                     reference_notes, status, latest_version_number)
                 VALUES ('lesson-kept', 'session-kept', 'period-kept', 'assignment-kept',
                         'structured', 'Linear equations', '[\"Solve equations.\"]',
                         '[]', '[]', '[]', 'draft', 0);
                 INSERT INTO scheme_template_packages
                    (id, package_key, title, publisher, normalized_publisher,
                     jurisdiction, edition, payload_sha256, trust, payload)
                 VALUES ('package-kept', 'school.maths', 'Mathematics scheme',
                         'Example School', 'example school', 'Nigeria', '2026',
                         '0000000000000000000000000000000000000000000000000000000000000000',
                         'school', '{}');
                 INSERT INTO scheme_templates
                    (id, package_id, subject_id, grade_level_id, term_number, title)
                 VALUES ('template-kept', 'package-kept', 'subject-mathematics',
                         'grade-jss-2', 2, 'Second term mathematics');
                 INSERT INTO scheme_template_weeks
                    (id, template_id, ordinal, kind, title)
                 VALUES ('template-week-kept', 'template-kept', 1, 'teaching', NULL);",
            )
            .expect("version fourteen fixture");

        apply(&mut connection).expect("multi-jurisdiction migration");

        let period: (String, i64, String, String, Option<i64>) = connection
            .query_row(
                "SELECT academic_session_id, ordinal, name, kind, legacy_term_number
                 FROM academic_periods WHERE id = 'period-kept'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("preserved period");
        assert_eq!(
            period,
            (
                "session-kept".to_owned(),
                2,
                "Second term".to_owned(),
                "term".to_owned(),
                Some(2),
            )
        );
        let template: (i64, String, String) = connection
            .query_row(
                "SELECT period_ordinal, period_kind, period_name
                 FROM scheme_templates WHERE id = 'template-kept'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("preserved template");
        assert_eq!(template, (2, "term".to_owned(), "Second term".to_owned()));
        let package_origin = connection
            .query_row(
                "SELECT origin FROM scheme_template_packages WHERE id = 'package-kept'",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("preserved package origin");
        assert_eq!(package_origin, "imported");
        let connected_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM scheme_template_weeks
                 WHERE id = 'template-week-kept' AND template_id = 'template-kept'",
                [],
                |row| row.get(0),
            )
            .expect("preserved template child");
        assert_eq!(connected_rows, 1);
        let lesson_period: String = connection
            .query_row(
                "SELECT academic_period_id FROM lessons WHERE id = 'lesson-kept'",
                [],
                |row| row.get(0),
            )
            .expect("preserved lesson");
        assert_eq!(lesson_period, "period-kept");
        let foreign_key_errors: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .expect("foreign-key audit");
        assert_eq!(foreign_key_errors, 0);
    }

    #[test]
    fn backfills_versioned_sections_when_upgrading_from_migration_twelve() {
        let mut connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );",
            )
            .expect("migration ledger");
        for (version, sql) in MIGRATIONS.iter().take(12) {
            let transaction = connection.transaction().expect("migration transaction");
            transaction.execute_batch(sql).expect("migration");
            transaction
                .execute(
                    "INSERT INTO schema_migrations (version) VALUES (?1)",
                    params![version],
                )
                .expect("migration record");
            transaction.commit().expect("migration commit");
        }
        connection
            .execute_batch(
                "INSERT INTO academic_sessions (id, start_year, end_year)
                 VALUES ('session', 2026, 2027);
                 INSERT INTO academic_periods (id, academic_session_id, term_number)
                 VALUES ('period', 'session', 1);
                 INSERT INTO teaching_assignments
                    (id, academic_session_id, subject_id, grade_level_id,
                     class_section, class_section_key)
                 VALUES ('assignment', 'session', 'subject-mathematics',
                         'grade-jss-2', 'A', 'a');
                 INSERT INTO lessons
                    (id, academic_session_id, academic_period_id, teaching_assignment_id,
                     input_mode, topic, learning_goals, materials, assessment,
                     reference_notes, status, latest_version_number)
                 VALUES ('lesson', 'session', 'period', 'assignment', 'structured',
                         'Equivalent fractions', '[\"Compare fractions.\"]', '[]', '[]',
                         '[]', 'confirmed', 1);
                 INSERT INTO lesson_versions
                    (id, lesson_id, version_number, academic_session_id,
                     academic_period_id, teaching_assignment_id, topic, learning_goals,
                     materials, assessment, reference_notes)
                 VALUES ('lesson-version', 'lesson', 1, 'session', 'period', 'assignment',
                         'Equivalent fractions', '[\"Compare fractions.\"]', '[]', '[]', '[]');
                 INSERT INTO lesson_version_steps
                    (id, lesson_version_id, sequence, title, teacher_activity, learner_activity)
                 VALUES ('step', 'lesson-version', 1, 'Compare models',
                         'Show the fraction strips.', 'Compare the strips.');
                 INSERT INTO lesson_material_runs
                    (id, lesson_id, lesson_version_id, lesson_version_number, status)
                 VALUES ('run', 'lesson', 'lesson-version', 1, 'complete');
                 INSERT INTO lesson_material_sections
                    (id, run_id, lesson_version_step_id, sequence, step_title, status,
                     generated_title, learning_goal_numbers, attempt_count)
                 VALUES ('section', 'run', 'step', 1, 'Compare models', 'done',
                         'Equivalent fractions', '[1]', 1);
                 INSERT INTO lesson_material_blocks (id, section_id, sequence, kind, text)
                 VALUES ('review', 'section', 1, 'review', 'Review text'),
                        ('example', 'section', 2, 'worked_example', 'Example text'),
                        ('practice', 'section', 3, 'practice', 'Practice text'),
                        ('solution', 'section', 4, 'solution', 'Solution text');",
            )
            .expect("migration twelve fixture");

        apply(&mut connection).expect("migrations thirteen and fourteen");

        let (
            current_version,
            version_count,
            block_count,
            edited_count,
            section_count,
            change_kind,
            goals,
        ): (i64, i64, i64, i64, i64, String, String) = connection
            .query_row(
                "SELECT runs.current_document_version_number,
                            (SELECT COUNT(*) FROM classwork_document_versions
                             WHERE run_id = runs.id),
                            (SELECT COUNT(*) FROM classwork_document_blocks
                             WHERE run_id = runs.id),
                            (SELECT COUNT(*) FROM classwork_document_blocks
                             WHERE run_id = runs.id AND teacher_edited = 1),
                            (SELECT COUNT(*) FROM classwork_document_sections
                             WHERE run_id = runs.id),
                            (SELECT change_kind FROM classwork_document_versions
                             WHERE run_id = runs.id AND version_number = 1),
                            (SELECT learning_goal_numbers FROM classwork_document_blocks
                             WHERE run_id = runs.id AND base_block_id = 'review')
                     FROM classwork_runs runs WHERE runs.id = 'run'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .expect("backfill result");
        assert_eq!(current_version, 1);
        assert_eq!(version_count, 1);
        assert_eq!(block_count, 4);
        assert_eq!(edited_count, 0);
        assert_eq!(section_count, 1);
        assert_eq!(change_kind, "initial");
        assert_eq!(goals, "[]");
    }

    #[test]
    fn upgrades_an_approved_version_and_restores_its_immutability_trigger() {
        let mut connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );",
            )
            .expect("migration ledger");
        for (version, sql) in MIGRATIONS.iter().take(13) {
            let transaction = connection.transaction().expect("migration transaction");
            transaction.execute_batch(sql).expect("migration");
            transaction
                .execute(
                    "INSERT INTO schema_migrations (version) VALUES (?1)",
                    params![version],
                )
                .expect("migration record");
            transaction.commit().expect("migration commit");
        }
        connection
            .execute_batch(
                "INSERT INTO academic_sessions (id, start_year, end_year) VALUES ('session', 2026, 2027);
                 INSERT INTO academic_periods (id, academic_session_id, term_number) VALUES ('period', 'session', 1);
                 INSERT INTO teaching_assignments
                    (id, academic_session_id, subject_id, grade_level_id, class_section, class_section_key)
                 VALUES ('assignment', 'session', 'subject-mathematics', 'grade-jss-2', 'A', 'a');
                 INSERT INTO lessons
                    (id, academic_session_id, academic_period_id, teaching_assignment_id,
                     input_mode, topic, learning_goals, materials, assessment, reference_notes,
                     status, latest_version_number)
                 VALUES ('lesson', 'session', 'period', 'assignment', 'structured',
                         'Equivalent fractions', '[\"Compare fractions.\"]', '[]', '[]', '[]',
                         'confirmed', 1);
                 INSERT INTO lesson_versions
                    (id, lesson_id, version_number, academic_session_id, academic_period_id,
                     teaching_assignment_id, topic, learning_goals, materials, assessment,
                     reference_notes)
                 VALUES ('lesson-version', 'lesson', 1, 'session', 'period', 'assignment',
                         'Equivalent fractions', '[\"Compare fractions.\"]', '[]', '[]', '[]');
                 INSERT INTO lesson_version_steps
                    (id, lesson_version_id, sequence, title, teacher_activity, learner_activity)
                 VALUES ('step', 'lesson-version', 1, 'Compare models',
                         'Show the strips.', 'Compare the strips.');
                 INSERT INTO lesson_material_runs
                    (id, lesson_id, lesson_version_id, lesson_version_number, status,
                     current_document_version_number)
                 VALUES ('run', 'lesson', 'lesson-version', 1, 'complete', 1);
                 INSERT INTO lesson_material_sections
                    (id, run_id, lesson_version_step_id, sequence, step_title, status,
                     generated_title, learning_goal_numbers, attempt_count)
                 VALUES ('section', 'run', 'step', 1, 'Compare models', 'done',
                         'Equivalent fractions', '[1]', 1);
                 INSERT INTO lesson_material_blocks (id, section_id, sequence, kind, text)
                 VALUES ('review', 'section', 1, 'review', 'Review text'),
                        ('example', 'section', 2, 'worked_example', 'Example text'),
                        ('practice', 'section', 3, 'practice', 'Practice text'),
                        ('solution', 'section', 4, 'solution', 'Solution text');
                 INSERT INTO lesson_material_document_versions
                    (id, run_id, version_number, status, approved_at)
                 VALUES ('approved-version', 'run', 1, 'approved', CURRENT_TIMESTAMP);
                 INSERT INTO lesson_material_document_blocks
                    (id, document_version_id, run_id, base_block_id, section_id, sequence,
                     kind, text, teacher_edited)
                 VALUES ('vr', 'approved-version', 'run', 'review', 'section', 1, 'review', 'Review text', 0),
                        ('ve', 'approved-version', 'run', 'example', 'section', 2, 'worked_example', 'Example text', 0),
                        ('vp', 'approved-version', 'run', 'practice', 'section', 3, 'practice', 'Practice text', 0),
                        ('vs', 'approved-version', 'run', 'solution', 'section', 4, 'solution', 'Solution text', 0);",
            )
            .expect("approved migration-thirteen fixture");

        let transaction = connection
            .transaction()
            .expect("migration fourteen transaction");
        transaction
            .execute_batch(MIGRATIONS[13].1)
            .expect("migration fourteen");
        transaction.commit().expect("migration fourteen commit");

        let change_kind: String = connection
            .query_row(
                "SELECT change_kind FROM lesson_material_document_versions
                 WHERE id = 'approved-version'",
                [],
                |row| row.get(0),
            )
            .expect("backfilled kind");
        assert_eq!(change_kind, "initial");
        let immutable = connection.execute(
            "UPDATE lesson_material_document_versions SET teacher_direction = 'change'
             WHERE id = 'approved-version'",
            [],
        );
        assert!(immutable.is_err());
    }

    #[test]
    fn backfills_licensed_packages_into_the_typed_rights_contract() {
        let mut connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY NOT NULL,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 );",
            )
            .expect("migration ledger");
        for (version, sql) in MIGRATIONS.iter().take(17) {
            if matches!(*version, 15 | 17) {
                apply_with_foreign_keys_disabled(&mut connection, *version, sql)
                    .expect("migration requiring rebuilt tables");
            } else {
                let transaction = connection.transaction().expect("migration transaction");
                transaction.execute_batch(sql).expect("migration");
                transaction
                    .execute(
                        "INSERT INTO schema_migrations (version) VALUES (?1)",
                        params![version],
                    )
                    .expect("migration record");
                transaction.commit().expect("migration commit");
            }
        }
        connection
            .execute(
                "INSERT INTO curriculum_packages (
                    id, package_key, title, publisher, normalized_publisher,
                    jurisdiction_id, edition, source_uri, source_sha256,
                    licence_id, licence_name, licence_url, attribution,
                    modification_notice, payload_sha256, trust, payload
                 ) VALUES (
                    'licensed-package', 'example.licensed', 'Licensed curriculum',
                    'Example Publisher', 'example publisher', 'jurisdiction-ng',
                    '2026', 'https://example.test/source', ?1, 'CC-BY-4.0',
                    'Creative Commons Attribution 4.0',
                    'https://creativecommons.org/licenses/by/4.0/',
                    'Example Publisher, CC BY 4.0.', 'Converted for Graspy.',
                    ?2, 'school', '{}'
                 )",
                params!["1".repeat(64), "2".repeat(64)],
            )
            .expect("legacy licensed package");

        apply_with_foreign_keys_disabled(&mut connection, 18, MIGRATIONS[17].1)
            .expect("rights migration");

        let rights: (String, String, String) = connection
            .query_row(
                "SELECT rights_kind, rights_name, rights_url
                 FROM curriculum_packages WHERE id = 'licensed-package'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("backfilled rights");
        assert_eq!(
            rights,
            (
                "licence".to_owned(),
                "Creative Commons Attribution 4.0".to_owned(),
                "https://creativecommons.org/licenses/by/4.0/".to_owned(),
            )
        );
        assert!(connection
            .execute(
                "UPDATE curriculum_packages SET rights_name = 'changed'
                 WHERE id = 'licensed-package'",
                [],
            )
            .is_err());
    }

    /// A subtopic is planned once — by the week's plan that spans it, or by its
    /// own. Two plans covering the same ground would put two signed documents in
    /// front of a head of department for one lesson.
    #[test]
    fn a_week_and_one_of_its_subtopics_cannot_both_be_planned() {
        let database = crate::db::Database::in_memory();
        let scheme = |connection: &Connection| -> rusqlite::Result<()> {
            connection.execute_batch(
                "PRAGMA foreign_keys = OFF;
                 INSERT INTO scheme_weeks (id, scheme_id, ordinal, starts_on, ends_on, kind)
                 VALUES ('week', 'scheme', 1, '2026-09-14', '2026-09-18', 'teaching');
                 INSERT INTO scheme_entries (id, scheme_week_id, scheme_id,
                     curriculum_course_id, curriculum_unit_id, sequence, topic,
                     objectives, assessment, instructional_materials)
                 VALUES ('entry', 'week', 'scheme', 'course', 'unit', 1,
                     'Whole Numbers', '[]', '[]', '[]');",
            )
        };
        let plan = |id: &str, week: Option<&str>, entry: Option<&str>| {
            let (id, week, entry) = (
                id.to_owned(),
                week.map(str::to_owned),
                entry.map(str::to_owned),
            );
            database.with_connection(move |connection| {
                connection.execute(
                    "INSERT INTO lessons (id, academic_session_id, academic_period_id,
                         teaching_assignment_id, scheme_week_id, scheme_entry_id,
                         curriculum_course_id, curriculum_unit_id, input_mode, topic,
                         learning_goals, instructional_materials, assessment, reference_notes)
                     VALUES (?1, 'session', 'period', 'assignment', ?2, ?3,
                         CASE WHEN ?3 IS NULL THEN NULL ELSE 'course' END,
                         CASE WHEN ?3 IS NULL THEN NULL ELSE 'unit' END,
                         'structured', 'Whole Numbers', '[]', '[]', '[]', '[]')",
                    params![id, week, entry],
                )
            })
        };

        database.with_connection(scheme).expect("a scheme week");
        plan("week-plan", Some("week"), None).expect("the week's plan");
        let refusal = plan("entry-plan", None, Some("entry")).expect_err("a second plan");
        assert!(
            format!("{refusal:?}").contains("already has a lesson plan"),
            "unexpected: {refusal:?}"
        );
    }

    /// Rebuilding three tables to drop `plan_format` is the kind of change that
    /// loses an index or a trigger without a single test noticing, because
    /// everything still reads and writes. Each is named here.
    #[test]
    fn dropping_the_format_column_carries_every_rule_on_those_tables_across() {
        let database = crate::db::Database::in_memory();
        database
            .with_connection(|connection| {
                for table in ["lessons", "lesson_versions", "lesson_preparations"] {
                    let held: Vec<String> = connection
                        .prepare(&format!("SELECT name FROM pragma_table_info('{table}')"))?
                        .query_map([], |row| row.get(0))?
                        .collect::<rusqlite::Result<_>>()?;
                    assert!(
                        !held.iter().any(|column| column == "plan_format"),
                        "{table} still records the format beside the plan: {held:?}"
                    );
                }

                for rule in [
                    "idx_lessons_scheme_entry",
                    "idx_lessons_scheme_week",
                    "lessons_one_plan_covering_a_subtopic",
                    "lessons_one_plan_covering_a_week",
                    "lesson_teacher_curriculum_requires_no_linkage_insert",
                    "lesson_teacher_curriculum_requires_no_linkage_update",
                    "lesson_versions_immutable_update",
                    "lesson_versions_immutable_delete",
                    "lesson_preparation_source_immutable",
                ] {
                    let survived: i64 = connection.query_row(
                        "SELECT COUNT(*) FROM sqlite_master WHERE name = ?1",
                        [rule],
                        |row| row.get(0),
                    )?;
                    assert_eq!(survived, 1, "the rebuild lost {rule}");
                }
                Ok::<_, rusqlite::Error>(())
            })
            .expect("the rebuilt tables");
    }

    /// The guard that refused a plan for a lesson not already marked granular
    /// went with the column it guarded. A plan is what makes a lesson granular,
    /// so storing one needs nothing set first.
    #[test]
    fn a_plan_can_be_stored_for_a_lesson_without_anything_declaring_it_first() {
        let database = crate::db::Database::in_memory();
        let digest = "0".repeat(64);
        database
            .with_connection(move |connection| {
                connection.execute_batch(
                    "PRAGMA foreign_keys = OFF;
                     INSERT INTO lessons (id, academic_session_id, academic_period_id,
                         teaching_assignment_id, input_mode, topic, learning_goals,
                         instructional_materials, assessment, reference_notes)
                     VALUES ('lesson', 'session', 'period', 'assignment', 'structured',
                         'Whole Numbers', '[]', '[]', '[]', '[]');",
                )?;
                connection.execute(
                    "INSERT INTO lesson_granular_drafts (
                         lesson_id, plan_json, plan_sha256, curriculum_snapshot_json,
                         curriculum_snapshot_sha256, source_evidence_snapshot_json,
                         source_evidence_snapshot_sha256, program_id, program_version,
                         program_digest
                     ) VALUES ('lesson', '{}', ?1, '{}', ?1, '{}', ?1,
                         'lesson-plan.granular', '1.1.0', ?1)",
                    params![digest],
                )
            })
            .expect("a plan stored against a plain lesson");
    }

    /// And the other way round: a subtopic planned on its own leaves no room for
    /// a plan of the whole week over it.
    #[test]
    fn a_subtopic_planned_on_its_own_stops_the_week_being_planned_over_it() {
        let database = crate::db::Database::in_memory();
        database
            .with_connection(|connection| {
                connection.execute_batch(
                    "PRAGMA foreign_keys = OFF;
                     INSERT INTO scheme_weeks (id, scheme_id, ordinal, starts_on, ends_on, kind)
                     VALUES ('week', 'scheme', 1, '2026-09-14', '2026-09-18', 'teaching');
                     INSERT INTO scheme_entries (id, scheme_week_id, scheme_id,
                         curriculum_course_id, curriculum_unit_id, sequence, topic,
                         objectives, assessment, instructional_materials)
                     VALUES ('entry', 'week', 'scheme', 'course', 'unit', 1,
                         'Whole Numbers', '[]', '[]', '[]');
                     INSERT INTO lessons (id, academic_session_id, academic_period_id,
                         teaching_assignment_id, scheme_entry_id, curriculum_course_id,
                         curriculum_unit_id, input_mode, topic, learning_goals,
                         instructional_materials, assessment, reference_notes)
                     VALUES ('entry-plan', 'session', 'period', 'assignment', 'entry',
                         'course', 'unit', 'structured', 'Whole Numbers', '[]', '[]', '[]', '[]');",
                )
            })
            .expect("a subtopic planned on its own");

        let refusal = database
            .with_connection(|connection| {
                connection.execute(
                    "INSERT INTO lessons (id, academic_session_id, academic_period_id,
                         teaching_assignment_id, scheme_week_id, input_mode, topic,
                         learning_goals, instructional_materials, assessment, reference_notes)
                     VALUES ('week-plan', 'session', 'period', 'assignment', 'week',
                         'structured', 'Whole Numbers', '[]', '[]', '[]', '[]')",
                    [],
                )
            })
            .expect_err("a plan over it");

        assert!(
            format!("{refusal:?}").contains("already has a lesson plan of its own"),
            "unexpected: {refusal:?}"
        );
    }

    /// A plan a teacher pasted can legitimately contain a tab, and keeps it.
    ///
    /// This used to prove migration 27's escape repair as well. That repair
    /// reached `lesson_steps` and `lesson_version_steps`, which migration 48
    /// drops — and it never needed to reach a plan, because `plan_json` checks
    /// `json_valid` and a raw form feed inside a JSON string is not valid JSON.
    /// The mangled text could only ever live in the projection.
    #[test]
    fn a_pasted_plan_keeps_the_tab_a_teacher_typed() {
        let database = crate::db::Database::in_memory_through(26);
        database
            .with_connection(|connection| {
                // The repair only updates existing rows, so the reference chain
                // a lesson normally carries is not what is under test here.
                connection.execute_batch("PRAGMA foreign_keys = OFF")?;
                connection.execute(
                    "INSERT INTO lessons (
                        id, academic_session_id, academic_period_id, teaching_assignment_id,
                        input_mode, topic, learning_goals, materials, assessment,
                        reference_notes, status, latest_version_number, created_at,
                        updated_at, raw_plan, plan_format
                     ) VALUES ('lesson', 'session', 'period', 'assignment', 'pasted',
                        'Equivalent fractions', '[]', '[]', '[]', '[]', 'draft', 0,
                        '2026-07-21', '2026-07-21', ?1, 'granular')",
                    params!["Week 1\tEquivalent fractions"],
                )?;
                Ok::<_, rusqlite::Error>(())
            })
            .expect("a library prepared by a previous release");

        database
            .upgrade_to_current_schema()
            .expect("a populated library upgrades in one step");

        let (raw_plan, immutability) = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row("SELECT raw_plan FROM lessons", [], |row| {
                        row.get::<_, String>(0)
                    })?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger'
                         AND name = 'lesson_granular_versions_immutable_update'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("the upgraded library");

        assert_eq!(raw_plan, "Week 1\tEquivalent fractions");
        assert_eq!(immutability, 1, "confirmed versions stay immutable");
    }

    /// A release installed a course without the rows saying which goals its
    /// knowledge serves, and a later revision of the same package installed
    /// correctly beside it.
    #[test]
    fn recovers_the_alignments_a_course_was_installed_without() {
        let database = crate::db::Database::in_memory_through(27);
        database
            .with_connection(|connection| {
                connection.execute_batch(
                    "PRAGMA foreign_keys = OFF;
                     INSERT INTO curriculum_packages
                        (id, package_key, title, publisher, normalized_publisher,
                         jurisdiction_id, edition, package_revision, source_uri,
                         source_sha256, attribution, modification_notice, payload_sha256,
                         trust, payload, rights_kind, rights_name, rights_statement, rights_url)
                     VALUES ('package-1', 'ng.nerdc.jss1', 'JSS 1', 'Graspy', 'graspy',
                             'jurisdiction-ng', 'Sept 2025', 1, 'https://example.test', 'a1' || replace(hex(zeroblob(31)), '0', 'b'),
                             'NERDC', 'Converted', 'c1' || replace(hex(zeroblob(31)), '0', 'd'), 'school', '{}', 'official_text',
                             'Official', 'Recorded', 'https://example.test'),
                            ('package-2', 'ng.nerdc.jss1', 'JSS 1', 'Graspy', 'graspy',
                             'jurisdiction-ng', 'Sept 2025', 2, 'https://example.test', 'a1' || replace(hex(zeroblob(31)), '0', 'b'),
                             'NERDC', 'Converted', 'e1' || replace(hex(zeroblob(31)), '0', 'f'), 'school', '{}', 'official_text',
                             'Official', 'Recorded', 'https://example.test');
                     INSERT INTO curriculum_frameworks
                        (id, name, normalized_name, authority, normalized_authority,
                         jurisdiction, version, package_id)
                     VALUES ('framework-1', 'NERDC', 'nerdc', 'NERDC', 'nerdc', 'NG', 'Sept 2025', 'package-1'),
                            ('framework-2', 'NERDC', 'nerdc', 'NERDC', 'nerdc', 'NG', 'Sept 2025', 'package-2');
                     INSERT INTO curriculum_courses
                        (id, framework_id, subject_id, grade_level_id, title, course_key)
                     VALUES ('course-old', 'framework-1', 'mathematics', 'jss1', 'Mathematics', 'maths-jss1'),
                            ('course-new', 'framework-2', 'mathematics', 'jss1', 'Mathematics', 'maths-jss1');
                     INSERT INTO atomic_learning_objectives
                        (id, curriculum_course_id, curriculum_node_id, source_code, statement, sequence)
                     VALUES ('goal-old', 'course-old', 'node-old', 'order-fractions', 'Order fractions.', 1),
                            ('goal-new', 'course-new', 'node-new', 'order-fractions', 'Order fractions.', 1);
                     INSERT INTO knowledge_components
                        (id, curriculum_course_id, curriculum_node_id, code, description)
                     VALUES ('knowledge-old', 'course-old', 'node-old', 'KC-1', 'Comparing denominators'),
                            ('knowledge-new', 'course-new', 'node-new', 'KC-1', 'Comparing denominators');
                     INSERT INTO knowledge_component_objectives
                        (knowledge_component_id, atomic_objective_id, curriculum_course_id)
                     VALUES ('knowledge-new', 'goal-new', 'course-new');",
                )?;
                Ok::<_, rusqlite::Error>(())
            })
            .expect("a course installed without its alignments");

        database
            .upgrade_to_current_schema()
            .expect("a populated library upgrades in one step");

        let (recovered, untouched) = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_component_objectives
                         WHERE knowledge_component_id = 'knowledge-old'
                           AND atomic_objective_id = 'goal-old'",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM knowledge_component_objectives",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("the upgraded library");

        assert_eq!(recovered, 1, "the goal its knowledge always served");
        assert_eq!(untouched, 2, "the complete course is not duplicated");
    }

    #[test]
    fn keeps_the_most_developed_lesson_on_a_scheme_entry_and_releases_the_rest() {
        let database = crate::db::Database::in_memory_through(30);
        database
            .with_connection(|connection| {
                connection.execute_batch("PRAGMA foreign_keys = OFF")?;
                // Three lessons ended up on one scheme entry. Only the second
                // has a teaching step written into it.
                let bound = |id: &str| {
                    format!(
                        "INSERT INTO lessons (
                            id, academic_session_id, academic_period_id, teaching_assignment_id,
                            scheme_week_id, scheme_entry_id, curriculum_course_id, curriculum_unit_id,
                            input_mode, topic, learning_goals, materials, assessment,
                            reference_notes, status, latest_version_number, created_at, updated_at,
                            plan_format
                         ) VALUES ('{id}', 'session', 'period', 'assignment',
                            'week', 'entry', 'course', 'unit',
                            'structured', 'Whole Numbers', '[]', '[]', '[]', '[]', 'draft', 0,
                            '2026-07-21', '2026-07-21', 'legacy_import')"
                    )
                };
                connection.execute_batch(&bound("empty-a"))?;
                connection.execute_batch(&bound("has-step"))?;
                connection.execute_batch(&bound("empty-b"))?;
                connection.execute(
                    "INSERT INTO lesson_steps (id, lesson_id, sequence, title, teacher_activity, learner_activity)
                     VALUES ('step', 'has-step', 1, 'Count in millions', 'Model it', 'Try it')",
                    [],
                )?;
                Ok::<_, rusqlite::Error>(())
            })
            .expect("a library prepared by a previous release");

        database
            .upgrade_to_current_schema()
            .expect("a populated library upgrades in one step");

        let (bound_id, off_scheme, total) = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row(
                        "SELECT id FROM lessons WHERE scheme_entry_id = 'entry'",
                        [],
                        |row| row.get::<_, String>(0),
                    )?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM lessons WHERE scheme_entry_id IS NULL",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                    connection.query_row("SELECT COUNT(*) FROM lessons", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                ))
            })
            .expect("the upgraded library");

        assert_eq!(
            bound_id, "has-step",
            "the lesson with real work keeps the entry"
        );
        assert_eq!(
            off_scheme, 2,
            "the empty duplicates are released, not deleted"
        );
        assert_eq!(total, 3, "nothing a teacher wrote is deleted");

        // The entry can never collect a second lesson again.
        let second_binding = database.with_connection(|connection| {
            connection.execute_batch("PRAGMA foreign_keys = OFF")?;
            connection.execute(
                "INSERT INTO lessons (
                    id, academic_session_id, academic_period_id, teaching_assignment_id,
                    scheme_week_id, scheme_entry_id, curriculum_course_id, curriculum_unit_id,
                    input_mode, topic, learning_goals, materials, assessment, reference_notes,
                    status, latest_version_number, created_at, updated_at, plan_format
                 ) VALUES ('intruder', 'session', 'period', 'assignment',
                    'week', 'entry', 'course', 'unit',
                    'structured', 'Whole Numbers', '[]', '[]', '[]', '[]', 'draft', 0,
                    '2026-07-21', '2026-07-21', 'legacy_import')",
                [],
            )
        });
        assert!(
            second_binding.is_err(),
            "a scheme entry holds only one lesson",
        );
    }
}
