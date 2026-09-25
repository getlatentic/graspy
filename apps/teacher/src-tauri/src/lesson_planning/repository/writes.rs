use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;

use crate::db::Database;
use crate::generation_program::domain::digest_json;

use super::snapshot::load_snapshot;
use super::{
    insert_outcomes, new_id, resolve_context, resolve_schedule, to_json, RepositoryError,
    RepositoryResult, ResolvedContext, ResolvedSchedule,
};
use crate::lesson_planning::domain::{
    LessonContextRequest, LessonWorkspaceSnapshot, SaveAuthoredLessonRequest,
    SaveGranularLessonRequest, SaveLessonDraftRequest, ValidatedLessonDraft, ValidatedLessonStep,
};
use crate::lesson_planning::granular::GranularLessonRecord;

/// A weekly plan carries one lesson, said in the teacher's terms.
///
/// `idx_lessons_scheme_entry` is the rule, and it is the library that enforces
/// it. Reaching it means a screen offered to start a second lesson from a plan
/// that already has one — so the answer names what happened and what to do,
/// rather than the generic "close the app and try again", which cannot help
/// because the next attempt fails the same way.
fn weekly_plan_already_planned(error: rusqlite::Error) -> RepositoryError {
    let claimed = matches!(
        &error,
        rusqlite::Error::SqliteFailure(failure, Some(message))
            if failure.code == rusqlite::ErrorCode::ConstraintViolation
                && message.contains("lessons.scheme_entry_id")
    );
    if claimed {
        return RepositoryError::Conflict(
            "This weekly plan already has a lesson. Open that lesson instead of starting another."
                .to_owned(),
        );
    }
    RepositoryError::Database(error)
}

/// The flat columns of a lessons row, already encoded. Every path that writes a
/// lesson — an imported draft, a hand-authored lesson — fills these; the row
/// upsert itself is the same, so it lives once in [`upsert_lesson_row`].
struct LessonRowBody {
    input_mode: String,
    topic: String,
    subtopic: Option<String>,
    raw_plan: Option<String>,
    learning_goals: String,
    instructional_materials: String,
    previous_knowledge: String,
    assessment: String,
    assignment: String,
    references: String,
}

/// Insert a new lesson row or update an existing one in the selected class and
/// term, returning its id. On update the flat step and outcome rows are cleared;
/// callers rewrite whichever of those the lesson has.
fn upsert_lesson_row(
    transaction: &rusqlite::Transaction<'_>,
    context: &ResolvedContext,
    schedule: Option<&ResolvedSchedule>,
    lesson_id: Option<&str>,
    body: &LessonRowBody,
) -> RepositoryResult<String> {
    match lesson_id {
        Some(lesson_id) => {
            let changed = transaction.execute(
                "UPDATE lessons
                 SET scheme_week_id = ?1, scheme_entry_id = ?2, curriculum_course_id = ?3,
                     curriculum_unit_id = ?4, curriculum_node_id = ?5, input_mode = ?6,
                     topic = ?7, subtopic = ?8, raw_plan = ?9, learning_goals = ?10,
                     instructional_materials = ?11, previous_knowledge = ?12, assessment = ?13,
                     assignment = ?14, reference_notes = ?15,
                     status = 'draft', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?16 AND academic_period_id = ?17 AND teaching_assignment_id = ?18",
                params![
                    schedule.and_then(ResolvedSchedule::stored_week_id),
                    schedule.and_then(|value| value.entry_id.as_ref()),
                    schedule.map(|value| &value.course_id),
                    schedule.and_then(|value| value.curriculum_unit_id.as_deref()),
                    schedule.and_then(|value| value.curriculum_node_id.as_deref()),
                    body.input_mode,
                    body.topic,
                    body.subtopic,
                    body.raw_plan,
                    body.learning_goals,
                    body.instructional_materials,
                    body.previous_knowledge,
                    body.assessment,
                    body.assignment,
                    body.references,
                    lesson_id,
                    context.period_id,
                    context.assignment_id,
                ],
            )?;
            if changed == 0 {
                return Err(RepositoryError::NotFound(
                    "That lesson is not available in the selected class and term.".to_owned(),
                ));
            }
            transaction.execute(
                "DELETE FROM lesson_curriculum_outcomes WHERE lesson_id = ?1",
                [lesson_id],
            )?;
            Ok(lesson_id.to_owned())
        }
        None => {
            let lesson_id = new_id("lesson");
            transaction.execute(
                "INSERT INTO lessons (
                     id, academic_session_id, academic_period_id, teaching_assignment_id,
                     scheme_week_id, scheme_entry_id, curriculum_course_id,
                     curriculum_unit_id, curriculum_node_id, input_mode, topic, subtopic, raw_plan,
                     learning_goals, instructional_materials, previous_knowledge, assessment,
                     assignment, reference_notes
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
                params![
                    lesson_id,
                    context.session_id,
                    context.period_id,
                    context.assignment_id,
                    schedule.and_then(ResolvedSchedule::stored_week_id),
                    schedule.and_then(|value| value.entry_id.as_ref()),
                    schedule.map(|value| &value.course_id),
                    schedule.and_then(|value| value.curriculum_unit_id.as_deref()),
                    schedule.and_then(|value| value.curriculum_node_id.as_deref()),
                    body.input_mode,
                    body.topic,
                    body.subtopic,
                    body.raw_plan,
                    body.learning_goals,
                    body.instructional_materials,
                    body.previous_knowledge,
                    body.assessment,
                    body.assignment,
                    body.references,
                ],
            )
            .map_err(weekly_plan_already_planned)?;
            Ok(lesson_id)
        }
    }
}

