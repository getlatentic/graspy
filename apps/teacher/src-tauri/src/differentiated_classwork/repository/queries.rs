use rusqlite::{params, Connection, OptionalExtension};

use crate::classwork::domain::ConfirmedLessonContext;
use crate::db::Database;
use crate::differentiated_classwork::domain::*;

use super::{
    confirmed_lesson, db_error, parse_json, require_approved_base_run, require_complete_evidence,
    Result,
};

pub(crate) fn get_workspace(
    database: &Database,
    request: DifferentiatedWorkspaceRequest,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot> {
    database.with_connection_mut(|connection| {
        let lesson = confirmed_lesson(connection, &request.context, &request.lesson_id)?;
        recover_interrupted_work(connection, &lesson.lesson_version_id)?;
        load_workspace(connection, lesson)
    })
}

pub(super) fn load_workspace(
    connection: &Connection,
    lesson: ConfirmedLessonContext,
) -> Result<DifferentiatedClassworkWorkspaceSnapshot> {
    let readiness = readiness(connection, &lesson.lesson_version_id)?;
    let current = current_inputs(connection, &lesson.lesson_version_id)?;
    let run = if let Some((base_run_id, evidence_set_id, evidence_revision)) = current {
        let row = connection
            .query_row(
                "SELECT id, status FROM differentiated_classwork_runs
                 WHERE base_run_id = ?1 AND evidence_set_id = ?2 AND evidence_revision = ?3",
                params![base_run_id, evidence_set_id, evidence_revision],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(db_error)?;
        row.map(|(id, status)| -> Result<DifferentiatedClassworkRun> {
            Ok(DifferentiatedClassworkRun {
                task_id: crate::differentiated_classwork::generation::task_id_for_run(&id),
                groups: load_groups(connection, &id)?,
                id,
                status,
                base_run_id,
                evidence_set_id,
                evidence_revision,
            })
        })
        .transpose()?
    } else {
        None
    };
    Ok(DifferentiatedClassworkWorkspaceSnapshot {
        lesson,
        readiness,
        run,
    })
}

fn load_groups(connection: &Connection, run_id: &str) -> Result<Vec<DifferentiatedClassworkGroup>> {
    let mut statement = connection
        .prepare(
            "SELECT id, evidence_group_id, position, name,
                    learner_state_snapshot, session_signals_snapshot
             FROM differentiated_classwork_groups WHERE run_id = ?1 ORDER BY position",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map([run_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    rows.into_iter()
        .map(|(id, evidence_group_id, position, name, states, signals)| {
            Ok(DifferentiatedClassworkGroup {
                sections: load_sections(connection, run_id, &id)?,
                id,
                evidence_group_id,
                position,
                name,
                learner_state: parse_json(&states, "saved group learning state")?,
                session_signals: parse_json(&signals, "saved overall lesson signals")?,
            })
        })
        .collect()
}

fn load_sections(
    connection: &Connection,
    run_id: &str,
    group_id: &str,
) -> Result<Vec<DifferentiatedClassworkSection>> {
    let mut statement = connection
        .prepare(
            "SELECT id, base_section_id, sequence, step_title, status, attempt_count,
                    last_error, generated_title, learning_goal_numbers, quality_report,
                    base_section_snapshot
             FROM differentiated_classwork_sections
             WHERE run_id = ?1 AND group_id = ?2 ORDER BY sequence",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(params![run_id, group_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, String>(10)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            Ok(DifferentiatedClassworkSection {
                blocks: load_generated_blocks(connection, &row.0)?,
                id: row.0,
                base_section_id: row.1,
                sequence: row.2,
                step_title: row.3,
                status: row.4,
                attempt_count: row.5,
                last_error: row.6,
                title: row.7,
                learning_goal_numbers: row
                    .8
                    .as_deref()
                    .map(|value| parse_json(value, "adjusted learning goals"))
                    .transpose()?
                    .unwrap_or_default(),
                quality: row
                    .9
                    .as_deref()
                    .map(|value| parse_json(value, "group-classwork quality report"))
                    .transpose()?,
                base_section: parse_json(&row.10, "original section snapshot")?,
            })
        })
        .collect()
}

fn load_generated_blocks(
    connection: &Connection,
    section_id: &str,
) -> Result<Vec<DifferentiatedClassworkBlock>> {
    let mut statement = connection
        .prepare(
            "SELECT id, base_block_id, kind, text, learning_goal_numbers, source_material_keys
             FROM differentiated_classwork_blocks WHERE section_id = ?1 ORDER BY sequence",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map([section_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    rows.into_iter()
        .map(|row| {
            Ok(DifferentiatedClassworkBlock {
                id: row.0,
                base_block_id: row.1,
                kind: row.2,
                text: row.3,
                learning_goal_numbers: parse_json(&row.4, "adjusted block learning goals")?,
                source_material_keys: parse_json(&row.5, "adjusted block sources")?,
            })
        })
        .collect()
}

fn recover_interrupted_work(connection: &mut Connection, lesson_version_id: &str) -> Result<()> {
    let transaction = connection.transaction().map_err(db_error)?;
    transaction
        .execute(
            "UPDATE differentiated_classwork_sections
             SET status = 'failed', generation_token = NULL,
                 last_error = 'Creation was interrupted when the app closed. Try this section again.',
                 updated_at = CURRENT_TIMESTAMP
             WHERE status = 'generating' AND run_id IN (
                 SELECT id FROM differentiated_classwork_runs WHERE lesson_version_id = ?1
             )",
            [lesson_version_id],
        )
        .map_err(db_error)?;
    transaction
        .execute(
            "UPDATE differentiated_classwork_runs SET status = 'failed', updated_at = CURRENT_TIMESTAMP
             WHERE lesson_version_id = ?1 AND EXISTS (
                 SELECT 1 FROM differentiated_classwork_sections
                 WHERE run_id = differentiated_classwork_runs.id AND status = 'failed'
             ) AND status = 'running'",
            [lesson_version_id],
        )
        .map_err(db_error)?;
    transaction.commit().map_err(db_error)?;
    Ok(())
}

fn readiness(
    connection: &Connection,
    lesson_version_id: &str,
) -> Result<DifferentiatedClassworkReadiness> {
    // Each blocker is the refusal its own check would give, rather than a second
    // sentence written beside it. The two had already drifted: this named a
    // group count the check never looks at, and told a teacher who has recorded
    // nothing to "finish" results for three groups.
    let mut blockers = Vec::new();
    if let Err(reason) = require_approved_base_run(connection, lesson_version_id) {
        blockers.push(reason);
    }
    if let Err(reason) = require_complete_evidence(connection, lesson_version_id) {
        blockers.push(reason);
    }
    Ok(DifferentiatedClassworkReadiness {
        can_start: blockers.is_empty(),
        blockers,
    })
}

fn current_inputs(
    connection: &Connection,
    lesson_version_id: &str,
) -> Result<Option<(String, String, i64)>> {
    let base = connection
        .query_row(
            "SELECT runs.id FROM classwork_runs runs
             JOIN classwork_document_versions versions
               ON versions.run_id = runs.id
              AND versions.version_number = runs.current_document_version_number
              AND versions.status = 'approved'
             WHERE runs.lesson_version_id = ?1 AND runs.status = 'complete'",
            [lesson_version_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?;
    let evidence = connection
        .query_row(
            "SELECT id, revision FROM lesson_evidence_sets
             WHERE lesson_version_id = ?1 AND status = 'complete'",
            [lesson_version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    Ok(base
        .zip(evidence)
        .map(|(base, (evidence, revision))| (base, evidence, revision)))
}
