use rusqlite::{params, Connection, OptionalExtension};

use crate::classwork::domain::*;
use crate::content_corpus::ContentCorpus;
use crate::db::Database;
use crate::lesson_planning::LessonContextRequest;

use super::{confirmed_lesson, db_error, synchronize_run_figures, Result};

pub(crate) fn get_workspace(
    database: &Database,
    corpus: &ContentCorpus,
    request: ClassworkWorkspaceRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    let existing_run = database.with_connection(|connection| {
        existing_run_figure_sources(connection, &request.context, &request.lesson_id)
    })?;
    let source_figures = corpus.resolve_figures(&existing_run.source_record_ids)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = confirmed_lesson(&transaction, &request.context, &request.lesson_id)?;
        recover_interrupted_run(&transaction, &lesson.lesson_version_id)?;
        if let Some(run_id) = existing_run.run_id.as_deref() {
            synchronize_run_figures(&transaction, run_id, &source_figures)?;
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

struct ExistingRunFigureSources {
    run_id: Option<String>,
    source_record_ids: Vec<String>,
}

fn existing_run_figure_sources(
    connection: &Connection,
    context: &LessonContextRequest,
    lesson_id: &str,
) -> Result<ExistingRunFigureSources> {
    let lesson = confirmed_lesson(connection, context, lesson_id)?;
    let run_id = connection
        .query_row(
            "SELECT id FROM classwork_runs WHERE lesson_version_id = ?1",
            [&lesson.lesson_version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?;
    let Some(run_id_value) = run_id.as_deref() else {
        return Ok(ExistingRunFigureSources {
            run_id,
            source_record_ids: Vec::new(),
        });
    };
    let mut statement = connection
        .prepare(
            "SELECT source_record_id FROM classwork_sources
             WHERE run_id = ?1 AND source_record_id IS NOT NULL ORDER BY sequence",
        )
        .map_err(db_error)?;
    let source_record_ids = statement
        .query_map([run_id_value], |row| row.get::<_, String>(0))
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<String>, rusqlite::Error>>()
        .map_err(db_error)?;
    Ok(ExistingRunFigureSources {
        run_id,
        source_record_ids,
    })
}

pub(crate) fn figure_data_url(
    database: &Database,
    corpus: &ContentCorpus,
    request: ClassworkFigureRequest,
) -> Result<String> {
    let asset = database.with_connection(|connection| {
        let lesson = confirmed_lesson(connection, &request.context, &request.lesson_id)?;
        connection
            .query_row(
                "SELECT figures.asset_file_name, figures.sha256
                 FROM classwork_figures figures
                 JOIN classwork_runs runs ON runs.id = figures.run_id
                 WHERE figures.id = ?1 AND runs.lesson_id = ?2 AND runs.lesson_version_id = ?3",
                params![
                    request.figure_id,
                    lesson.lesson_id,
                    lesson.lesson_version_id
                ],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| "This lesson figure is no longer available.".to_owned())
    })?;
    corpus.figure_data_url(&asset.0, &asset.1)
}

fn recover_interrupted_run(connection: &Connection, version_id: &str) -> Result<()> {
    let run_id = connection
        .query_row(
            "SELECT id FROM classwork_runs WHERE lesson_version_id = ?1 AND status = 'running'",
            [version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?;
    if let Some(run_id) = run_id {
        let changed = connection.execute(
            "UPDATE classwork_sections SET status = 'failed', generation_token = NULL,
             last_error = 'Creation was interrupted before this section was saved.', updated_at = CURRENT_TIMESTAMP
             WHERE run_id = ?1 AND status = 'generating'", [&run_id],
        ).map_err(db_error)?;
        let status = if changed > 0 { "failed" } else { "paused" };
        connection.execute("UPDATE classwork_runs SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2", params![status, run_id]).map_err(db_error)?;
    }
    connection
        .execute(
            "UPDATE classwork_section_regenerations
             SET status = 'failed', generation_token = NULL,
                 last_error = 'Recreating this section was interrupted before the new wording was saved.',
                 updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
             WHERE run_id IN (
                SELECT id FROM classwork_runs WHERE lesson_version_id = ?1
             ) AND status = 'generating'",
            [version_id],
        )
        .map_err(db_error)?;
    Ok(())
}

pub(super) fn load_workspace(
    connection: &Connection,
    lesson: ConfirmedLessonContext,
) -> Result<ClassworkWorkspaceSnapshot> {
    let run_row = connection.query_row(
        "SELECT id, status, lesson_version_id, lesson_version_number FROM classwork_runs WHERE lesson_version_id = ?1",
        [&lesson.lesson_version_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, i64>(3)?)),
    ).optional().map_err(db_error)?;
    let run = if let Some(value) = run_row {
        Some(ClassworkRun {
            task_id: crate::classwork::generation::task_id_for_run(&value.0),
            sections: load_sections(connection, &value.0)?,
            sources: load_source_summaries(connection, &value.0)?,
            figures: load_figures(connection, &value.0)?,
            document_version: load_current_document_version(connection, &value.0)?,
            section_regeneration: load_visible_regeneration(connection, &value.0)?,
            id: value.0,
            status: value.1,
            lesson_version_id: value.2,
            lesson_version_number: value.3,
        })
    } else {
        None
    };
    Ok(ClassworkWorkspaceSnapshot { lesson, run })
}

fn load_source_summaries(
    connection: &Connection,
    run_id: &str,
) -> Result<Vec<ClassworkSourceSummary>> {
    let mut statement = connection
        .prepare(
            "SELECT source_key, title, publisher, source_url, licence_name, licence_url, attribution
             FROM classwork_sources WHERE run_id = ?1 ORDER BY sequence",
        )
        .map_err(db_error)?;
    let sources = statement
        .query_map([run_id], |row| {
            Ok(ClassworkSourceSummary {
                key: row.get(0)?,
                title: row.get(1)?,
                publisher: row.get(2)?,
                source_url: row.get(3)?,
                licence_name: row.get(4)?,
                licence_url: row.get(5)?,
                attribution: row.get(6)?,
            })
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(sources)
}

pub(super) struct StoredDocumentSection {
    pub(super) title: String,
    pub(super) learning_goal_numbers: Vec<i64>,
    pub(super) quality: Option<ClassworkQualityReport>,
    pub(super) regenerated: bool,
}

pub(super) fn load_document_section(
    connection: &Connection,
    document_version_id: &str,
    section_id: &str,
) -> Result<Option<StoredDocumentSection>> {
    let value = connection
        .query_row(
            "SELECT title, learning_goal_numbers, quality_report, regenerated
             FROM classwork_document_sections
             WHERE document_version_id = ?1 AND base_section_id = ?2",
            params![document_version_id, section_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?;
    value
        .map(|(title, goals, quality, regenerated)| {
            Ok(StoredDocumentSection {
                title,
                learning_goal_numbers: serde_json::from_str(&goals)
                    .map_err(|error| error.to_string())?,
                quality: quality
                    .map(|report| serde_json::from_str(&report))
                    .transpose()
                    .map_err(|error| error.to_string())?,
                regenerated,
            })
        })
        .transpose()
}

fn load_visible_regeneration(
    connection: &Connection,
    run_id: &str,
) -> Result<Option<ClassworkSectionRegeneration>> {
    connection
        .query_row(
            "SELECT id, section_id, status, teacher_direction, last_error
             FROM classwork_section_regenerations
             WHERE run_id = ?1
             ORDER BY sequence DESC LIMIT 1",
            [run_id],
            |row| {
                Ok(ClassworkSectionRegeneration {
                    id: row.get(0)?,
                    section_id: row.get(1)?,
                    status: row.get(2)?,
                    teacher_direction: row.get(3)?,
                    last_error: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(db_error)
        .map(|value| {
            value.filter(|regeneration| {
                matches!(regeneration.status.as_str(), "generating" | "failed")
            })
        })
}

fn load_figures(connection: &Connection, run_id: &str) -> Result<Vec<ClassworkFigure>> {
    let mut statement = connection
        .prepare(
            "SELECT figures.id, sources.source_key, figures.sequence, figures.caption,
                    figures.alt_text, figures.width_px, figures.height_px
             FROM classwork_figures figures
             JOIN classwork_sources sources ON sources.id = figures.source_id
             WHERE figures.run_id = ?1 ORDER BY figures.sequence",
        )
        .map_err(db_error)?;
    let figures = statement
        .query_map([run_id], |row| {
            Ok(ClassworkFigure {
                id: row.get(0)?,
                source_material_key: row.get(1)?,
                sequence: row.get(2)?,
                caption: row.get(3)?,
                alt_text: row.get(4)?,
                width_px: row.get(5)?,
                height_px: row.get(6)?,
            })
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(figures)
}

fn load_sections(connection: &Connection, run_id: &str) -> Result<Vec<ClassworkSection>> {
    let document_version_id =
        load_current_document_version(connection, run_id)?.map(|version| version.id);
    let mut statement = connection
        .prepare(
            "SELECT id, sequence, step_title, status, generated_title, learning_goal_numbers,
                attempt_count, last_error, quality_outcome, repair_attempted, scrubbed_claim_count
         FROM classwork_sections WHERE run_id = ?1 ORDER BY sequence",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map([run_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<bool>>(9)?,
                row.get::<_, Option<i64>>(10)?,
            ))
        })
        .map_err(db_error)?;
    rows.map(|row| {
        let value = row.map_err(db_error)?;
        let base_quality = load_quality_report(
            connection,
            &value.0,
            value.6,
            value.8.clone(),
            value.9,
            value.10,
        )?;
        let document_section = document_version_id
            .as_deref()
            .map(|version_id| load_document_section(connection, version_id, &value.0))
            .transpose()?
            .flatten();
        let (title, learning_goal_numbers, quality, regenerated) =
            if let Some(document_section) = document_section {
                (
                    Some(document_section.title),
                    document_section.learning_goal_numbers,
                    document_section.quality.or(base_quality),
                    document_section.regenerated,
                )
            } else {
                (
                    value.4,
                    serde_json::from_str(&value.5).map_err(|error| error.to_string())?,
                    base_quality,
                    false,
                )
            };
        Ok(ClassworkSection {
            blocks: load_blocks(connection, &value.0, document_version_id.as_deref())?,
            id: value.0,
            sequence: value.1,
            step_title: value.2,
            status: value.3,
            title,
            learning_goal_numbers,
            attempt_count: value.6,
            last_error: value.7,
            quality,
            regenerated,
        })
    })
    .collect()
}

pub(super) fn load_blocks(
    connection: &Connection,
    section_id: &str,
    document_version_id: Option<&str>,
) -> Result<Vec<ClassworkBlock>> {
    let mut statement = connection
        .prepare(
            "SELECT blocks.id, blocks.kind, COALESCE(version_blocks.text, blocks.text),
                COALESCE(version_blocks.teacher_edited, 0),
                version_blocks.learning_goal_numbers, version_blocks.source_material_keys
         FROM classwork_blocks blocks
         LEFT JOIN classwork_document_blocks version_blocks
           ON version_blocks.base_block_id = blocks.id
          AND version_blocks.document_version_id = ?2
         WHERE blocks.section_id = ?1 ORDER BY blocks.sequence",
        )
        .map_err(db_error)?;
    let blocks = statement
        .query_map(params![section_id, document_version_id], |row| {
            Ok(ClassworkBlock {
                id: row.get(0)?,
                kind: row.get(1)?,
                text: row.get(2)?,
                source_material_keys: row
                    .get::<_, Option<String>>(5)?
                    .map(|value| serde_json::from_str(&value))
                    .transpose()
                    .map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            5,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?
                    .unwrap_or_default(),
                teacher_edited: row.get(3)?,
                learning_goal_numbers: row
                    .get::<_, Option<String>>(4)?
                    .map(|value| serde_json::from_str(&value))
                    .transpose()
                    .map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            4,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?
                    .unwrap_or_default(),
            })
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    blocks
        .into_iter()
        .map(|mut block| {
            if document_version_id.is_none() {
                block.learning_goal_numbers = load_block_learning_goals(connection, &block.id)?;
                block.source_material_keys = load_block_source_keys(connection, &block.id)?;
            }
            Ok(block)
        })
        .collect()
}

fn load_block_learning_goals(connection: &Connection, block_id: &str) -> Result<Vec<i64>> {
    let mut statement = connection
        .prepare(
            "SELECT learning_goal_number FROM classwork_block_learning_goals
             WHERE block_id = ?1 ORDER BY learning_goal_number",
        )
        .map_err(db_error)?;
    let values = statement
        .query_map([block_id], |row| row.get(0))
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(values)
}

fn load_block_source_keys(connection: &Connection, block_id: &str) -> Result<Vec<String>> {
    let mut statement = connection
        .prepare(
            "SELECT sources.source_key FROM classwork_block_sources links
             JOIN classwork_sources sources ON sources.id = links.source_id
             WHERE links.block_id = ?1 ORDER BY sources.sequence",
        )
        .map_err(db_error)?;
    let values = statement
        .query_map([block_id], |row| row.get(0))
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(values)
}

fn load_quality_report(
    connection: &Connection,
    section_id: &str,
    attempt_number: i64,
    outcome: Option<String>,
    repair_attempted: Option<bool>,
    scrubbed_claim_count: Option<i64>,
) -> Result<Option<ClassworkQualityReport>> {
    let Some(outcome) = outcome else {
        return Ok(None);
    };
    let mut statement = connection
        .prepare(
            "SELECT id, stage, passed FROM classwork_validation_passes
             WHERE section_id = ?1 AND attempt_number = ?2 ORDER BY sequence",
        )
        .map_err(db_error)?;
    let pass_rows = statement
        .query_map(params![section_id, attempt_number], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, bool>(2)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let passes = pass_rows
        .into_iter()
        .map(|(pass_id, stage, passed)| {
            let mut checks_statement = connection
                .prepare(
                    "SELECT check_name, passed, details FROM classwork_validation_checks
                     WHERE validation_pass_id = ?1 ORDER BY sequence",
                )
                .map_err(db_error)?;
            let checks = checks_statement
                .query_map([pass_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(db_error)?
                .map(|row| {
                    let (check, passed, details) = row.map_err(db_error)?;
                    Ok(ClassworkValidationCheck {
                        check,
                        passed,
                        details: serde_json::from_str(&details)
                            .map_err(|error| error.to_string())?,
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(ClassworkValidationPass {
                stage,
                passed,
                checks,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Some(ClassworkQualityReport {
        outcome,
        repair_attempted: repair_attempted
            .ok_or_else(|| "Saved quality information is incomplete.".to_owned())?,
        scrubbed_claim_count: scrubbed_claim_count
            .ok_or_else(|| "Saved quality information is incomplete.".to_owned())?,
        passes,
    }))
}

pub(super) fn load_current_document_version(
    connection: &Connection,
    run_id: &str,
) -> Result<Option<ClassworkDocumentVersion>> {
    connection
        .query_row(
            "SELECT versions.id, versions.version_number, versions.status,
                    versions.change_kind, versions.changed_section_id,
                    versions.teacher_direction, versions.restored_from_version_number,
                    versions.created_at, versions.approved_at
             FROM classwork_document_versions versions
             JOIN classwork_runs runs
               ON runs.id = versions.run_id
              AND runs.current_document_version_number = versions.version_number
             WHERE versions.run_id = ?1",
            [run_id],
            |row| {
                Ok(ClassworkDocumentVersion {
                    id: row.get(0)?,
                    version_number: row.get(1)?,
                    status: row.get(2)?,
                    change_kind: row.get(3)?,
                    changed_section_id: row.get(4)?,
                    teacher_direction: row.get(5)?,
                    restored_from_version_number: row.get(6)?,
                    created_at: row.get(7)?,
                    approved_at: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(db_error)
}

#[cfg(test)]
mod tests {

    use crate::classwork::repository::test_fixtures::setup;
    use crate::classwork::repository::*;

    #[test]
    fn restores_trusted_figures_for_runs_created_before_the_figure_migration() {
        let (database, corpus, context) = setup();
        let run = start_run(
            &database,
            &corpus,
            StartClassworkRunRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("run")
        .run
        .expect("run");
        assert!(!run.figures.is_empty());
        database
            .with_connection(|connection| {
                connection.execute("DELETE FROM classwork_figures WHERE run_id = ?1", [&run.id])
            })
            .expect("remove figure snapshot");

        let restored = get_workspace(
            &database,
            &corpus,
            ClassworkWorkspaceRequest {
                context,
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("restored workspace")
        .run
        .expect("restored run");

        assert!(!restored.figures.is_empty());
        assert!(restored
            .figures
            .iter()
            .all(|figure| figure.source_material_key == "ch04-b014"));
    }
}
