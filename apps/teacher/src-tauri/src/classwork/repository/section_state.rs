use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::classwork::domain::*;
use crate::db::Database;

use super::queries::load_workspace;
use super::{
    clean_error, db_error, lesson_for_run, load_job, new_id, require_active_token,
    section_source_ids, validate_generated_section, validate_quality_report, Result,
};

pub(in crate::classwork) fn begin_section(
    database: &Database,
    request: BeginClassworkSectionRequest,
) -> Result<ClassworkSectionStart> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        let active_count: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM classwork_sections WHERE run_id = ?1 AND status = 'generating'",
                [&request.run_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if active_count > 0 {
            return Err("A lesson section is already being created.".to_owned());
        }

        let section_id = if let Some(section_id) = request.section_id.as_deref() {
            transaction
                .query_row(
                    "SELECT id FROM classwork_sections WHERE id = ?1 AND run_id = ?2 AND status = 'failed'",
                    params![section_id, request.run_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| "Only a section that needs attention can be tried again.".to_owned())?
        } else {
            let failed_count: i64 = transaction
                .query_row(
                    "SELECT COUNT(*) FROM classwork_sections WHERE run_id = ?1 AND status = 'failed'",
                    [&request.run_id],
                    |row| row.get(0),
                )
                .map_err(db_error)?;
            if failed_count > 0 {
                return Err("Try the section that needs attention before continuing.".to_owned());
            }
            transaction
                .query_row(
                    "SELECT id FROM classwork_sections WHERE run_id = ?1 AND status = 'pending' ORDER BY sequence LIMIT 1",
                    [&request.run_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| "All lesson sections are already ready.".to_owned())?
        };

        let token = Uuid::new_v4().to_string();
        transaction
            .execute(
                "UPDATE classwork_sections SET status = 'generating', generation_token = ?1,
                 attempt_count = attempt_count + 1, last_error = NULL, quality_outcome = NULL,
                 repair_attempted = NULL, scrubbed_claim_count = NULL, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2",
                params![token, section_id],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "UPDATE classwork_runs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [&request.run_id],
            )
            .map_err(db_error)?;
        let job = load_job(
            &transaction,
            &request.run_id,
            &section_id,
            &token,
            lesson.clone(),
        )?;
        transaction.commit().map_err(db_error)?;
        Ok(ClassworkSectionStart {
            job,
            workspace: load_workspace(connection, lesson)?,
        })
    })
}

