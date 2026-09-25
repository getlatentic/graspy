use rusqlite::{params, OptionalExtension, Transaction};

use crate::db::Database;

use super::snapshot::{load_snapshot, query_granular_record, GranularRecordLocation};
use super::{new_id, resolve_context, RepositoryError, RepositoryResult};
use crate::lesson_planning::domain::{ConfirmGranularLessonRequest, LessonWorkspaceSnapshot};
use crate::lesson_planning::granular::LessonPlanFormat;

pub(in crate::lesson_planning) fn confirm_granular_lesson(
    database: &Database,
    request: ConfirmGranularLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let (status, input_mode, plan_format, latest_version) = transaction
            .query_row(
                "SELECT status, input_mode,
                        CASE WHEN EXISTS (SELECT 1 FROM lesson_granular_drafts written
                                          WHERE written.lesson_id = lessons.id)
                             THEN 'granular' ELSE 'legacy_import' END,
                        latest_version_number
                 FROM lessons
                 WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3",
                params![request.lesson_id, context.period_id, context.assignment_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::NotFound(
                    "That lesson is not available in the selected class and term.".to_owned(),
                )
            })?;
        if status != "draft" {
            return Err(RepositoryError::Conflict(
                "This lesson is already confirmed. Edit it before creating another version."
                    .to_owned(),
            ));
        }

        match input_mode.as_str() {
            "structured" => {
                if LessonPlanFormat::parse(&plan_format)? != LessonPlanFormat::Granular {
                    return Err(RepositoryError::Conflict(
                        "Complete the detailed lesson review before confirming it.".to_owned(),
                    ));
                }
                query_granular_record(
                    &transaction,
                    GranularRecordLocation::Draft,
                    &request.lesson_id,
                )?;
            }
            "pasted" => {
                promote_granular_preparation(&transaction, &request.lesson_id)?;
                query_granular_record(
                    &transaction,
                    GranularRecordLocation::Draft,
                    &request.lesson_id,
                )?;
            }
            _ => {
                return Err(RepositoryError::Validation(
                    "The saved lesson input method is not supported.".to_owned(),
                ))
            }
        }

        append_confirmed_version(&transaction, &request.lesson_id, latest_version)?;
        transaction.execute(
            "DELETE FROM lesson_preparations WHERE lesson_id = ?1",
            [&request.lesson_id],
        )?;
        transaction.commit()?;
        load_snapshot(connection, &context, Some(&request.lesson_id))
    })
}

fn promote_granular_preparation(
    transaction: &Transaction<'_>,
    lesson_id: &str,
) -> RepositoryResult<()> {
    let (source_raw_plan, preparation_format) = transaction
        .query_row(
            "SELECT source_raw_plan,
                    CASE WHEN EXISTS (SELECT 1 FROM lesson_granular_preparations worked
                                      WHERE worked.lesson_id = lesson_preparations.lesson_id)
                         THEN 'granular' ELSE 'legacy_import' END
             FROM lesson_preparations WHERE lesson_id = ?1",
            [lesson_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Conflict("Prepare this pasted lesson before confirming it.".to_owned())
        })?;
    if LessonPlanFormat::parse(&preparation_format)? != LessonPlanFormat::Granular {
        return Err(RepositoryError::Conflict(
            "Complete the detailed lesson review before confirming it.".to_owned(),
        ));
    }
    query_granular_record(transaction, GranularRecordLocation::Preparation, lesson_id)?;
    transaction.execute(
        "UPDATE lessons SET
             input_mode = 'structured', raw_plan = NULL, source_plan_text = ?1,
             topic = (SELECT topic FROM lesson_preparations WHERE lesson_id = ?2),
             subtopic = (SELECT subtopic FROM lesson_preparations WHERE lesson_id = ?2),
             learning_goals = (SELECT learning_goals FROM lesson_preparations WHERE lesson_id = ?2),
             instructional_materials = (SELECT instructional_materials FROM lesson_preparations WHERE lesson_id = ?2),
             previous_knowledge = (SELECT previous_knowledge FROM lesson_preparations WHERE lesson_id = ?2),
             assessment = (SELECT assessment FROM lesson_preparations WHERE lesson_id = ?2),
             reference_notes = (SELECT reference_notes FROM lesson_preparations WHERE lesson_id = ?2),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![source_raw_plan, lesson_id],
    )?;

    transaction.execute(
        "DELETE FROM lesson_granular_drafts WHERE lesson_id = ?1",
        [lesson_id],
    )?;
    transaction.execute(
        "INSERT INTO lesson_granular_drafts (
             lesson_id, plan_json, plan_sha256, curriculum_snapshot_json,
             curriculum_snapshot_sha256, source_evidence_snapshot_json,
             source_evidence_snapshot_sha256, program_id, program_version,
             program_digest, program_run_id
         )
         SELECT lesson_id, plan_json, plan_sha256, curriculum_snapshot_json,
                curriculum_snapshot_sha256, source_evidence_snapshot_json,
                source_evidence_snapshot_sha256, program_id, program_version,
                program_digest, program_run_id
         FROM lesson_granular_preparations WHERE lesson_id = ?1",
        [lesson_id],
    )?;
    Ok(())
}