pub(in crate::lesson_planning) fn save_draft(
    database: &Database,
    request: SaveLessonDraftRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    let input = ValidatedLessonDraft::new(&request)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let schedule = resolve_schedule(
            &transaction,
            &context,
            request.scheme_week_id.as_deref(),
            request.scheme_entry_id.as_deref(),
        )?;
        let body = LessonRowBody {
            input_mode: input.input_mode.as_str().to_owned(),
            topic: input.topic.clone(),
            subtopic: input.subtopic.clone(),
            raw_plan: input.raw_plan.clone(),
            learning_goals: to_json(&input.learning_goals)?,
            instructional_materials: to_json(&input.instructional_materials)?,
            previous_knowledge: to_json(&input.previous_knowledge)?,
            assessment: to_json(&input.assessment)?,
            assignment: to_json(&input.assignment)?,
            references: to_json(&input.references)?,
        };
        let lesson_id = upsert_lesson_row(
            &transaction,
            &context,
            schedule.as_ref(),
            request.lesson_id.as_deref(),
            &body,
        )?;
        insert_steps(&transaction, &lesson_id, &input)?;
        insert_outcomes(&transaction, &lesson_id, schedule.as_ref())?;
        transaction.execute(
            "DELETE FROM lesson_preparations WHERE lesson_id = ?1",
            [&lesson_id],
        )?;
        transaction.commit()?;
        load_snapshot(connection, &context, Some(&lesson_id))
    })
}

// A hand-authored lesson keeps its content in one document beside the lesson row
// (lesson_authored_content), so the lesson row carries only its identity and
// scheme link — the flat goal/step/instructional-material columns stay empty, and the rich
// content is read back through query_authored_content.
pub(in crate::lesson_planning) fn save_authored_lesson(
    database: &Database,
    request: SaveAuthoredLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    let topic = request.topic.trim().to_owned();
    if topic.is_empty() {
        return Err("A lesson needs a topic.".to_owned());
    }
    let subtopic = request
        .subtopic
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    let content = serde_json::to_string(&request.content)
        .map_err(|error| format!("The lesson could not be saved: {error}"))?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let schedule = resolve_schedule(
            &transaction,
            &context,
            request.scheme_week_id.as_deref(),
            request.scheme_entry_id.as_deref(),
        )?;
        let body = LessonRowBody {
            input_mode: "structured".to_owned(),
            topic,
            subtopic,
            raw_plan: None,
            learning_goals: "[]".to_owned(),
            instructional_materials: "[]".to_owned(),
            previous_knowledge: "[]".to_owned(),
            assessment: "[]".to_owned(),
            assignment: "[]".to_owned(),
            references: "[]".to_owned(),
        };
        let lesson_id = upsert_lesson_row(
            &transaction,
            &context,
            schedule.as_ref(),
            request.lesson_id.as_deref(),
            &body,
        )?;
        insert_outcomes(&transaction, &lesson_id, schedule.as_ref())?;
        transaction.execute(
            "INSERT INTO lesson_authored_content (lesson_id, content)
             VALUES (?1, ?2)
             ON CONFLICT(lesson_id) DO UPDATE SET content = ?2, updated_at = CURRENT_TIMESTAMP",
            params![lesson_id, content],
        )?;
        transaction.execute(
            "DELETE FROM lesson_preparations WHERE lesson_id = ?1",
            [&lesson_id],
        )?;
        transaction.commit()?;
        load_snapshot(connection, &context, Some(&lesson_id))
    })
}