pub(in crate::classwork) fn complete_section(
    database: &Database,
    request: CompleteClassworkSectionRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_active_token(
            &transaction,
            &request.run_id,
            &request.section_id,
            &request.generation_token,
        )?;
        let source_ids = section_source_ids(&transaction, &request.section_id)?;
        let allowed_sources = source_ids.keys().cloned().collect();
        validate_generated_section(
            &request.section,
            lesson.learning_goals.len(),
            &allowed_sources,
        )?;
        let attempt_number: i64 = transaction
            .query_row(
                "SELECT attempt_count FROM classwork_sections WHERE id = ?1",
                [&request.section_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "DELETE FROM classwork_blocks WHERE section_id = ?1",
                [&request.section_id],
            )
            .map_err(db_error)?;
        for (index, block) in request.section.blocks.iter().enumerate() {
            let block_id = new_id("classwork-block");
            transaction
                .execute(
                    "INSERT INTO classwork_blocks (id, section_id, sequence, kind, text)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        block_id,
                        request.section_id,
                        (index + 1) as i64,
                        block.kind,
                        block.text.trim()
                    ],
                )
                .map_err(db_error)?;
            for goal_number in &block.learning_goal_numbers {
                transaction
                    .execute(
                        "INSERT INTO classwork_block_learning_goals (block_id, learning_goal_number)
                         VALUES (?1, ?2)",
                        params![block_id, goal_number],
                    )
                    .map_err(db_error)?;
            }
            for source_key in &block.source_material_keys {
                let source_id = source_ids.get(source_key).ok_or_else(|| {
                    "The section cited source material that is not available.".to_owned()
                })?;
                transaction
                    .execute(
                        "INSERT INTO classwork_block_sources (block_id, source_id) VALUES (?1, ?2)",
                        params![block_id, source_id],
                    )
                    .map_err(db_error)?;
            }
        }
        persist_quality_report(
            &transaction,
            &request.section_id,
            attempt_number,
            &request.section.quality,
        )?;
        transaction
            .execute(
                "UPDATE classwork_sections SET status = 'done', generated_title = ?1,
                 learning_goal_numbers = ?2, generation_token = NULL, last_error = NULL,
                 quality_outcome = ?3, repair_attempted = ?4, scrubbed_claim_count = ?5,
                 updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
                params![
                    request.section.title.trim(),
                    serde_json::to_string(&request.section.learning_goal_numbers)
                        .map_err(|error| error.to_string())?,
                    request.section.quality.outcome,
                    request.section.quality.repair_attempted,
                    request.section.quality.scrubbed_claim_count,
                    request.section_id,
                ],
            )
            .map_err(db_error)?;
        update_run_after_section(&transaction, &request.run_id)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::classwork) fn fail_section(
    database: &Database,
    request: FailClassworkSectionRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_active_token(&transaction, &request.run_id, &request.section_id, &request.generation_token)?;
        let message = clean_error(&request.message);
        let attempt_number: i64 = transaction
            .query_row(
                "SELECT attempt_count FROM classwork_sections WHERE id = ?1",
                [&request.section_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if let Some(quality) = request.quality.as_ref() {
            validate_quality_report(quality, true)?;
            persist_quality_report(
                &transaction,
                &request.section_id,
                attempt_number,
                quality,
            )?;
        }
        transaction.execute(
            "UPDATE classwork_sections SET status = 'failed', generation_token = NULL,
             last_error = ?1, quality_outcome = ?2, repair_attempted = ?3,
             scrubbed_claim_count = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
            params![
                message,
                request.quality.as_ref().map(|quality| quality.outcome.as_str()),
                request.quality.as_ref().map(|quality| quality.repair_attempted),
                request.quality.as_ref().map(|quality| quality.scrubbed_claim_count),
                request.section_id,
            ],
        ).map_err(db_error)?;
        transaction.execute(
            "UPDATE classwork_runs SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            [&request.run_id],
        ).map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

fn persist_quality_report(
    connection: &Connection,
    section_id: &str,
    attempt_number: i64,
    report: &ClassworkQualityReport,
) -> Result<()> {
    for (pass_index, pass) in report.passes.iter().enumerate() {
        let pass_id = new_id("classwork-validation");
        connection
            .execute(
                "INSERT INTO classwork_validation_passes (
                    id, section_id, attempt_number, sequence, stage, passed
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    pass_id,
                    section_id,
                    attempt_number,
                    (pass_index + 1) as i64,
                    pass.stage,
                    pass.passed,
                ],
            )
            .map_err(db_error)?;
        for (check_index, check) in pass.checks.iter().enumerate() {
            connection
                .execute(
                    "INSERT INTO classwork_validation_checks (
                        validation_pass_id, sequence, check_name, passed, details
                     ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        pass_id,
                        (check_index + 1) as i64,
                        check.check,
                        check.passed,
                        serde_json::to_string(&check.details).map_err(|error| error.to_string())?,
                    ],
                )
                .map_err(db_error)?;
        }
    }
    Ok(())
}

fn update_run_after_section(connection: &Connection, run_id: &str) -> Result<()> {
    let (pending, failed): (i64, i64) = connection.query_row(
        "SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) FROM classwork_sections WHERE run_id = ?1",
        [run_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(db_error)?;
    let status = if failed > 0 {
        "failed"
    } else if pending > 0 {
        "paused"
    } else {
        "complete"
    };
    connection
        .execute(
            "UPDATE classwork_runs SET status = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![status, run_id],
        )
        .map_err(db_error)?;
    if status == "complete" {
        ensure_initial_document_version(connection, run_id)?;
    }
    Ok(())
}

fn ensure_initial_document_version(connection: &Connection, run_id: &str) -> Result<()> {
    let current_number = connection
        .query_row(
            "SELECT current_document_version_number FROM classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(db_error)?;
    if current_number > 0 {
        return Ok(());
    }
    let version_id = new_id("classwork-version");
    connection
        .execute(
            "INSERT INTO classwork_document_versions (
                id, run_id, version_number, status, change_kind
             ) VALUES (?1, ?2, 1, 'draft', 'initial')",
            params![version_id, run_id],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "INSERT INTO classwork_document_sections (
                id, document_version_id, run_id, base_section_id, title,
                learning_goal_numbers, quality_report, regenerated
             )
             SELECT 'classwork-version-section-' || lower(hex(randomblob(16))),
                    ?1, ?2, sections.id, sections.generated_title,
                    sections.learning_goal_numbers, NULL, 0
             FROM classwork_sections sections
             WHERE sections.run_id = ?2 AND sections.status = 'done'
             ORDER BY sections.sequence",
            params![version_id, run_id],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "INSERT INTO classwork_document_blocks (
                id, document_version_id, run_id, base_block_id, section_id,
                sequence, kind, text, teacher_edited, learning_goal_numbers,
                source_material_keys
             )
             SELECT 'classwork-version-block-' || lower(hex(randomblob(16))),
                    ?1, ?2, blocks.id, blocks.section_id, blocks.sequence,
                    blocks.kind, blocks.text, 0,
                    COALESCE((
                        SELECT json_group_array(goals.learning_goal_number)
                        FROM (
                            SELECT links.learning_goal_number
                            FROM classwork_block_learning_goals links
                            WHERE links.block_id = blocks.id
                            ORDER BY links.learning_goal_number
                        ) goals
                    ), '[]'),
                    COALESCE((
                        SELECT json_group_array(source_keys.source_key)
                        FROM (
                            SELECT sources.source_key
                            FROM classwork_block_sources source_links
                            JOIN classwork_sources sources ON sources.id = source_links.source_id
                            WHERE source_links.block_id = blocks.id
                            ORDER BY sources.sequence
                        ) source_keys
                    ), '[]')
             FROM classwork_blocks blocks
             JOIN classwork_sections sections ON sections.id = blocks.section_id
             WHERE sections.run_id = ?2
             ORDER BY sections.sequence, blocks.sequence",
            params![version_id, run_id],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "UPDATE classwork_runs
             SET current_document_version_number = 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND current_document_version_number = 0",
            [run_id],
        )
        .map_err(db_error)?;
    Ok(())
}

#[cfg(test)]
mod tests {

    use crate::classwork::repository::test_fixtures::setup;
    use crate::classwork::repository::test_support::*;
    use crate::classwork::repository::*;

    #[test]
    fn persists_each_section_before_claiming_the_next() {
        let (database, corpus, context) = setup();
        let started = start_run(
            &database,
            &corpus,
            StartClassworkRunRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("run");
        let run = started.run.expect("run");
        assert_eq!(run.status, "paused");
        assert_eq!(run.sections.len(), 2);
        assert_eq!(run.sources.len(), 2);
        assert_eq!(run.sources[1].title, "4.2 Equivalent fractions");
        assert!(!run.figures.is_empty());
        assert!(run
            .figures
            .iter()
            .all(|figure| figure.source_material_key == "ch04-b014"));
        let figure_url = figure_data_url(
            &database,
            &corpus,
            ClassworkFigureRequest {
                context: context.clone(),
                lesson_id: "lesson".to_owned(),
                figure_id: run.figures[0].id.clone(),
            },
        )
        .expect("figure data");
        assert!(figure_url.starts_with("data:image/png;base64,"));
        let first = begin_section(
            &database,
            BeginClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: None,
            },
        )
        .expect("first");
        assert_eq!(first.job.step.teacher_activity, "Display the models.");
        // A confirmed lesson always has a plan behind it now, so its job
        // carries the step that plan sets rather than nothing.
        assert_eq!(
            first
                .job
                .step
                .plan_step
                .as_ref()
                .map(|step| step.title.as_str()),
            Some("Compare models")
        );
        assert_eq!(first.job.lesson.learning_goals.len(), 2);
        assert_eq!(first.job.source_materials[0].key, "ch04-b016");
        assert_eq!(
            first.job.source_materials[0].text,
            "We find equivalent fractions by multiplying or dividing the numerator and the denominator by the same whole number."
        );
        assert_eq!(first.job.source_materials[1].key, "ch04-b014");
        assert!(first.job.source_materials[1]
            .text
            .starts_with("Fractions that represent the same part of a whole"));
        assert_eq!(first.job.source_materials.len(), 2);
        assert_eq!(first.job.source_materials[0].publisher, "Siyavula");
        let persisted_source = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT source_record_id, licence_name, sequence
                     FROM classwork_sources WHERE run_id = ?1 ORDER BY sequence LIMIT 1",
                    [&run.id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, i64>(2)?,
                        ))
                    },
                )
            })
            .expect("persisted source");
        assert_eq!(persisted_source.0, "ch04-b016");
        assert_eq!(
            persisted_source.1,
            "Creative Commons Attribution 3.0 Unported"
        );
        assert_eq!(persisted_source.2, 1);
        let saved = complete_section(
            &database,
            CompleteClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: first.job.section_id,
                generation_token: first.job.generation_token,
                section: generated("Comparing fraction models"),
            },
        )
        .expect("saved");
        assert_eq!(saved.run.as_ref().expect("run").sections[0].status, "done");
        assert_eq!(saved.run.as_ref().expect("run").sections[0].blocks.len(), 4);
        let saved_section = &saved.run.as_ref().expect("run").sections[0];
        assert_eq!(
            saved_section.quality.as_ref().expect("quality").outcome,
            "passed"
        );
        assert_eq!(saved_section.blocks[0].learning_goal_numbers, vec![1]);
        assert_eq!(
            saved_section.blocks[0].source_material_keys,
            vec!["ch04-b016"]
        );
        let persisted_checks = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM classwork_validation_checks checks
                     JOIN classwork_validation_passes passes ON passes.id = checks.validation_pass_id
                     WHERE passes.section_id = ?1",
                    [&saved_section.id],
                    |row| row.get::<_, i64>(0),
                )
            })
            .expect("quality checks");
        assert_eq!(persisted_checks, 6);
        let second = begin_section(
            &database,
            BeginClassworkSectionRequest {
                context,
                run_id: run.id,
                section_id: None,
            },
        )
        .expect("second");
        assert_eq!(second.job.step.sequence, 2);
        assert_eq!(
            second.workspace.run.expect("run").sections[0].status,
            "done"
        );
    }

    #[test]
    fn retry_claims_only_the_failed_section_and_recovery_exposes_an_interruption() {
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
        let active = begin_section(
            &database,
            BeginClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: None,
            },
        )
        .expect("active")
        .job;
        let failed = fail_section(
            &database,
            FailClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: active.section_id.clone(),
                generation_token: active.generation_token,
                message: "The section could not be created.".to_owned(),
                quality: Some(failed_quality()),
            },
        )
        .expect("failed");
        assert_eq!(
            failed.run.as_ref().expect("run").sections[1].status,
            "pending"
        );
        assert_eq!(
            failed.run.as_ref().expect("run").sections[0]
                .quality
                .as_ref()
                .expect("failed quality")
                .outcome,
            "failed"
        );
        let retry = begin_section(
            &database,
            BeginClassworkSectionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: Some(active.section_id),
            },
        )
        .expect("retry");
        assert_eq!(retry.job.step.sequence, 1);
        assert!(retry.workspace.run.as_ref().expect("run").sections[0]
            .quality
            .is_none());
        let historical_passes = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM classwork_validation_passes WHERE section_id = ?1",
                    [&retry.job.section_id],
                    |row| row.get::<_, i64>(0),
                )
            })
            .expect("historical quality");
        assert_eq!(historical_passes, 1);
        let reopened = get_workspace(
            &database,
            &corpus,
            ClassworkWorkspaceRequest {
                context,
                lesson_id: "lesson".to_owned(),
            },
        )
        .expect("reopened");
        assert_eq!(reopened.run.as_ref().expect("run").status, "failed");
        assert!(reopened.run.as_ref().expect("run").sections[0]
            .last_error
            .as_deref()
            .expect("error")
            .contains("interrupted"));
    }
}
