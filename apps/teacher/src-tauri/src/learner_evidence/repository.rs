use crate::lesson_planning::sealed_plan::{SEALED_LEARNING_GOALS, SEALED_PLAN_JOIN, SEALED_TOPIC};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use crate::{db::Database, lesson_planning::LessonContextRequest};

use super::domain::*;

type Result<T> = std::result::Result<T, String>;

pub(super) fn get_workspace(
    database: &Database,
    request: LessonEvidenceWorkspaceRequest,
) -> Result<LessonEvidenceWorkspaceSnapshot> {
    database.with_connection(|connection| {
        let lesson = confirmed_lesson(connection, &request.context, &request.lesson_id)?;
        load_workspace(connection, lesson)
    })
}

pub(super) fn save(
    database: &Database,
    request: SaveLessonEvidenceRequest,
) -> Result<LessonEvidenceWorkspaceSnapshot> {
    database.with_connection_mut(|connection| {
        let transaction = connection.transaction().map_err(db_error)?;
        let lesson = confirmed_lesson(&transaction, &request.context, &request.lesson_id)?;
        if lesson.lesson_version_id != request.lesson_version_id {
            return Err("The confirmed lesson changed. Reopen class results for the current version.".to_owned());
        }
        let groups = validate_request(&request, lesson.learning_goals.len())?;
        let existing = transaction.query_row(
            "SELECT id, revision, status FROM lesson_evidence_sets WHERE lesson_version_id = ?1",
            [&lesson.lesson_version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?)),
        ).optional().map_err(db_error)?;
        let set_id = if let Some((set_id, revision, current_status)) = existing {
            if request.expected_revision != Some(revision) {
                return Err("These class results changed in another window. Reopen them before saving.".to_owned());
            }
            if current_status == "complete" && request.status == EvidenceStatus::Draft {
                return Err("Finished class results cannot return to a draft.".to_owned());
            }
            let changed = transaction.execute(
                "UPDATE lesson_evidence_sets SET status = ?1, revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP,
                 completed_at = CASE WHEN ?1 = 'complete' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END
                 WHERE id = ?2 AND revision = ?3",
                params![request.status.as_str(), set_id, revision],
            ).map_err(db_error)?;
            if changed != 1 {
                return Err("These class results changed in another window. Reopen them before saving.".to_owned());
            }
            set_id
        } else {
            if request.expected_revision.is_some() {
                return Err("These class results no longer exist. Reopen the lesson before saving.".to_owned());
            }
            let set_id = new_id("evidence");
            transaction.execute(
                "INSERT INTO lesson_evidence_sets (id, lesson_id, lesson_version_id, status, completed_at)
                 VALUES (?1, ?2, ?3, ?4, CASE WHEN ?4 = 'complete' THEN CURRENT_TIMESTAMP ELSE NULL END)",
                params![set_id, lesson.lesson_id, lesson.lesson_version_id, request.status.as_str()],
            ).map_err(db_error)?;
            set_id
        };
        replace_groups(&transaction, &set_id, groups)?;
        transaction.commit().map_err(db_error)?;
        load_workspace(connection, lesson)
    })
}

fn replace_groups(
    transaction: &Transaction<'_>,
    set_id: &str,
    groups: Vec<ValidatedEvidenceGroup>,
) -> Result<()> {
    let existing_ids = {
        let mut statement = transaction
            .prepare("SELECT id FROM lesson_evidence_groups WHERE evidence_set_id = ?1")
            .map_err(db_error)?;
        let values = statement
            .query_map([set_id], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)?;
        values
    };
    let supplied_ids = groups
        .iter()
        .filter_map(|group| group.id.as_deref())
        .collect::<std::collections::HashSet<_>>();
    let existing_id_set = existing_ids
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();
    let group_identity_changed = if existing_ids.is_empty() {
        !supplied_ids.is_empty()
    } else {
        supplied_ids.len() != groups.len() || supplied_ids != existing_id_set
    };
    if group_identity_changed {
        return Err(
            "A teaching group no longer matches these class results. Reopen the lesson.".to_owned(),
        );
    }
    transaction
        .execute(
            "DELETE FROM lesson_evidence_groups WHERE evidence_set_id = ?1",
            [set_id],
        )
        .map_err(db_error)?;
    for group in groups {
        let group_id = group.id.unwrap_or_else(|| new_id("group"));
        transaction
            .execute(
                "INSERT INTO lesson_evidence_groups
             (id, evidence_set_id, position, name, name_key, interest_score, lesson_feeling_score)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    group_id,
                    set_id,
                    group.position,
                    group.name,
                    group.name_key,
                    group.interest_score,
                    group.lesson_feeling_score
                ],
            )
            .map_err(db_error)?;
        for entry in group.entries {
            transaction.execute(
                "INSERT INTO lesson_evidence_entries
                 (id, evidence_set_id, group_id, learning_goal_number, questions_correct, questions_total,
                  misunderstanding_note, confidence_score, difficulty_score)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![new_id("result"), set_id, group_id, entry.learning_goal_number,
                    entry.questions_correct, entry.questions_total,
                    entry.misunderstanding_note.as_deref().map(str::trim).filter(|value| !value.is_empty()),
                    entry.confidence_score, entry.difficulty_score],
            ).map_err(db_error)?;
        }
    }
    Ok(())
}