/// Keeps a student's note beside a lesson in the selected class and term,
/// replacing whatever note the lesson carried before.
pub(in crate::lesson_planning) fn save_note(
    database: &Database,
    context: &LessonContextRequest,
    lesson_id: &str,
    paragraphs: &[String],
    written_from_version: i64,
) -> Result<(), String> {
    database.with_connection(|connection| {
        let context = resolve_context(connection, context)?;
        let lesson_in_context = connection.query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM lessons
                 WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3
             )",
            params![lesson_id, context.period_id, context.assignment_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !lesson_in_context {
            return Err(RepositoryError::NotFound(
                "That lesson is not available in the selected class and term.".to_owned(),
            ));
        }
        save_student_note(connection, lesson_id, paragraphs, written_from_version)
    })
}

/// Insert a note or replace the one the lesson already carries.
fn save_student_note(
    connection: &Connection,
    lesson_id: &str,
    paragraphs: &[String],
    written_from_version: i64,
) -> RepositoryResult<()> {
    let paragraphs = to_json(paragraphs)?;
    connection.execute(
        "INSERT INTO lesson_notes (lesson_id, paragraphs, written_from_version)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(lesson_id) DO UPDATE SET
             paragraphs = excluded.paragraphs,
             written_from_version = excluded.written_from_version,
             generated_at = datetime('now')",
        params![lesson_id, paragraphs, written_from_version],
    )?;
    Ok(())
}

pub(in crate::lesson_planning) fn save_granular_lesson(
    database: &Database,
    request: SaveGranularLessonRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    request
        .record
        .validate_complete()
        .map_err(|errors| errors.join("\n"))?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let (status, input_mode, source_raw_plan) = transaction
            .query_row(
                "SELECT status, input_mode, raw_plan FROM lessons
                 WHERE id = ?1 AND academic_period_id = ?2 AND teaching_assignment_id = ?3",
                params![request.lesson_id, context.period_id, context.assignment_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
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
                "This confirmed lesson cannot be changed. Create a new version to continue."
                    .to_owned(),
            ));
        }
        match input_mode.as_str() {
            "structured" => {
                persist_granular_draft(&transaction, &request.lesson_id, &request.record)?
            }
            "pasted" => {
                let source_raw_plan = source_raw_plan.ok_or_else(|| {
                    RepositoryError::Conflict(
                        "The original pasted lesson is unavailable.".to_owned(),
                    )
                })?;
                persist_granular_preparation(
                    &transaction,
                    &request.lesson_id,
                    &source_raw_plan,
                    &request.record,
                )?;
            }
            _ => {
                return Err(RepositoryError::Validation(
                    "The saved lesson input method is not supported.".to_owned(),
                ))
            }
        }
        transaction.commit()?;
        load_snapshot(connection, &context, Some(&request.lesson_id))
    })
}

fn insert_steps(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    input: &ValidatedLessonDraft,
) -> RepositoryResult<()> {
    insert_lesson_steps(transaction, lesson_id, &input.steps)
}

fn insert_lesson_steps(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    steps: &[ValidatedLessonStep],
) -> RepositoryResult<()> {
    for (index, step) in steps.iter().enumerate() {
        transaction.execute(
            "INSERT INTO lesson_steps (
                 id, lesson_id, sequence, title,
                 teacher_activity, learner_activity, duration_minutes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                new_id("lesson-step"),
                lesson_id,
                (index + 1) as i64,
                step.title,
                step.teacher_activity,
                step.learner_activity,
                step.duration_minutes,
            ],
        )?;
    }
    Ok(())
}