fn append_confirmed_version(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    latest_version: i64,
) -> RepositoryResult<()> {
    let version_number = latest_version + 1;
    let version_id = new_id("lesson-version");
    transaction.execute(
        "INSERT INTO lesson_versions (
             id, lesson_id, version_number, academic_session_id, academic_period_id,
             teaching_assignment_id, scheme_week_id, scheme_entry_id,
             curriculum_course_id, curriculum_unit_id, curriculum_node_id
         )
         SELECT ?1, id, ?2, academic_session_id, academic_period_id,
                teaching_assignment_id, scheme_week_id, scheme_entry_id,
                curriculum_course_id, curriculum_unit_id, curriculum_node_id
         FROM lessons WHERE id = ?3",
        params![version_id, version_number, lesson_id],
    )?;
    transaction.execute(
        "INSERT INTO lesson_version_outcomes (
             lesson_version_id, curriculum_outcome_id, curriculum_course_id
         )
         SELECT ?1, curriculum_outcome_id, curriculum_course_id
         FROM lesson_curriculum_outcomes WHERE lesson_id = ?2",
        params![version_id, lesson_id],
    )?;
    transaction.execute(
        "INSERT INTO lesson_granular_versions (
             lesson_version_id, plan_json, plan_sha256, curriculum_snapshot_json,
             curriculum_snapshot_sha256, source_evidence_snapshot_json,
             source_evidence_snapshot_sha256, program_id, program_version,
             program_digest, program_run_id
         )
         SELECT ?1, plan_json, plan_sha256, curriculum_snapshot_json,
                curriculum_snapshot_sha256, source_evidence_snapshot_json,
                source_evidence_snapshot_sha256, program_id, program_version,
                program_digest, program_run_id
         FROM lesson_granular_drafts WHERE lesson_id = ?2",
        params![version_id, lesson_id],
    )?;
    transaction.execute(
        "UPDATE lessons
         SET status = 'confirmed', latest_version_number = ?1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![version_number, lesson_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lesson_planning::domain::{
        ConfirmGranularLessonRequest, LessonStatus, SaveGranularLessonRequest,
    };
    use crate::lesson_planning::granular::tests::granular_record;
    use crate::lesson_planning::repository::test_support::{setup, structured_request};
    use crate::lesson_planning::repository::{save_draft, save_granular_lesson};

    /// Every path through confirmation demands a granular record first, so a
    /// version can only ever hold a granular plan.
    ///
    /// The whole of a version's content is therefore in the plan it sealed, and
    /// the columns beside it were a second copy of the same sealed moment — one
    /// that had already drifted from it in the owner's own library.
    #[test]
    fn a_lesson_with_no_detailed_plan_cannot_be_confirmed_at_all() {
        let context = setup();
        let mut request = structured_request(&context);
        request.topic = "Linear equations".to_owned();
        let lesson_id = save_draft(&context.database, request)
            .expect("draft")
            .selected_lesson
            .expect("lesson")
            .id;

        let refusal = confirm_granular_lesson(
            &context.database,
            ConfirmGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id,
            },
        )
        .expect_err("a lesson with no detailed plan");

        assert!(
            format!("{refusal:?}").contains("detailed lesson review"),
            "unexpected: {refusal:?}"
        );
    }

    #[test]
    fn saves_and_confirms_one_hash_bound_granular_aggregate() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("coarse migration source")
            .selected_lesson
            .expect("lesson")
            .id;
        let mut record = granular_record();
        record.program_snapshot.program_run_id = None;

        let saved = save_granular_lesson(
            &context.database,
            SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                record: record.clone(),
            },
        )
        .expect("granular lesson")
        .selected_lesson
        .expect("saved lesson");

        assert_eq!(saved.plan_format, LessonPlanFormat::Granular);
        assert_eq!(saved.granular_record.as_ref(), Some(&record));
        assert_eq!(saved.learning_goals.len(), 2);
        assert_eq!(saved.steps.len(), 4);
        // The plan names what the class already knows; that is the previous
        // knowledge line on the lesson plan, so it lands on the lesson itself
        // rather than staying inside the record only a screen can open.
        assert_eq!(
            saved.previous_knowledge,
            vec!["Learners can identify equal parts of one whole.".to_owned()]
        );

        let confirmed = confirm_granular_lesson(
            &context.database,
            ConfirmGranularLessonRequest {
                context: context.lesson_context,
                lesson_id: lesson_id.clone(),
            },
        )
        .expect("confirmed granular lesson")
        .selected_lesson
        .expect("confirmed lesson");

        assert_eq!(confirmed.status, LessonStatus::Confirmed);
        assert_eq!(confirmed.granular_record.as_ref(), Some(&record));
        context
            .database
            .with_connection(|connection| {
                let sealed_digest = connection.query_row(
                    "SELECT lesson_granular_versions.plan_sha256
                     FROM lesson_versions
                     JOIN lesson_granular_versions
                       ON lesson_granular_versions.lesson_version_id = lesson_versions.id
                     WHERE lesson_versions.lesson_id = ?1",
                    [&lesson_id],
                    |row| row.get::<_, String>(0),
                )?;
                assert_eq!(sealed_digest.len(), 64);
                let immutable = connection.execute(
                    "UPDATE lesson_granular_versions SET plan_json = '{}' \
                     WHERE lesson_version_id = (SELECT id FROM lesson_versions WHERE lesson_id = ?1)",
                    [&lesson_id],
                );
                assert!(immutable.is_err());
                Ok::<_, rusqlite::Error>(())
            })
            .expect("immutable version evidence");
    }

    /// A confirmed version records the plan that was sealed, and the two are
    /// written in the same breath — which is why the version needs no second
    /// copy of the content beside the seal.
    ///
    /// This used to prove that confirming twice appends rather than rewrites.
    /// Nothing can confirm twice: `save_granular_lesson` refuses a confirmed
    /// lesson and tells the teacher to create a new version, and no path makes
    /// one. Issue 112 is that missing path; until it exists this holds what is
    /// reachable.
    #[test]
    fn a_confirmed_version_records_the_plan_it_sealed() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("draft")
            .selected_lesson
            .expect("lesson")
            .id;
        let mut record = granular_record();
        record.program_snapshot.program_run_id = None;
        save_granular_lesson(
            &context.database,
            SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                record: record.clone(),
            },
        )
        .expect("a plan to confirm");
        confirm_granular_lesson(
            &context.database,
            ConfirmGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
            },
        )
        .expect("the version");

        let (number, sealed_topic): (i64, String) = context
            .database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT v.version_number,
                            json_extract(g.plan_json, '$.topic')
                     FROM lesson_versions v
                     JOIN lesson_granular_versions g ON g.lesson_version_id = v.id
                     WHERE v.lesson_id = ?1",
                    [&lesson_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
            })
            .expect("the sealed version");

        assert_eq!(number, 1);
        assert_eq!(sealed_topic, record.plan.topic);
    }
}
