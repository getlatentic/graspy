use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::classwork::domain::*;
use crate::db::Database;
use crate::lesson_planning::LessonContextRequest;

use super::queries::{
    load_blocks, load_current_document_version, load_document_section, load_workspace,
};
use super::versioning::require_current_draft_version;
use super::{
    clean_error, db_error, lesson_for_run, load_job, new_id, section_source_ids,
    validate_generated_section, Result,
};

pub(in crate::classwork) fn begin_section_regeneration(
    database: &Database,
    request: BeginClassworkSectionRegenerationRequest,
) -> Result<ClassworkSectionStart> {
    let direction = validate_teacher_direction(request.teacher_direction.as_deref())?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        let current = require_current_draft_version(
            &transaction,
            &request.run_id,
            request.expected_version_number,
        )?;
        let section_exists = transaction
            .query_row(
                "SELECT 1 FROM classwork_sections
                 WHERE id = ?1 AND run_id = ?2 AND status = 'done'",
                params![request.section_id, request.run_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(db_error)?
            .is_some();
        if !section_exists {
            return Err("Only a finished lesson section can be recreated.".to_owned());
        }
        let stored = load_document_section(&transaction, &current.id, &request.section_id)?
            .ok_or_else(|| "This section is no longer part of the current draft.".to_owned())?;
        let previous_section = ClassworkSectionSnapshot {
            title: stored.title,
            learning_goal_numbers: stored.learning_goal_numbers,
            blocks: load_blocks(&transaction, &request.section_id, Some(&current.id))?,
        };
        let sequence: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1
                 FROM classwork_section_regenerations WHERE run_id = ?1",
                [&request.run_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        let regeneration_id = new_id("classwork-regeneration");
        let token = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO classwork_section_regenerations (
                    id, run_id, section_id, sequence, source_document_version_id,
                    source_version_number, status, generation_token, teacher_direction
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'generating', ?7, ?8)",
                params![
                    regeneration_id,
                    request.run_id,
                    request.section_id,
                    sequence,
                    current.id,
                    current.version_number,
                    token,
                    direction,
                ],
            )
            .map_err(db_error)?;
        let mut job = load_job(
            &transaction,
            &request.run_id,
            &request.section_id,
            &token,
            lesson.clone(),
        )?;
        job.regeneration = Some(ClassworkRegenerationContext {
            id: regeneration_id,
            source_version_number: current.version_number,
            teacher_direction: direction,
            previous_section,
        });
        transaction.commit().map_err(db_error)?;
        Ok(ClassworkSectionStart {
            job,
            workspace: load_workspace(connection, lesson)?,
        })
    })
}

pub(in crate::classwork) fn complete_section_regeneration(
    database: &Database,
    request: CompleteClassworkSectionRegenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        let active = require_active_regeneration(
            &transaction,
            &request.run_id,
            &request.regeneration_id,
            &request.section_id,
            &request.generation_token,
        )?;
        let current = load_current_document_version(&transaction, &request.run_id)?
            .ok_or_else(|| "The lesson draft is no longer available.".to_owned())?;
        if current.id != active.source_document_version_id
            || current.version_number != active.source_version_number
            || current.status != "draft"
        {
            return Err("This draft changed while the section was being recreated. Reopen it before trying again.".to_owned());
        }
        let allowed_sources = section_source_ids(&transaction, &request.section_id)?
            .into_keys()
            .collect();
        validate_generated_section(
            &request.section,
            lesson.learning_goals.len(),
            &allowed_sources,
        )?;
        validate_regenerated_section_changed(
            &transaction,
            &current.id,
            &request.section_id,
            &request.section,
        )?;

        let next_version_number = current.version_number + 1;
        let next_version_id = new_id("classwork-version");
        transaction
            .execute(
                "INSERT INTO classwork_document_versions (
                    id, run_id, version_number, status, previous_version_id,
                    change_kind, changed_section_id, teacher_direction
                 ) VALUES (?1, ?2, ?3, 'draft', ?4, 'section_regeneration', ?5, ?6)",
                params![
                    next_version_id,
                    request.run_id,
                    next_version_number,
                    current.id,
                    request.section_id,
                    active.teacher_direction,
                ],
            )
            .map_err(db_error)?;
        insert_regenerated_document_sections(
            &transaction,
            &next_version_id,
            &current.id,
            &request.run_id,
            &request.section_id,
            &request.section,
        )?;
        insert_regenerated_document_blocks(
            &transaction,
            &next_version_id,
            &current.id,
            &request.run_id,
            &request.section_id,
            &request.section,
        )?;
        let changed = transaction
            .execute(
                "UPDATE classwork_runs
                 SET current_document_version_number = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2 AND current_document_version_number = ?3",
                params![next_version_number, request.run_id, current.version_number],
            )
            .map_err(db_error)?;
        if changed != 1 {
            return Err("This draft changed while the section was being recreated. Reopen it before trying again.".to_owned());
        }
        transaction
            .execute(
                "UPDATE classwork_section_regenerations
                 SET status = 'complete', generation_token = NULL,
                     target_document_version_id = ?1, last_error = NULL,
                     updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
                 WHERE id = ?2 AND status = 'generating'",
                params![next_version_id, request.regeneration_id],
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::classwork) fn fail_section_regeneration(
    database: &Database,
    request: FailClassworkSectionRegenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    finish_section_regeneration(
        database,
        FinishSectionRegeneration {
            context: request.context,
            run_id: request.run_id,
            regeneration_id: request.regeneration_id,
            section_id: request.section_id,
            generation_token: request.generation_token,
            status: "failed",
            last_error: Some(clean_error(&request.message)),
        },
    )
}