fn persist_granular_draft(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    record: &GranularLessonRecord,
) -> RepositoryResult<()> {
    update_lesson_projection(transaction, lesson_id, record)?;
    let serialized = SerializedGranularRecord::new(record)?;
    transaction.execute(
        "INSERT INTO lesson_granular_drafts (
             lesson_id, plan_json, plan_sha256, curriculum_snapshot_json,
             curriculum_snapshot_sha256, source_evidence_snapshot_json,
             source_evidence_snapshot_sha256, program_id, program_version,
             program_digest, program_run_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(lesson_id) DO UPDATE SET
             plan_json = excluded.plan_json,
             plan_sha256 = excluded.plan_sha256,
             curriculum_snapshot_json = excluded.curriculum_snapshot_json,
             curriculum_snapshot_sha256 = excluded.curriculum_snapshot_sha256,
             source_evidence_snapshot_json = excluded.source_evidence_snapshot_json,
             source_evidence_snapshot_sha256 = excluded.source_evidence_snapshot_sha256,
             program_id = excluded.program_id,
             program_version = excluded.program_version,
             program_digest = excluded.program_digest,
             program_run_id = excluded.program_run_id,
             updated_at = CURRENT_TIMESTAMP",
        params![
            lesson_id,
            serialized.plan_json,
            serialized.plan_sha256,
            serialized.curriculum_json,
            serialized.curriculum_sha256,
            serialized.evidence_json,
            serialized.evidence_sha256,
            record.program_snapshot.program_id,
            record.program_snapshot.program_version,
            record.program_snapshot.program_digest,
            record.program_snapshot.program_run_id,
        ],
    )?;
    Ok(())
}

fn persist_granular_preparation(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    source_raw_plan: &str,
    record: &GranularLessonRecord,
) -> RepositoryResult<()> {
    let changed = transaction.execute(
        // Only what a preparation needs of its own: the text it came from, and
        // the topic a list reads without opening a plan. The rest is the plan's,
        // and copying it here is what let the two disagree.
        "INSERT INTO lesson_preparations (
             lesson_id, source_raw_plan, topic, subtopic, learning_goals,
             instructional_materials, previous_knowledge, assessment, reference_notes
         ) VALUES (?1, ?2, ?3, ?4, '[]', '[]', '[]', '[]', '[]')
         ON CONFLICT(lesson_id) DO UPDATE SET
             topic = excluded.topic,
             subtopic = excluded.subtopic,
             updated_at = CURRENT_TIMESTAMP
         WHERE lesson_preparations.source_raw_plan = excluded.source_raw_plan",
        params![
            lesson_id,
            source_raw_plan,
            record.plan.topic,
            record.plan.subtopic,
        ],
    )?;
    if changed == 0 {
        return Err(RepositoryError::Conflict(
            "The pasted lesson changed after it was prepared. Prepare it again before confirming."
                .to_owned(),
        ));
    }
    replace_preparation_step_projection(transaction, lesson_id, record)?;
    let serialized = SerializedGranularRecord::new(record)?;
    transaction.execute(
        "INSERT INTO lesson_granular_preparations (
             lesson_id, plan_json, plan_sha256, curriculum_snapshot_json,
             curriculum_snapshot_sha256, source_evidence_snapshot_json,
             source_evidence_snapshot_sha256, program_id, program_version,
             program_digest, program_run_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(lesson_id) DO UPDATE SET
             plan_json = excluded.plan_json,
             plan_sha256 = excluded.plan_sha256,
             curriculum_snapshot_json = excluded.curriculum_snapshot_json,
             curriculum_snapshot_sha256 = excluded.curriculum_snapshot_sha256,
             source_evidence_snapshot_json = excluded.source_evidence_snapshot_json,
             source_evidence_snapshot_sha256 = excluded.source_evidence_snapshot_sha256,
             program_id = excluded.program_id,
             program_version = excluded.program_version,
             program_digest = excluded.program_digest,
             program_run_id = excluded.program_run_id,
             updated_at = CURRENT_TIMESTAMP",
        params![
            lesson_id,
            serialized.plan_json,
            serialized.plan_sha256,
            serialized.curriculum_json,
            serialized.curriculum_sha256,
            serialized.evidence_json,
            serialized.evidence_sha256,
            record.program_snapshot.program_id,
            record.program_snapshot.program_version,
            record.program_snapshot.program_digest,
            record.program_snapshot.program_run_id,
        ],
    )?;
    Ok(())
}

fn update_lesson_projection(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    record: &GranularLessonRecord,
) -> RepositoryResult<()> {
    // Only what a list has to read without opening a plan. The rest of the
    // lesson is the plan's, and copying it here is what let the two disagree —
    // the reference line most of all, which was flattened to "{title} —
    // {attribution}" and could no longer be resolved back to its record.
    transaction.execute(
        "UPDATE lessons SET topic = ?1, subtopic = ?2, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
        params![record.plan.topic, record.plan.subtopic, lesson_id],
    )?;
    Ok(())
}