fn confirmed_lesson(
    connection: &Connection,
    context: &LessonContextRequest,
    lesson_id: &str,
) -> Result<EvidenceLesson> {
    let value = connection.query_row(
        &format!(
        "SELECT lv.id, lv.version_number, {SEALED_TOPIC}, {SEALED_LEARNING_GOALS}
         FROM lessons
         JOIN lesson_versions lv ON lv.lesson_id = lessons.id AND lv.version_number = lessons.latest_version_number
         {SEALED_PLAN_JOIN}
         WHERE lessons.id = ?1 AND lessons.academic_session_id = ?2
           AND lessons.academic_period_id = ?3 AND lessons.teaching_assignment_id = ?4
           AND lessons.status = 'confirmed'"),
        params![lesson_id, context.academic_session_id, context.academic_period_id, context.teaching_assignment_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
    ).optional().map_err(db_error)?.ok_or_else(|| "Confirm the current lesson before adding class results.".to_owned())?;
    let learning_goals = serde_json::from_str::<Vec<String>>(&value.3).map_err(|_| {
        "The lesson goals could not be read. Review and confirm the lesson again.".to_owned()
    })?;
    if learning_goals.is_empty() {
        return Err("Add at least one learning goal before recording class results.".to_owned());
    }
    Ok(EvidenceLesson {
        lesson_id: lesson_id.to_owned(),
        lesson_version_id: value.0,
        lesson_version_number: value.1,
        topic: value.2,
        learning_goals,
    })
}

fn load_workspace(
    connection: &Connection,
    lesson: EvidenceLesson,
) -> Result<LessonEvidenceWorkspaceSnapshot> {
    let set = connection
        .query_row(
            "SELECT id, status, revision FROM lesson_evidence_sets WHERE lesson_version_id = ?1",
            [&lesson.lesson_version_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?;
    let evidence = match set {
        None => None,
        Some((id, status, revision)) => {
            let mut statement = connection
                .prepare(
                    "SELECT id, position, name, interest_score, lesson_feeling_score
                 FROM lesson_evidence_groups WHERE evidence_set_id = ?1 ORDER BY position",
                )
                .map_err(db_error)?;
            let group_rows = statement
                .query_map([&id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                        row.get::<_, Option<i64>>(4)?,
                    ))
                })
                .map_err(db_error)?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(db_error)?;
            let mut groups = Vec::with_capacity(group_rows.len());
            for (group_id, position, name, interest_score, lesson_feeling_score) in group_rows {
                let mut entry_statement = connection.prepare(
                    "SELECT learning_goal_number, questions_correct, questions_total, misunderstanding_note, confidence_score, difficulty_score
                     FROM lesson_evidence_entries WHERE evidence_set_id = ?1 AND group_id = ?2 ORDER BY learning_goal_number",
                ).map_err(db_error)?;
                let entries = entry_statement
                    .query_map(params![id, group_id], |row| {
                        Ok(EvidenceEntry {
                            learning_goal_number: row.get(0)?,
                            questions_correct: row.get(1)?,
                            questions_total: row.get(2)?,
                            misunderstanding_note: row.get(3)?,
                            confidence_score: row.get(4)?,
                            difficulty_score: row.get(5)?,
                        })
                    })
                    .map_err(db_error)?
                    .collect::<std::result::Result<Vec<_>, _>>()
                    .map_err(db_error)?;
                groups.push(EvidenceGroup {
                    id: group_id,
                    position,
                    name,
                    interest_score,
                    lesson_feeling_score,
                    entries,
                });
            }
            let status =
                match status.as_str() {
                    "draft" => EvidenceStatus::Draft,
                    "complete" => EvidenceStatus::Complete,
                    _ => return Err(
                        "The saved class-results status is invalid. Reopen the app and try again."
                            .to_owned(),
                    ),
                };
            Some(LessonEvidenceSet {
                id,
                status,
                revision,
                groups,
            })
        }
    };
    Ok(LessonEvidenceWorkspaceSnapshot { lesson, evidence })
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}
fn db_error(_error: rusqlite::Error) -> String {
    "The class results could not be saved. Close the app, reopen it, and try again.".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn setup() -> (Database, LessonContextRequest) {
        let database = Database::in_memory();
        database.with_connection(|connection| connection.execute_batch(
            "INSERT INTO academic_sessions (id, start_year, end_year) VALUES ('session', 2026, 2027);
             INSERT INTO academic_periods
                (id, academic_session_id, ordinal, name, normalized_name, kind, legacy_term_number)
             VALUES ('period', 'session', 1, 'First term', 'first term', 'term', 1);
             INSERT INTO teaching_assignments (id, academic_session_id, subject_id, grade_level_id, class_section, class_section_key)
             VALUES ('assignment', 'session', 'subject-mathematics', 'grade-jss-2', 'A', 'a');
             INSERT INTO lessons (id, academic_session_id, academic_period_id, teaching_assignment_id, input_mode, topic, raw_plan,
                 learning_goals, instructional_materials, assessment, reference_notes, status, latest_version_number, source_plan_text)
             VALUES ('lesson', 'session', 'period', 'assignment', 'structured', 'Linear equations', NULL,
                 '[\"Solve equations.\",\"Explain inverse operations.\"]', '[]', '[]', '[]', 'confirmed', 1, NULL);
             INSERT INTO lesson_versions (id, lesson_id, version_number, academic_session_id, academic_period_id, teaching_assignment_id)
             VALUES ('version', 'lesson', 1, 'session', 'period', 'assignment');"
        )).expect("fixtures");
        database
            .with_connection(|connection| {
                crate::lesson_planning::sealed_plan::test_support::insert_sealed_plan(
                    connection,
                    "version",
                    "Linear equations",
                    None,
                    &["Solve equations.", "Explain inverse operations."],
                    &[("Introduction", "Model one equation.")],
                    &[],
                )
            })
            .expect("the sealed plan");
        (
            database,
            LessonContextRequest {
                academic_session_id: "session".into(),
                academic_period_id: "period".into(),
                teaching_assignment_id: "assignment".into(),
            },
        )
    }

    fn request(
        context: LessonContextRequest,
        expected_revision: Option<i64>,
        status: EvidenceStatus,
    ) -> SaveLessonEvidenceRequest {
        SaveLessonEvidenceRequest {
            context,
            lesson_id: "lesson".into(),
            lesson_version_id: "version".into(),
            expected_revision,
            status,
            groups: ["Needs support", "Developing", "Secure"]
                .into_iter()
                .enumerate()
                .map(|(index, name)| EvidenceGroupInput {
                    id: None,
                    position: index as i64 + 1,
                    name: name.into(),
                    interest_score: Some(4),
                    lesson_feeling_score: Some(3),
                    entries: (1..=2)
                        .map(|goal| EvidenceEntryInput {
                            learning_goal_number: goal,
                            questions_correct: Some(index as i64 + 1),
                            questions_total: Some(3),
                            misunderstanding_note: None,
                            confidence_score: Some(3),
                            difficulty_score: Some(2),
                        })
                        .collect(),
                })
                .collect(),
        }
    }

    #[test]
    fn saves_and_reopens_complete_results() {
        let (database, context) = setup();
        let saved = save(
            &database,
            request(context.clone(), None, EvidenceStatus::Complete),
        )
        .expect("save");
        assert_eq!(
            saved.evidence.as_ref().unwrap().status,
            EvidenceStatus::Complete
        );
        let reopened = get_workspace(
            &database,
            LessonEvidenceWorkspaceRequest {
                context,
                lesson_id: "lesson".into(),
            },
        )
        .expect("reopen");
        assert_eq!(reopened.evidence.unwrap().groups[0].entries.len(), 2);
    }

    #[test]
    fn rejects_a_stale_revision() {
        let (database, context) = setup();
        save(
            &database,
            request(context.clone(), None, EvidenceStatus::Draft),
        )
        .expect("initial");
        assert_eq!(
            save(&database, request(context, Some(9), EvidenceStatus::Draft)).unwrap_err(),
            "These class results changed in another window. Reopen them before saving."
        );
    }

    #[test]
    fn rejects_replacing_an_existing_group_identity() {
        let (database, context) = setup();
        let saved = save(
            &database,
            request(context.clone(), None, EvidenceStatus::Draft),
        )
        .expect("initial");
        let mut changed = request(context, Some(1), EvidenceStatus::Draft);
        let saved_groups = &saved.evidence.as_ref().expect("evidence").groups;
        for (input, group) in changed.groups.iter_mut().zip(saved_groups) {
            input.id = Some(group.id.clone());
        }
        changed.groups[1].id = Some("group-from-another-record".into());

        assert_eq!(
            save(&database, changed).unwrap_err(),
            "A teaching group no longer matches these class results. Reopen the lesson."
        );
    }
}
