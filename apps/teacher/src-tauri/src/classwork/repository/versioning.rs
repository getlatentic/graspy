use rusqlite::{params, Connection, OptionalExtension};

use crate::classwork::domain::*;
use crate::db::Database;

use super::queries::{
    load_blocks, load_current_document_version, load_document_section, load_workspace,
};
use super::{db_error, lesson_for_run, new_id, Result};

pub(in crate::classwork) fn edit_block(
    database: &Database,
    request: EditClassworkBlockRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    let text = validate_teacher_edit(&request.text)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        let current = require_current_draft_version(
            &transaction,
            &request.run_id,
            request.expected_version_number,
        )?;
        let changed_section_id = transaction
            .query_row(
                "SELECT version_blocks.section_id
                 FROM classwork_document_blocks version_blocks
                 JOIN classwork_blocks blocks ON blocks.id = version_blocks.base_block_id
                 JOIN classwork_sections sections ON sections.id = blocks.section_id
                 WHERE version_blocks.document_version_id = ?1
                   AND version_blocks.base_block_id = ?2
                   AND sections.run_id = ?3",
                params![current.id, request.block_id, request.run_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_error)?;
        let Some(changed_section_id) = changed_section_id else {
            return Err(
                "That activity is no longer part of this draft. Reopen the lesson and try again."
                    .to_owned(),
            );
        };

        let next_version_number = current.version_number + 1;
        let next_version_id = new_id("classwork-version");
        transaction
            .execute(
                "INSERT INTO classwork_document_versions (
                    id, run_id, version_number, status, previous_version_id,
                    change_kind, changed_section_id
                 ) VALUES (?1, ?2, ?3, 'draft', ?4, 'teacher_edit', ?5)",
                params![
                    next_version_id,
                    request.run_id,
                    next_version_number,
                    current.id,
                    changed_section_id
                ],
            )
            .map_err(db_error)?;
        copy_document_sections(&transaction, &next_version_id, &current.id)?;
        transaction
            .execute(
                "INSERT INTO classwork_document_blocks (
                    id, document_version_id, run_id, base_block_id, section_id,
                    sequence, kind, text, teacher_edited, learning_goal_numbers,
                    source_material_keys
                 )
                 SELECT
                    'classwork-version-block-' || lower(hex(randomblob(16))),
                    ?1, run_id, base_block_id, section_id, sequence, kind,
                    CASE WHEN base_block_id = ?2 THEN ?3 ELSE text END,
                    CASE WHEN base_block_id = ?2 THEN 1 ELSE teacher_edited END,
                    learning_goal_numbers, source_material_keys
                 FROM classwork_document_blocks
                 WHERE document_version_id = ?4",
                params![next_version_id, request.block_id, text, current.id],
            )
            .map_err(db_error)?;
        let changed = transaction
            .execute(
                "UPDATE classwork_runs
                 SET current_document_version_number = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?2 AND current_document_version_number = ?3",
                params![
                    next_version_number,
                    request.run_id,
                    request.expected_version_number
                ],
            )
            .map_err(db_error)?;
        if changed != 1 {
            return Err(
                "This draft changed in another window. Reopen it before saving your edit."
                    .to_owned(),
            );
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::classwork) fn approve_version(
    database: &Database,
    request: ApproveClassworkVersionRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        let current = require_current_draft_version(
            &transaction,
            &request.run_id,
            request.expected_version_number,
        )?;
        let changed = transaction
            .execute(
                "UPDATE classwork_document_versions
                 SET status = 'approved', approved_at = CURRENT_TIMESTAMP
                 WHERE id = ?1 AND run_id = ?2 AND status = 'draft'",
                params![current.id, request.run_id],
            )
            .map_err(db_error)?;
        if changed != 1 {
            return Err("This draft changed before it could be approved. Reopen it and review the latest version.".to_owned());
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::classwork) fn restore_section(
    database: &Database,
    request: RestoreClassworkSectionRequest,
) -> Result<ClassworkWorkspaceSnapshot> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = lesson_for_run(&transaction, &request.context, &request.run_id)?;
        let current = require_current_draft_version(
            &transaction,
            &request.run_id,
            request.expected_version_number,
        )?;
        if request.source_version_number == current.version_number {
            return Err("That section version is already current.".to_owned());
        }
        let source_version_id = transaction
            .query_row(
                "SELECT id FROM classwork_document_versions
                 WHERE run_id = ?1 AND version_number = ?2",
                params![request.run_id, request.source_version_number],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(db_error)?
            .ok_or_else(|| "That earlier section version is no longer available.".to_owned())?;
        if load_document_section(&transaction, &source_version_id, &request.section_id)?.is_none() {
            return Err("That section was not part of the selected draft.".to_owned());
        }
        let next_version_number = current.version_number + 1;
        let next_version_id = new_id("classwork-version");
        transaction
            .execute(
                "INSERT INTO classwork_document_versions (
                    id, run_id, version_number, status, previous_version_id,
                    change_kind, changed_section_id, restored_from_version_number
                 ) VALUES (?1, ?2, ?3, 'draft', ?4, 'section_restore', ?5, ?6)",
                params![
                    next_version_id,
                    request.run_id,
                    next_version_number,
                    current.id,
                    request.section_id,
                    request.source_version_number,
                ],
            )
            .map_err(db_error)?;
        insert_restored_document_sections(
            &transaction,
            &next_version_id,
            &current.id,
            &source_version_id,
            &request.section_id,
        )?;
        insert_restored_document_blocks(
            &transaction,
            &next_version_id,
            &current.id,
            &source_version_id,
            &request.section_id,
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
            return Err(
                "This draft changed in another window. Reopen it before restoring this section."
                    .to_owned(),
            );
        }
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

pub(in crate::classwork) fn section_history(
    database: &Database,
    request: ClassworkSectionHistoryRequest,
) -> Result<ClassworkSectionHistory> {
    database.with_connection(|connection| {
        lesson_for_run(connection, &request.context, &request.run_id)?;
        load_section_history(connection, &request.run_id, &request.section_id)
    })
}

fn insert_restored_document_sections(
    connection: &Connection,
    target_version_id: &str,
    current_version_id: &str,
    source_version_id: &str,
    section_id: &str,
) -> Result<()> {
    connection
        .execute(
            "INSERT INTO classwork_document_sections (
                id, document_version_id, run_id, base_section_id, title,
                learning_goal_numbers, quality_report, regenerated
             )
             SELECT 'classwork-version-section-' || lower(hex(randomblob(16))),
                    ?1, current_sections.run_id, current_sections.base_section_id,
                    CASE WHEN current_sections.base_section_id = ?4 THEN source_sections.title ELSE current_sections.title END,
                    CASE WHEN current_sections.base_section_id = ?4 THEN source_sections.learning_goal_numbers ELSE current_sections.learning_goal_numbers END,
                    CASE WHEN current_sections.base_section_id = ?4 THEN source_sections.quality_report ELSE current_sections.quality_report END,
                    CASE WHEN current_sections.base_section_id = ?4 THEN source_sections.regenerated ELSE current_sections.regenerated END
             FROM classwork_document_sections current_sections
             LEFT JOIN classwork_document_sections source_sections
               ON source_sections.document_version_id = ?3
              AND source_sections.base_section_id = current_sections.base_section_id
             WHERE current_sections.document_version_id = ?2",
            params![target_version_id, current_version_id, source_version_id, section_id],
        )
        .map_err(db_error)?;
    Ok(())
}