fn replace_preparation_step_projection(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    record: &GranularLessonRecord,
) -> RepositoryResult<()> {
    transaction.execute(
        "DELETE FROM lesson_preparation_steps WHERE lesson_id = ?1",
        [lesson_id],
    )?;
    for step in &record.plan.steps {
        transaction.execute(
            "INSERT INTO lesson_preparation_steps (
                 id, lesson_id, sequence, title, teacher_activity,
                 learner_activity, duration_minutes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                new_id("lesson-preparation-step"),
                lesson_id,
                i64::from(step.sequence),
                step.title,
                step.teacher_activities.join("\n"),
                step.learner_activities.join("\n"),
                i64::from(step.duration_minutes),
            ],
        )?;
    }
    Ok(())
}

struct SerializedGranularRecord {
    plan_json: String,
    plan_sha256: String,
    curriculum_json: String,
    curriculum_sha256: String,
    evidence_json: String,
    evidence_sha256: String,
}

impl SerializedGranularRecord {
    fn new(record: &GranularLessonRecord) -> RepositoryResult<Self> {
        let (plan_json, plan_sha256) = serialize_hashed(&record.plan)?;
        let (curriculum_json, curriculum_sha256) = serialize_hashed(&record.curriculum_snapshot)?;
        let (evidence_json, evidence_sha256) = serialize_hashed(&record.source_evidence_snapshot)?;
        Ok(Self {
            plan_json,
            plan_sha256,
            curriculum_json,
            curriculum_sha256,
            evidence_json,
            evidence_sha256,
        })
    }
}