pub(in crate::classwork) fn cancel_section_regeneration(
    database: &Database,
    request: CancelClassworkSectionRegenerationRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    finish_section_regeneration(
        database,
        FinishSectionRegeneration {
            context: request.context,
            run_id: request.run_id,
            regeneration_id: request.regeneration_id,
            section_id: request.section_id,
            generation_token: request.generation_token,
            status: "cancelled",
            last_error: None,
        },
    )
}

struct ActiveSectionRegeneration {
    source_document_version_id: String,
    source_version_number: i64,
    teacher_direction: Option<String>,
}

fn require_active_regeneration(
    connection: &Connection,
    run_id: &str,
    regeneration_id: &str,
    section_id: &str,
    token: &str,
) -> Result<ActiveSectionRegeneration> {
    connection
        .query_row(
            "SELECT source_document_version_id, source_version_number, teacher_direction
             FROM classwork_section_regenerations
             WHERE id = ?1 AND run_id = ?2 AND section_id = ?3
               AND status = 'generating' AND generation_token = ?4",
            params![regeneration_id, run_id, section_id, token],
            |row| {
                Ok(ActiveSectionRegeneration {
                    source_document_version_id: row.get(0)?,
                    source_version_number: row.get(1)?,
                    teacher_direction: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "graspy stopped before this section was saved. Open the lesson classwork to build it again.".to_owned())
}

struct FinishSectionRegeneration {
    context: LessonContextRequest,
    run_id: String,
    regeneration_id: String,
    section_id: String,
    generation_token: String,
    status: &'static str,
    last_error: Option<String>,
}

fn finish_section_regeneration(
    database: &Database,
    request: FinishSectionRegeneration,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        require_active_regeneration(
            &transaction,
            &request.run_id,
            &request.regeneration_id,
            &request.section_id,
            &request.generation_token,
        )?;
        let changed = transaction
            .execute(
                "UPDATE classwork_section_regenerations
                 SET status = ?1, generation_token = NULL, last_error = ?2,
                     updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
                 WHERE id = ?3 AND status = 'generating'",
                params![request.status, request.last_error, request.regeneration_id],
            )
            .map_err(db_error)?;
        if changed != 1 {
            return Err("graspy stopped before this section was saved. Open the lesson classwork to build it again.".to_owned());
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

fn validate_teacher_direction(direction: Option<&str>) -> Result<Option<String>> {
    let Some(direction) = direction else {
        return Ok(None);
    };
    let value = direction.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > 1_000 || value.chars().any(char::is_control) {
        return Err("Keep the direction under 1,000 characters and use ordinary text.".to_owned());
    }
    Ok(Some(value.to_owned()))
}

fn validate_regenerated_section_changed(
    connection: &Connection,
    version_id: &str,
    section_id: &str,
    section: &GeneratedClassworkSectionInput,
) -> Result<()> {
    let previous = load_document_section(connection, version_id, section_id)?
        .ok_or_else(|| "This section is no longer part of the current draft.".to_owned())?;
    if normalize_classwork_text(&previous.title) != normalize_classwork_text(&section.title) {
        return Ok(());
    }
    let previous_blocks = load_blocks(connection, section_id, Some(version_id))?;
    let changed = section.blocks.iter().any(|candidate| {
        previous_blocks
            .iter()
            .find(|saved| saved.kind == candidate.kind)
            .map(|saved| {
                normalize_classwork_text(&saved.text) != normalize_classwork_text(&candidate.text)
            })
            .unwrap_or(true)
    });
    if changed {
        Ok(())
    } else {
        Err("The recreated section repeated the current wording. Add a more specific direction and try again.".to_owned())
    }
}

fn normalize_classwork_text(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn insert_regenerated_document_sections(
    connection: &Connection,
    target_version_id: &str,
    source_version_id: &str,
    run_id: &str,
    section_id: &str,
    section: &GeneratedClassworkSectionInput,
) -> Result<()> {
    connection
        .execute(
            "INSERT INTO classwork_document_sections (
                id, document_version_id, run_id, base_section_id, title,
                learning_goal_numbers, quality_report, regenerated
             )
             SELECT 'classwork-version-section-' || lower(hex(randomblob(16))),
                    ?1, run_id, base_section_id, title, learning_goal_numbers,
                    quality_report, regenerated
             FROM classwork_document_sections
             WHERE document_version_id = ?2 AND base_section_id <> ?3",
            params![target_version_id, source_version_id, section_id],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "INSERT INTO classwork_document_sections (
                id, document_version_id, run_id, base_section_id, title,
                learning_goal_numbers, quality_report, regenerated
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)",
            params![
                new_id("classwork-version-section"),
                target_version_id,
                run_id,
                section_id,
                section.title.trim(),
                serde_json::to_string(&section.learning_goal_numbers)
                    .map_err(|error| error.to_string())?,
                serde_json::to_string(&section.quality).map_err(|error| error.to_string())?,
            ],
        )
        .map_err(db_error)?;
    Ok(())
}

fn insert_regenerated_document_blocks(
    connection: &Connection,
    target_version_id: &str,
    source_version_id: &str,
    run_id: &str,
    section_id: &str,
    section: &GeneratedClassworkSectionInput,
) -> Result<()> {
    connection
        .execute(
            "INSERT INTO classwork_document_blocks (
                id, document_version_id, run_id, base_block_id, section_id,
                sequence, kind, text, teacher_edited, learning_goal_numbers,
                source_material_keys
             )
             SELECT 'classwork-version-block-' || lower(hex(randomblob(16))),
                    ?1, run_id, base_block_id, section_id, sequence, kind,
                    text, teacher_edited, learning_goal_numbers, source_material_keys
             FROM classwork_document_blocks
             WHERE document_version_id = ?2 AND section_id <> ?3",
            params![target_version_id, source_version_id, section_id],
        )
        .map_err(db_error)?;
    for block in &section.blocks {
        let (base_block_id, sequence): (String, i64) = connection
            .query_row(
                "SELECT base_block_id, sequence
                 FROM classwork_document_blocks
                 WHERE document_version_id = ?1 AND section_id = ?2 AND kind = ?3",
                params![source_version_id, section_id, block.kind],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(db_error)?;
        connection
            .execute(
                "INSERT INTO classwork_document_blocks (
                    id, document_version_id, run_id, base_block_id, section_id,
                    sequence, kind, text, teacher_edited, learning_goal_numbers,
                    source_material_keys
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)",
                params![
                    new_id("classwork-version-block"),
                    target_version_id,
                    run_id,
                    base_block_id,
                    section_id,
                    sequence,
                    block.kind,
                    block.text.trim(),
                    serde_json::to_string(&block.learning_goal_numbers)
                        .map_err(|error| error.to_string())?,
                    serde_json::to_string(&block.source_material_keys)
                        .map_err(|error| error.to_string())?,
                ],
            )
            .map_err(db_error)?;
    }
    Ok(())
}