fn insert_restored_document_blocks(
    connection: &Connection,
    target_version_id: &str,
    current_version_id: &str,
    source_version_id: &str,
    section_id: &str,
) -> Result<()> {
    connection
        .execute(
            "INSERT INTO classwork_document_blocks (
                id, document_version_id, run_id, base_block_id, section_id,
                sequence, kind, text, teacher_edited, learning_goal_numbers,
                source_material_keys
             )
             SELECT 'classwork-version-block-' || lower(hex(randomblob(16))),
                    ?1, current_blocks.run_id, current_blocks.base_block_id,
                    current_blocks.section_id, current_blocks.sequence, current_blocks.kind,
                    CASE WHEN current_blocks.section_id = ?4 THEN source_blocks.text ELSE current_blocks.text END,
                    CASE WHEN current_blocks.section_id = ?4 THEN source_blocks.teacher_edited ELSE current_blocks.teacher_edited END,
                    CASE WHEN current_blocks.section_id = ?4 THEN source_blocks.learning_goal_numbers ELSE current_blocks.learning_goal_numbers END,
                    CASE WHEN current_blocks.section_id = ?4 THEN source_blocks.source_material_keys ELSE current_blocks.source_material_keys END
             FROM classwork_document_blocks current_blocks
             LEFT JOIN classwork_document_blocks source_blocks
               ON source_blocks.document_version_id = ?3
              AND source_blocks.base_block_id = current_blocks.base_block_id
             WHERE current_blocks.document_version_id = ?2",
            params![target_version_id, current_version_id, source_version_id, section_id],
        )
        .map_err(db_error)?;
    Ok(())
}