fn serialize_hashed<T: Serialize>(value: &T) -> RepositoryResult<(String, String)> {
    let value = serde_json::to_value(value).map_err(|error| {
        RepositoryError::Validation(format!("The detailed lesson could not be encoded: {error}"))
    })?;
    let digest = digest_json(&value);
    let serialized = serde_json::to_string(&value).map_err(|error| {
        RepositoryError::Validation(format!("The detailed lesson could not be encoded: {error}"))
    })?;
    Ok((serialized, digest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lesson_planning::domain::{
        LessonInputMode, LessonStatus, LessonWorkspaceRequest, SaveAuthoredLessonRequest,
        SaveLessonDraftRequest, StudentNote,
    };
    use crate::lesson_planning::repository::get_context;
    use crate::lesson_planning::repository::test_support::{
        setup, structured_request, teacher_authored_lesson, TestContext,
    };

    fn authored_request(
        context: &TestContext,
        lesson_id: Option<String>,
        content: serde_json::Value,
    ) -> SaveAuthoredLessonRequest {
        SaveAuthoredLessonRequest {
            context: context.lesson_context.clone(),
            lesson_id,
            scheme_week_id: Some(context.teaching_week_id.clone()),
            scheme_entry_id: Some(context.scheme_entry_id.clone()),
            topic: "Whole Numbers".to_owned(),
            subtopic: Some("Millions".to_owned()),
            content,
        }
    }

    /// A weekly plan carries one lesson, and being told so is the whole point:
    /// the generic database message advises closing the app, which cannot help
    /// because every further attempt fails on the same rule.
    #[test]
    fn refuses_a_second_lesson_on_a_weekly_plan_and_says_what_to_do() {
        let context = setup();
        save_draft(&context.database, structured_request(&context)).expect("the first lesson");

        let refusal = save_draft(&context.database, structured_request(&context))
            .expect_err("a second lesson on the same weekly plan");

        assert_eq!(
            refusal,
            "This weekly plan already has a lesson. Open that lesson instead of starting another."
        );
    }

    fn reopened_note(context: &TestContext, lesson_id: &str) -> StudentNote {
        get_context(
            &context.database,
            LessonWorkspaceRequest {
                context: context.lesson_context.clone(),
                selected_lesson_id: Some(lesson_id.to_owned()),
            },
        )
        .expect("reopened lesson")
        .selected_lesson
        .expect("selected lesson")
        .student_note
        .expect("the lesson carries its note")
    }

    /// A teacher writes one plan for the week, so a lesson can be bound to the
    /// week itself rather than to one subtopic of it. It records the week and no
    /// entry, which is what the scope means, and it is written against every
    /// outcome the week commits them to rather than one entry's.
    #[test]
    fn a_lesson_can_be_planned_for_the_week_rather_than_one_subtopic_of_it() {
        let context = setup();
        let mut request = structured_request(&context);
        request.scheme_entry_id = None;
        request.scheme_week_id = Some(context.teaching_week_id.clone());

        let lesson = save_draft(&context.database, request)
            .expect("the week's plan")
            .selected_lesson
            .expect("the saved lesson");

        assert_eq!(
            lesson.scheme_week_id.as_ref(),
            Some(&context.teaching_week_id)
        );
        assert_eq!(lesson.scheme_entry_id, None);
        assert!(
            !lesson.curriculum_outcomes.is_empty(),
            "a week's plan is written against the outcomes that week commits to"
        );
    }

    /// A planned lesson answers from its plan, so nothing has to be copied out
    /// of it and nothing can drift from it.
    ///
    /// The copy that used to sit on these columns had already drifted in the
    /// owner's library: three of nine planned lessons disagreed with their own
    /// plan about the instructional materials.
    #[test]
    fn a_planned_lesson_reads_its_content_from_the_plan_and_not_a_copy() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("draft")
            .selected_lesson
            .expect("lesson")
            .id;
        let mut record = crate::lesson_planning::granular::tests::granular_record();
        record.program_snapshot.program_run_id = None;
        record.plan.instructional_materials = vec!["A fraction wall".to_owned()];
        save_granular_lesson(
            &context.database,
            SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                record,
            },
        )
        .expect("a plan");

        // Left where the copy used to be written, so a reader that went back to
        // the column would be caught rather than quietly agreeing.
        context
            .database
            .with_connection(|connection| {
                connection.execute(
                    "UPDATE lessons SET instructional_materials = json('[\"A stale copy\"]')
                     WHERE id = ?1",
                    [&lesson_id],
                )
            })
            .expect("a stale copy");

        let reopened = get_context(
            &context.database,
            LessonWorkspaceRequest {
                context: context.lesson_context,
                selected_lesson_id: Some(lesson_id),
            },
        )
        .expect("the reopened lesson")
        .selected_lesson
        .expect("selected lesson");

        assert_eq!(
            reopened.instructional_materials,
            vec!["A fraction wall".to_owned()]
        );
    }

    /// The two sections a lesson plan carries that graspy never held. They are
    /// the teacher's own words on the paper their school reads, so they survive
    /// the round trip whole rather than being rebuilt from anything else.
    #[test]
    fn a_lesson_keeps_the_previous_knowledge_and_assignment_its_teacher_wrote() {
        let context = setup();

        let lesson = save_draft(&context.database, structured_request(&context))
            .expect("draft saves")
            .selected_lesson
            .expect("the saved lesson");

        assert_eq!(
            lesson.previous_knowledge,
            vec!["Learners can add and subtract whole numbers.".to_owned()]
        );
        assert_eq!(
            lesson.assignment,
            vec!["Exercise 4b, questions 1 to 5.".to_owned()]
        );
    }

    #[test]
    fn saves_a_draft_that_only_states_the_topic_and_learning_goals() {
        let context = setup();
        let request = SaveLessonDraftRequest {
            steps: vec![],
            instructional_materials: vec![],
            previous_knowledge: vec![],
            assessment: vec![],
            assignment: vec![],
            references: vec![],
            ..structured_request(&context)
        };

        let snapshot = save_draft(&context.database, request).expect("draft saves");

        let lesson = snapshot.lessons.first().expect("a saved lesson");
        assert_eq!(lesson.status, LessonStatus::Draft);
    }

    #[test]
    fn saves_a_hand_authored_lesson_as_its_own_document_and_reads_it_back() {
        let context = setup();
        let content = serde_json::json!({
            "objectives": ["Count in millions."],
            "instructionalMaterials": ["Place-value chart"],
            "steps": [{
                "id": "step-1",
                "title": "Count forward",
                "durationMinutes": 15,
                "summary": "Count in millions.",
                "blocks": [{ "type": "explanation", "id": "block-1", "content": "A million is a thousand thousands." }],
            }],
            "checks": [{ "id": "check-1", "question": "Write four million.", "expectedAnswer": "4,000,000" }],
        });

        let snapshot = save_authored_lesson(
            &context.database,
            authored_request(&context, None, content.clone()),
        )
        .expect("the hand-authored lesson saves");

        let lesson = snapshot
            .selected_lesson
            .expect("the saved lesson is selected");
        assert_eq!(lesson.topic, "Whole Numbers");
        assert_eq!(lesson.status, LessonStatus::Draft);
        assert_eq!(lesson.authored_content, Some(content));
        // The content lives in its own document, so the flat columns stay empty.
        assert!(lesson.learning_goals.is_empty());
        assert!(lesson.steps.is_empty());

        // Saving again replaces the document in place rather than adding a lesson.
        let rewritten = serde_json::json!({
            "objectives": ["Count in billions."],
            "instructionalMaterials": [],
            "steps": [],
            "checks": [],
        });
        let updated = save_authored_lesson(
            &context.database,
            authored_request(&context, Some(lesson.id.clone()), rewritten.clone()),
        )
        .expect("the lesson updates");
        assert_eq!(updated.lessons.len(), 1);
        assert_eq!(
            updated
                .selected_lesson
                .expect("still selected")
                .authored_content,
            Some(rewritten),
        );
    }

    #[test]
    fn keeps_one_student_note_per_lesson_and_reads_it_back_from_the_snapshot() {
        let context = setup();
        let lesson_id = teacher_authored_lesson(&context);

        save_note(
            &context.database,
            &context.lesson_context,
            &lesson_id,
            &[
                "Recall what equivalent fractions are.".to_owned(),
                "Practise comparing halves and quarters.".to_owned(),
            ],
            2,
        )
        .expect("the note saves");

        let note = reopened_note(&context, &lesson_id);
        assert_eq!(
            note,
            StudentNote {
                paragraphs: vec![
                    "Recall what equivalent fractions are.".to_owned(),
                    "Practise comparing halves and quarters.".to_owned(),
                ],
                written_from_version: 2,
            }
        );

        // Saving again replaces the note in place rather than adding a second row.
        save_note(
            &context.database,
            &context.lesson_context,
            &lesson_id,
            &["Only this paragraph, written from a later version.".to_owned()],
            5,
        )
        .expect("the note updates");

        assert_eq!(
            reopened_note(&context, &lesson_id),
            StudentNote {
                paragraphs: vec!["Only this paragraph, written from a later version.".to_owned()],
                written_from_version: 5,
            }
        );
        let note_rows = context
            .database
            .with_connection(|connection| {
                connection.query_row("SELECT COUNT(*) FROM lesson_notes", [], |row| {
                    row.get::<_, i64>(0)
                })
            })
            .expect("the note count");
        assert_eq!(note_rows, 1, "a lesson keeps a single note");
    }

    #[test]
    fn refuses_a_student_note_for_a_lesson_outside_the_selected_class_and_term() {
        let context = setup();

        let error = save_note(
            &context.database,
            &context.lesson_context,
            "lesson-that-does-not-exist",
            &["A note with nowhere to live.".to_owned()],
            1,
        )
        .expect_err("a note needs a lesson in the selected class and term");

        assert!(
            error.contains("not available"),
            "unexpected message: {error}"
        );
    }

    #[test]
    fn stores_pasted_text_exactly_for_later_confirmation() {
        let context = setup();
        let raw_plan = "Lesson: Fractions\n\nTeacher demonstrates 1/2 = 2/4.\n";
        let saved = save_draft(
            &context.database,
            SaveLessonDraftRequest {
                context: context.lesson_context,
                lesson_id: None,
                scheme_week_id: None,
                scheme_entry_id: None,
                input_mode: LessonInputMode::Pasted,
                topic: "Fractions".to_owned(),
                subtopic: None,
                raw_plan: Some(raw_plan.to_owned()),
                learning_goals: vec![],
                steps: vec![],
                instructional_materials: vec![],
                previous_knowledge: vec![],
                assessment: vec![],
                assignment: vec![],
                references: vec![],
            },
        )
        .expect("pasted lesson")
        .selected_lesson
        .expect("selected lesson");

        assert_eq!(saved.raw_plan.as_deref(), Some(raw_plan));
        assert_eq!(saved.input_mode, LessonInputMode::Pasted);
    }

    #[test]
    fn rejects_a_lesson_launched_from_a_break_week() {
        let context = setup();
        let mut request = structured_request(&context);
        request.scheme_week_id = Some(context.break_week_id);
        request.scheme_entry_id = None;

        let error = save_draft(&context.database, request).expect_err("break lesson");

        assert!(error.contains("break or examination"));
    }
}