fn load_section_history(
    connection: &Connection,
    run_id: &str,
    section_id: &str,
) -> Result<ClassworkSectionHistory> {
    let current_version_number = connection
        .query_row(
            "SELECT current_document_version_number FROM classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(db_error)?;
    let mut statement = connection
        .prepare(
            "SELECT versions.id, versions.version_number, versions.created_at,
                    versions.change_kind, versions.teacher_direction,
                    versions.restored_from_version_number, sections.title,
                    sections.learning_goal_numbers, sections.regenerated
             FROM classwork_document_versions versions
             JOIN classwork_document_sections sections
               ON sections.document_version_id = versions.id
              AND sections.base_section_id = ?2
             WHERE versions.run_id = ?1
             ORDER BY versions.version_number DESC",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(params![run_id, section_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, bool>(8)?,
            ))
        })
        .map_err(db_error)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let versions = rows
        .into_iter()
        .map(|row| {
            Ok(ClassworkSectionHistoryVersion {
                blocks: load_blocks(connection, section_id, Some(&row.0))?,
                version_number: row.1,
                created_at: row.2,
                change_kind: row.3,
                teacher_direction: row.4,
                restored_from_version_number: row.5,
                title: row.6,
                learning_goal_numbers: serde_json::from_str(&row.7)
                    .map_err(|error| error.to_string())?,
                regenerated: row.8,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    if versions.is_empty() {
        return Err("This section has no saved version history.".to_owned());
    }
    Ok(ClassworkSectionHistory {
        current_version_number,
        versions,
    })
}

fn copy_document_sections(
    connection: &Connection,
    target_version_id: &str,
    source_version_id: &str,
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
             WHERE document_version_id = ?2",
            params![target_version_id, source_version_id],
        )
        .map_err(db_error)?;
    Ok(())
}

pub(super) fn require_current_draft_version(
    connection: &Connection,
    run_id: &str,
    expected_version_number: i64,
) -> Result<ClassworkDocumentVersion> {
    let run_status = connection
        .query_row(
            "SELECT status FROM classwork_runs WHERE id = ?1",
            [run_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(db_error)?;
    if run_status != "complete" {
        return Err(
            "Finish creating every lesson section before editing or approving the document."
                .to_owned(),
        );
    }
    let current = load_current_document_version(connection, run_id)?.ok_or_else(|| {
        "The editable lesson draft is not ready. Reopen the lesson and try again.".to_owned()
    })?;
    if current.version_number != expected_version_number {
        return Err(
            "This draft changed in another window. Reopen it before continuing.".to_owned(),
        );
    }
    if current.status != "draft" {
        return Err("This lesson version is approved and can no longer be edited.".to_owned());
    }
    let regeneration_active = connection
        .query_row(
            "SELECT 1 FROM classwork_section_regenerations
             WHERE run_id = ?1 AND status = 'generating'",
            [run_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(db_error)?
        .is_some();
    if regeneration_active {
        return Err(
            "Finish or stop the section being recreated before changing this draft.".to_owned(),
        );
    }
    Ok(current)
}

pub(super) fn validate_teacher_edit(text: &str) -> Result<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Add lesson content before saving this change.".to_owned());
    }
    if trimmed.chars().count() > 12_000 {
        return Err(
            "This lesson block is too long to save. Keep it under 12,000 characters.".to_owned(),
        );
    }
    let normalized = trimmed.to_ascii_lowercase();
    if trimmed.contains("![") || normalized.contains("<img") {
        return Err("Images cannot be added inside lesson text. Keep approved source figures in their existing positions.".to_owned());
    }
    Ok(trimmed.to_owned())
}

#[cfg(test)]
mod tests {

    use crate::classwork::repository::test_fixtures::setup;
    use crate::classwork::repository::test_support::*;
    use crate::classwork::repository::*;

    #[test]
    fn appends_teacher_edits_and_freezes_the_approved_version() {
        let (database, corpus, context) = setup();
        let completed = complete_classwork(&database, &corpus, &context);
        let run = completed.run.expect("run");
        let draft = run.document_version.expect("document version");
        assert_eq!(draft.version_number, 1);
        assert_eq!(draft.status, "draft");
        let block_id = run.sections[0].blocks[0].id.clone();
        let original_text = run.sections[0].blocks[0].text.clone();

        let edited = edit_block(
            &database,
            EditClassworkBlockRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                block_id: block_id.clone(),
                expected_version_number: 1,
                text: "Review one half and two quarters using the fraction models.".to_owned(),
            },
        )
        .expect("teacher edit");
        let edited_run = edited.run.as_ref().expect("edited run");
        assert_eq!(
            edited_run
                .document_version
                .as_ref()
                .expect("edited version")
                .version_number,
            2
        );
        assert!(edited_run.sections[0].blocks[0].teacher_edited);
        assert_eq!(
            edited_run.sections[0].blocks[0].text,
            "Review one half and two quarters using the fraction models."
        );
        assert_eq!(
            edited_run.sections[0].blocks[1].text,
            "worked_example content"
        );

        let (base_text, version_count, previous_text): (String, i64, String) = database
            .with_connection(|connection| {
                let base_text = connection.query_row(
                    "SELECT text FROM classwork_blocks WHERE id = ?1",
                    [&block_id],
                    |row| row.get(0),
                )?;
                let version_count = connection.query_row(
                    "SELECT COUNT(*) FROM classwork_document_versions WHERE run_id = ?1",
                    [&run.id],
                    |row| row.get(0),
                )?;
                let previous_text = connection.query_row(
                    "SELECT version_blocks.text
                     FROM classwork_document_blocks version_blocks
                     JOIN classwork_document_versions versions
                       ON versions.id = version_blocks.document_version_id
                     WHERE versions.run_id = ?1 AND versions.version_number = 1
                       AND version_blocks.base_block_id = ?2",
                    params![run.id, block_id],
                    |row| row.get(0),
                )?;
                Ok::<_, rusqlite::Error>((base_text, version_count, previous_text))
            })
            .expect("version history");
        assert_eq!(base_text, original_text);
        assert_eq!(previous_text, original_text);
        assert_eq!(version_count, 2);

        let stale_error = edit_block(
            &database,
            EditClassworkBlockRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                block_id: block_id.clone(),
                expected_version_number: 1,
                text: "Stale change".to_owned(),
            },
        )
        .expect_err("stale edit");
        assert!(stale_error.contains("another window"));

        let approved = approve_version(
            &database,
            ApproveClassworkVersionRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                expected_version_number: 2,
            },
        )
        .expect("approved");
        let approved_version = approved
            .run
            .as_ref()
            .expect("approved run")
            .document_version
            .as_ref()
            .expect("approved version");
        assert_eq!(approved_version.status, "approved");
        assert!(approved_version.approved_at.is_some());

        let approved_error = edit_block(
            &database,
            EditClassworkBlockRequest {
                context,
                run_id: run.id,
                block_id,
                expected_version_number: 2,
                text: "Change after approval".to_owned(),
            },
        )
        .expect_err("approved edit");
        assert!(approved_error.contains("approved"));
    }

    #[test]
    fn recreates_and_restores_one_section_without_losing_other_teacher_edits() {
        let (database, corpus, context) = setup();
        let completed = complete_classwork(&database, &corpus, &context);
        let run = completed.run.expect("run");
        let first_section_id = run.sections[0].id.clone();
        let second_block_id = run.sections[1].blocks[0].id.clone();

        let edited = edit_block(
            &database,
            EditClassworkBlockRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                block_id: second_block_id,
                expected_version_number: 1,
                text: "Keep this teacher wording in the second section.".to_owned(),
            },
        )
        .expect("teacher edit");
        let started = begin_section_regeneration(
            &database,
            BeginClassworkSectionRegenerationRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: first_section_id.clone(),
                expected_version_number: 2,
                teacher_direction: Some("Use a simpler fraction-strip explanation.".to_owned()),
            },
        )
        .expect("recreation started");
        let regeneration = started.job.regeneration.as_ref().expect("context");
        assert_eq!(regeneration.source_version_number, 2);
        assert_eq!(
            regeneration.teacher_direction.as_deref(),
            Some("Use a simpler fraction-strip explanation.")
        );
        assert_eq!(
            started
                .workspace
                .run
                .as_ref()
                .and_then(|value| value.section_regeneration.as_ref())
                .map(|value| value.status.as_str()),
            Some("generating")
        );
        let blocked_edit = edit_block(
            &database,
            EditClassworkBlockRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                block_id: run.sections[0].blocks[0].id.clone(),
                expected_version_number: 2,
                text: "A concurrent edit".to_owned(),
            },
        )
        .expect_err("active recreation blocks edits");
        assert!(blocked_edit.contains("Finish or stop"));

        let regeneration_id = regeneration.id.clone();
        let token = started.job.generation_token.clone();
        let mut replacement = generated("A clearer equivalent-fractions explanation");
        for block in &mut replacement.blocks {
            block.text = format!("Recreated {} wording", block.kind);
        }
        let recreated = complete_section_regeneration(
            &database,
            CompleteClassworkSectionRegenerationRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                regeneration_id: regeneration_id.clone(),
                section_id: first_section_id.clone(),
                generation_token: token.clone(),
                section: replacement,
            },
        )
        .expect("recreated");
        let recreated_run = recreated.run.as_ref().expect("recreated run");
        assert_eq!(
            recreated_run
                .document_version
                .as_ref()
                .expect("version")
                .version_number,
            3
        );
        assert_eq!(
            recreated_run.sections[0].title.as_deref(),
            Some("A clearer equivalent-fractions explanation")
        );
        assert!(recreated_run.sections[0].regenerated);
        assert_eq!(
            recreated_run.sections[1].blocks[0].text,
            "Keep this teacher wording in the second section."
        );
        assert!(recreated_run.sections[1].blocks[0].teacher_edited);

        let late_error = complete_section_regeneration(
            &database,
            CompleteClassworkSectionRegenerationRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                regeneration_id,
                section_id: first_section_id.clone(),
                generation_token: token,
                section: generated("Late response"),
            },
        )
        .expect_err("late completion");
        assert!(late_error.contains("graspy stopped before this section was saved"));

        let history = section_history(
            &database,
            ClassworkSectionHistoryRequest {
                context: context.clone(),
                run_id: run.id.clone(),
                section_id: first_section_id.clone(),
            },
        )
        .expect("history");
        assert_eq!(history.current_version_number, 3);
        assert_eq!(history.versions.len(), 3);
        assert_eq!(history.versions[0].change_kind, "section_regeneration");
        assert_eq!(
            history.versions[0].teacher_direction.as_deref(),
            Some("Use a simpler fraction-strip explanation.")
        );

        let restored = restore_section(
            &database,
            RestoreClassworkSectionRequest {
                context,
                run_id: run.id,
                section_id: first_section_id,
                source_version_number: 1,
                expected_version_number: 3,
            },
        )
        .expect("restored");
        let restored_run = restored.run.as_ref().expect("restored run");
        assert_eq!(
            restored_run.sections[0].title.as_deref(),
            Some("Comparing fraction models")
        );
        assert_eq!(
            restored_run.sections[1].blocks[0].text,
            "Keep this teacher wording in the second section."
        );
        assert_eq!(
            restored_run
                .document_version
                .as_ref()
                .expect("version")
                .change_kind,
            "section_restore"
        );

        assert_eq!(
            edited
                .run
                .as_ref()
                .expect("edited run")
                .document_version
                .as_ref()
                .expect("version")
                .version_number,
            2
        );
    }

    #[test]
    fn rejects_empty_oversized_and_image_teacher_edits() {
        assert!(validate_teacher_edit("   ").is_err());
        assert!(validate_teacher_edit(&"a".repeat(12_001)).is_err());
        assert!(validate_teacher_edit("![New figure](https://example.com/new.png)").is_err());
        assert_eq!(
            validate_teacher_edit("  Keep this.  "),
            Ok("Keep this.".to_owned())
        );
    }
}
