use rusqlite::{params, Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::db::Database;
use crate::generation_program::domain::digest_json;

use super::{
    from_json, query_scheme_entry_outcomes, resolve_context, RepositoryError, RepositoryResult,
    ResolvedContext,
};
use crate::lesson_planning::domain::CLASSWORK_COMPLETE_SQL;
use crate::lesson_planning::domain::{
    LessonCurriculumOutcome, LessonCurriculumUnit, LessonDraft, LessonInputMode, LessonPreparation,
    LessonSchemeEntryOption, LessonStatus, LessonStep, LessonSummary, LessonWorkspaceRequest,
    LessonWorkspaceSnapshot, StudentNote,
};
use crate::lesson_planning::granular::{
    GranularLessonRecord, LessonPlanFormat, LessonProgramSnapshot,
};

pub(in crate::lesson_planning) fn get_context(
    database: &Database,
    request: LessonWorkspaceRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    database.with_connection(move |connection| {
        let context = resolve_context(connection, &request.context)?;
        load_snapshot(connection, &context, request.selected_lesson_id.as_deref())
    })
}

pub(super) fn load_snapshot(
    connection: &Connection,
    context: &ResolvedContext,
    selected_lesson_id: Option<&str>,
) -> RepositoryResult<LessonWorkspaceSnapshot> {
    Ok(LessonWorkspaceSnapshot {
        lessons: query_lessons(connection, context)?,
        selected_lesson: selected_lesson_id
            .map(|lesson_id| query_lesson(connection, context, lesson_id))
            .transpose()?,
        available_scheme_entries: query_available_scheme_entries(connection, context)?,
    })
}

fn query_lessons(
    connection: &Connection,
    context: &ResolvedContext,
) -> RepositoryResult<Vec<LessonSummary>> {
    let mut statement = connection.prepare(&format!(
        "SELECT lessons.id, lessons.topic, lessons.subtopic, lessons.status,
                lessons.input_mode, lessons.latest_version_number, scheme_weeks.ordinal,
                CASE WHEN EXISTS (SELECT 1 FROM lesson_granular_drafts written
                                  WHERE written.lesson_id = lessons.id)
                     THEN 'granular' ELSE 'legacy_import' END,
                lessons.scheme_entry_id, lessons.created_at,
                {CLASSWORK_COMPLETE_SQL}
         FROM lessons
         LEFT JOIN scheme_entries ON scheme_entries.id = lessons.scheme_entry_id
         LEFT JOIN scheme_weeks ON scheme_weeks.id
             = COALESCE(lessons.scheme_week_id, scheme_entries.scheme_week_id)
         WHERE lessons.academic_period_id = ?1 AND lessons.teaching_assignment_id = ?2
         ORDER BY lessons.updated_at DESC, lessons.id",
    ))?;
    let rows = statement.query_map(params![context.period_id, context.assignment_id], |row| {
        let status = row.get::<_, String>(3)?;
        let input_mode = row.get::<_, String>(4)?;
        Ok(LessonSummary {
            id: row.get(0)?,
            topic: row.get(1)?,
            subtopic: row.get(2)?,
            status: parse_status(&status),
            input_mode: parse_input_mode(&input_mode),
            plan_format: LessonPlanFormat::parse(&row.get::<_, String>(7)?).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    7,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
                )
            })?,
            latest_version_number: row.get(5)?,
            week_ordinal: row.get(6)?,
            scheme_entry_id: row.get(8)?,
            started_at: row.get(9)?,
            classwork_complete: row.get(10)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// A lesson exactly as its own row holds it, before the steps, preparation and
/// records kept in other tables join it.
///
/// The row is read into names rather than a position-ordered tuple: a lesson
/// carries fifteen columns of its own, and reading them as `row.get(9)` beside a
/// destructure fifty lines away is how a column ends up in the wrong field.
struct SavedLesson {
    id: String,
    scheme_week_id: Option<String>,
    scheme_entry_id: Option<String>,
    input_mode: LessonInputMode,
    topic: String,
    subtopic: Option<String>,
    raw_plan: Option<String>,
    learning_goals: String,
    instructional_materials: String,
    previous_knowledge: String,
    assessment: String,
    assignment: String,
    references: String,
    curriculum_unit: Option<LessonCurriculumUnit>,
    status: LessonStatus,
    latest_version_number: i64,
    course_id: Option<String>,
    source_plan_text: Option<String>,
    plan_format: String,
}

const SAVED_LESSON_COLUMNS: &str = "SELECT
         lessons.id,
         COALESCE(lessons.scheme_week_id, planned_entry.scheme_week_id),
         lessons.scheme_entry_id,
         lessons.input_mode, lessons.topic, lessons.subtopic, lessons.raw_plan,
         CASE WHEN draft.plan_json IS NULL THEN lessons.learning_goals ELSE
             (SELECT json_group_array(said) FROM (
                 SELECT json_extract(goal.value, '$.statement') AS said
                 FROM json_each(draft.plan_json, '$.lessonObjectives') goal ORDER BY goal.key))
         END,
         CASE WHEN draft.plan_json IS NULL THEN lessons.instructional_materials
              ELSE json_extract(draft.plan_json, '$.materials') END,
         CASE WHEN draft.plan_json IS NULL THEN lessons.previous_knowledge ELSE
             (SELECT json_group_array(said) FROM (
                 SELECT json_extract(known.value, '$.statement') AS said
                 FROM json_each(draft.plan_json, '$.priorKnowledge') known ORDER BY known.key))
         END,
         CASE WHEN draft.plan_json IS NULL THEN lessons.assessment ELSE
             (SELECT json_group_array(said) FROM (
                 SELECT json_extract(check_.value, '$.question') AS said
                 FROM json_each(draft.plan_json, '$.assessments') check_ ORDER BY check_.key))
         END,
         lessons.assignment,
         CASE WHEN draft.plan_json IS NULL THEN lessons.reference_notes ELSE
             (SELECT json_group_array(said) FROM (
                 SELECT json_extract(cited.value, '$.title') || ' — '
                        || json_extract(cited.value, '$.attribution') AS said
                 FROM json_each(draft.plan_json, '$.references') cited ORDER BY cited.key))
         END,
         COALESCE(lessons.curriculum_unit_id, lessons.curriculum_node_id),
         COALESCE(curriculum_units.title, curriculum_nodes.title),
         lessons.status, lessons.latest_version_number,
         lessons.curriculum_course_id, lessons.source_plan_text,
         CASE WHEN draft.plan_json IS NOT NULL THEN 'granular' ELSE 'legacy_import' END
     FROM lessons
     LEFT JOIN scheme_entries planned_entry ON planned_entry.id = lessons.scheme_entry_id
     LEFT JOIN lesson_granular_drafts draft ON draft.lesson_id = lessons.id
     LEFT JOIN curriculum_units ON curriculum_units.id = lessons.curriculum_unit_id
     LEFT JOIN curriculum_nodes ON curriculum_nodes.id = lessons.curriculum_node_id
     WHERE lessons.id = ?1
       AND lessons.academic_period_id = ?2
       AND lessons.teaching_assignment_id = ?3";

impl SavedLesson {
    fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        let input_mode = row.get::<_, String>(3)?;
        let status = row.get::<_, String>(15)?;
        let unit_id = row.get::<_, Option<String>>(13)?;
        let unit_title = row.get::<_, Option<String>>(14)?;
        Ok(Self {
            id: row.get(0)?,
            scheme_week_id: row.get(1)?,
            scheme_entry_id: row.get(2)?,
            input_mode: parse_input_mode(&input_mode),
            topic: row.get(4)?,
            subtopic: row.get(5)?,
            raw_plan: row.get(6)?,
            learning_goals: row.get(7)?,
            instructional_materials: row.get(8)?,
            previous_knowledge: row.get(9)?,
            assessment: row.get(10)?,
            assignment: row.get(11)?,
            references: row.get(12)?,
            curriculum_unit: unit_id
                .zip(unit_title)
                .map(|(id, title)| LessonCurriculumUnit { id, title }),
            status: parse_status(&status),
            latest_version_number: row.get(16)?,
            course_id: row.get(17)?,
            source_plan_text: row.get(18)?,
            plan_format: row.get(19)?,
        })
    }
}

fn query_lesson(
    connection: &Connection,
    context: &ResolvedContext,
    lesson_id: &str,
) -> RepositoryResult<LessonDraft> {
    let saved = connection
        .query_row(
            SAVED_LESSON_COLUMNS,
            params![lesson_id, context.period_id, context.assignment_id],
            SavedLesson::read,
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound(
                "That lesson is not available in the selected class and term.".to_owned(),
            )
        })?;
    assemble_draft(connection, context, saved)
}

fn assemble_draft(
    connection: &Connection,
    context: &ResolvedContext,
    saved: SavedLesson,
) -> RepositoryResult<LessonDraft> {
    let plan_format = LessonPlanFormat::parse(&saved.plan_format)?;
    let granular_record = if plan_format == LessonPlanFormat::Granular {
        Some(query_granular_record(
            connection,
            GranularRecordLocation::Draft,
            &saved.id,
        )?)
    } else {
        None
    };
    Ok(LessonDraft {
        answer_report: granular_record
            .as_ref()
            .map(|record| crate::lesson_planning::granular::answer_report(&record.plan)),
        steps: query_steps(connection, &saved.id)?,
        preparation: query_preparation(connection, &saved.id)?,
        authored_content: query_authored_content(connection, &saved.id)?,
        student_note: query_student_note(connection, &saved.id)?,
        curriculum_outcomes: saved
            .course_id
            .as_deref()
            .map(|course_id| query_lesson_outcomes(connection, &saved.id, course_id))
            .transpose()?
            .unwrap_or_default(),
        id: saved.id,
        academic_session_id: context.session_id.clone(),
        academic_period_id: context.period_id.clone(),
        academic_period_name: context.period_name.clone(),
        teaching_assignment_id: context.assignment_id.clone(),
        scheme_week_id: saved.scheme_week_id,
        scheme_entry_id: saved.scheme_entry_id,
        input_mode: saved.input_mode,
        plan_format,
        topic: saved.topic,
        subtopic: saved.subtopic,
        raw_plan: saved.raw_plan,
        source_plan_text: saved.source_plan_text,
        learning_goals: from_json(&saved.learning_goals)?,
        instructional_materials: from_json(&saved.instructional_materials)?,
        previous_knowledge: from_json(&saved.previous_knowledge)?,
        assessment: from_json(&saved.assessment)?,
        assignment: from_json(&saved.assignment)?,
        references: from_json(&saved.references)?,
        curriculum_unit: saved.curriculum_unit,
        status: saved.status,
        latest_version_number: saved.latest_version_number,
        granular_record,
    })
}

fn query_authored_content(
    connection: &Connection,
    lesson_id: &str,
) -> RepositoryResult<Option<serde_json::Value>> {
    connection
        .query_row(
            "SELECT content FROM lesson_authored_content WHERE lesson_id = ?1",
            [lesson_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .map(|content| {
            serde_json::from_str::<serde_json::Value>(&content).map_err(|error| {
                RepositoryError::Validation(format!("The saved lesson is invalid: {error}"))
            })
        })
        .transpose()
}

fn query_student_note(
    connection: &Connection,
    lesson_id: &str,
) -> RepositoryResult<Option<StudentNote>> {
    connection
        .query_row(
            "SELECT paragraphs, written_from_version FROM lesson_notes WHERE lesson_id = ?1",
            [lesson_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()?
        .map(|(paragraphs, written_from_version)| {
            Ok(StudentNote {
                paragraphs: from_json(&paragraphs)?,
                written_from_version,
            })
        })
        .transpose()
}

fn query_preparation(
    connection: &Connection,
    lesson_id: &str,
) -> RepositoryResult<Option<LessonPreparation>> {
    connection
        .query_row(
            // A preparation with a plan behind it answers from that plan; one
            // still being worked up from pasted text has only its own columns.
            // One writer each, which is what the copy between them was not.
            "SELECT preparation.source_raw_plan, preparation.topic, preparation.subtopic,
                    CASE WHEN plan.plan_json IS NULL THEN preparation.learning_goals ELSE
                        (SELECT json_group_array(said) FROM (
                            SELECT json_extract(goal.value, '$.statement') AS said
                            FROM json_each(plan.plan_json, '$.lessonObjectives') goal
                            ORDER BY goal.key))
                    END,
                    CASE WHEN plan.plan_json IS NULL THEN preparation.instructional_materials
                         ELSE json_extract(plan.plan_json, '$.materials') END,
                    CASE WHEN plan.plan_json IS NULL THEN preparation.previous_knowledge ELSE
                        (SELECT json_group_array(said) FROM (
                            SELECT json_extract(known.value, '$.statement') AS said
                            FROM json_each(plan.plan_json, '$.priorKnowledge') known
                            ORDER BY known.key))
                    END,
                    CASE WHEN plan.plan_json IS NULL THEN preparation.assessment ELSE
                        (SELECT json_group_array(said) FROM (
                            SELECT json_extract(check_.value, '$.question') AS said
                            FROM json_each(plan.plan_json, '$.assessments') check_
                            ORDER BY check_.key))
                    END,
                    CASE WHEN plan.plan_json IS NULL THEN preparation.reference_notes ELSE
                        (SELECT json_group_array(said) FROM (
                            SELECT json_extract(cited.value, '$.title') || ' — '
                                   || json_extract(cited.value, '$.attribution') AS said
                            FROM json_each(plan.plan_json, '$.references') cited
                            ORDER BY cited.key))
                    END,
                    CASE WHEN plan.plan_json IS NULL THEN 'legacy_import' ELSE 'granular' END
             FROM lesson_preparations preparation
             LEFT JOIN lesson_granular_preparations plan ON plan.lesson_id = preparation.lesson_id
             WHERE preparation.lesson_id = ?1",
            [lesson_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .optional()?
        .map(
            |(
                source_raw_plan,
                topic,
                subtopic,
                learning_goals,
                instructional_materials,
                previous_knowledge,
                assessment,
                references,
                plan_format,
            )| {
                let plan_format = LessonPlanFormat::parse(&plan_format)?;
                let prepared = if plan_format == LessonPlanFormat::Granular {
                    Some(query_granular_record(
                        connection,
                        GranularRecordLocation::Preparation,
                        lesson_id,
                    )?)
                } else {
                    None
                };
                Ok(LessonPreparation {
                    lesson_id: lesson_id.to_owned(),
                    source_raw_plan,
                    topic,
                    subtopic,
                    learning_goals: from_json(&learning_goals)?,
                    steps: query_preparation_steps(connection, lesson_id)?,
                    instructional_materials: from_json(&instructional_materials)?,
                    previous_knowledge: from_json(&previous_knowledge)?,
                    assessment: from_json(&assessment)?,
                    references: from_json(&references)?,
                    plan_format,
                    granular_record: prepared.clone(),
                    answer_report: prepared
                        .as_ref()
                        .map(|record| crate::lesson_planning::granular::answer_report(&record.plan)),
                })
            },
        )
        .transpose()
}

#[derive(Clone, Copy)]
pub(super) enum GranularRecordLocation {
    Draft,
    Preparation,
}

pub(super) fn query_granular_record(
    connection: &Connection,
    location: GranularRecordLocation,
    owner_id: &str,
) -> RepositoryResult<GranularLessonRecord> {
    let sql = match location {
        GranularRecordLocation::Draft => {
            "SELECT plan_json, plan_sha256, curriculum_snapshot_json,
                    curriculum_snapshot_sha256, source_evidence_snapshot_json,
                    source_evidence_snapshot_sha256, program_id, program_version,
                    program_digest, program_run_id
             FROM lesson_granular_drafts WHERE lesson_id = ?1"
        }
        GranularRecordLocation::Preparation => {
            "SELECT plan_json, plan_sha256, curriculum_snapshot_json,
                    curriculum_snapshot_sha256, source_evidence_snapshot_json,
                    source_evidence_snapshot_sha256, program_id, program_version,
                    program_digest, program_run_id
             FROM lesson_granular_preparations WHERE lesson_id = ?1"
        }
    };
    let stored = connection
        .query_row(sql, [owner_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        })
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Conflict(
                "The saved detailed lesson is incomplete. Reopen the lesson and save it again."
                    .to_owned(),
            )
        })?;
    let record = GranularLessonRecord {
        plan: decode_hashed(&stored.0, &stored.1, "lesson plan")?,
        curriculum_snapshot: decode_hashed(&stored.2, &stored.3, "curriculum snapshot")?,
        source_evidence_snapshot: decode_hashed(&stored.4, &stored.5, "source evidence")?,
        program_snapshot: LessonProgramSnapshot {
            program_id: stored.6,
            program_version: stored.7,
            program_digest: stored.8,
            program_run_id: stored.9,
        },
    };
    record.validate_complete().map_err(|errors| {
        RepositoryError::Conflict(format!(
            "The saved detailed lesson failed validation: {}",
            errors.join(" ")
        ))
    })?;
    Ok(record)
}

fn decode_hashed<T: DeserializeOwned>(
    json: &str,
    expected_sha256: &str,
    label: &str,
) -> RepositoryResult<T> {
    let value = serde_json::from_str::<Value>(json).map_err(|error| {
        RepositoryError::Conflict(format!("The saved {label} is invalid: {error}"))
    })?;
    if digest_json(&value) != expected_sha256 {
        return Err(RepositoryError::Conflict(format!(
            "The saved {label} failed its integrity check."
        )));
    }
    serde_json::from_value(value).map_err(|error| {
        RepositoryError::Conflict(format!("The saved {label} is invalid: {error}"))
    })
}

fn query_steps(connection: &Connection, lesson_id: &str) -> RepositoryResult<Vec<LessonStep>> {
    // A lesson graspy planned reads its steps from that plan; a lesson typed
    // into the form reads the teacher's own. One writer each, so neither can
    // drift from the other — which is what the copy between them used to do.
    let mut statement = connection.prepare(
        "SELECT json_extract(step.value, '$.id'),
                json_extract(step.value, '$.sequence'),
                json_extract(step.value, '$.title'),
                (SELECT group_concat(said.value, char(10))
                   FROM json_each(step.value, '$.teacherActivities') said),
                (SELECT group_concat(said.value, char(10))
                   FROM json_each(step.value, '$.learnerActivities') said),
                json_extract(step.value, '$.durationMinutes')
         FROM lesson_granular_drafts draft, json_each(draft.plan_json, '$.steps') step
         WHERE draft.lesson_id = ?1
         UNION ALL
         SELECT id, sequence, title, teacher_activity, learner_activity, duration_minutes
         FROM lesson_steps
         WHERE lesson_id = ?1
           AND NOT EXISTS (SELECT 1 FROM lesson_granular_drafts d WHERE d.lesson_id = ?1)
         ORDER BY 2",
    )?;
    let rows = statement.query_map([lesson_id], |row| {
        Ok(LessonStep {
            id: row.get(0)?,
            sequence: row.get(1)?,
            title: row.get(2)?,
            teacher_activity: row.get(3)?,
            learner_activity: row.get(4)?,
            duration_minutes: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_preparation_steps(
    connection: &Connection,
    lesson_id: &str,
) -> RepositoryResult<Vec<LessonStep>> {
    let mut statement = connection.prepare(
        "SELECT id, sequence, title, teacher_activity, learner_activity, duration_minutes
         FROM lesson_preparation_steps WHERE lesson_id = ?1 ORDER BY sequence",
    )?;
    let rows = statement.query_map([lesson_id], |row| {
        Ok(LessonStep {
            id: row.get(0)?,
            sequence: row.get(1)?,
            title: row.get(2)?,
            teacher_activity: row.get(3)?,
            learner_activity: row.get(4)?,
            duration_minutes: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_lesson_outcomes(
    connection: &Connection,
    lesson_id: &str,
    course_id: &str,
) -> RepositoryResult<Vec<LessonCurriculumOutcome>> {
    let mut statement = connection.prepare(
        "SELECT curriculum_outcomes.id, curriculum_outcomes.statement
         FROM lesson_curriculum_outcomes
         JOIN curriculum_outcomes
           ON curriculum_outcomes.id = lesson_curriculum_outcomes.curriculum_outcome_id
         WHERE lesson_curriculum_outcomes.lesson_id = ?1
           AND lesson_curriculum_outcomes.curriculum_course_id = ?2
         ORDER BY curriculum_outcomes.sequence",
    )?;
    let rows = statement.query_map(params![lesson_id, course_id], |row| {
        Ok(LessonCurriculumOutcome {
            id: row.get(0)?,
            statement: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_available_scheme_entries(
    connection: &Connection,
    context: &ResolvedContext,
) -> RepositoryResult<Vec<LessonSchemeEntryOption>> {
    let mut statement = connection.prepare(
        "SELECT
             scheme_weeks.id, scheme_weeks.ordinal, scheme_entries.id,
             scheme_entries.topic, scheme_entries.subtopic,
             COALESCE(curriculum_units.id, curriculum_nodes.id),
             COALESCE(curriculum_units.title, curriculum_nodes.title),
             scheme_entries.curriculum_course_id,
             scheme_entries.objectives, scheme_entries.assessment, scheme_entries.instructional_materials
         FROM schemes_of_work
         JOIN scheme_weeks ON scheme_weeks.scheme_id = schemes_of_work.id
         JOIN scheme_entries ON scheme_entries.scheme_week_id = scheme_weeks.id
         LEFT JOIN curriculum_units ON curriculum_units.id = scheme_entries.curriculum_unit_id
         LEFT JOIN curriculum_nodes ON curriculum_nodes.id = scheme_entries.curriculum_node_id
         WHERE schemes_of_work.academic_period_id = ?1
           AND schemes_of_work.teaching_assignment_id = ?2
           AND schemes_of_work.status = 'active'
           AND scheme_weeks.kind = 'teaching'
           AND scheme_entries.status = 'active'
         ORDER BY scheme_weeks.ordinal, scheme_entries.sequence",
    )?;
    let rows = statement.query_map(params![context.period_id, context.assignment_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
            LessonCurriculumUnit {
                id: row.get(5)?,
                title: row.get(6)?,
            },
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
        ))
    })?;
    rows.map(|row| {
        let (
            week_id,
            week_ordinal,
            entry_id,
            topic,
            subtopic,
            curriculum_unit,
            course_id,
            learning_goals,
            assessment,
            instructional_materials,
        ) = row?;
        Ok(LessonSchemeEntryOption {
            curriculum_outcomes: query_scheme_entry_outcomes(connection, &entry_id, &course_id)?,
            week_id,
            week_ordinal,
            entry_id,
            topic,
            subtopic,
            curriculum_unit,
            learning_goals: from_json(&learning_goals)?,
            assessment: from_json(&assessment)?,
            instructional_materials: from_json(&instructional_materials)?,
        })
    })
    .collect()
}

fn parse_status(value: &str) -> LessonStatus {
    if value == "confirmed" {
        LessonStatus::Confirmed
    } else {
        LessonStatus::Draft
    }
}

fn parse_input_mode(value: &str) -> LessonInputMode {
    if value == "pasted" {
        LessonInputMode::Pasted
    } else {
        LessonInputMode::Structured
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lesson_planning::domain::LessonWorkspaceRequest;
    use crate::lesson_planning::granular::LessonPlanFormat;
    use crate::lesson_planning::repository::save_draft;
    use crate::lesson_planning::repository::test_support::{setup, structured_request};

    /// A lesson's format is whether a plan has been written for it. Nothing
    /// records it separately, so there is nothing for a reader to disagree with.
    #[test]
    fn a_lesson_is_granular_exactly_when_it_has_a_plan() {
        let context = setup();
        let sketch = save_draft(&context.database, structured_request(&context))
            .expect("a sketch")
            .selected_lesson
            .expect("lesson")
            .id;

        let listed = |id: &str| {
            get_context(
                &context.database,
                LessonWorkspaceRequest {
                    context: context.lesson_context.clone(),
                    selected_lesson_id: None,
                },
            )
            .expect("the workspace")
            .lessons
            .into_iter()
            .find(|lesson| lesson.id == id)
            .expect("the listed lesson")
            .plan_format
        };

        assert_eq!(listed(&sketch), LessonPlanFormat::LegacyImport);

        let mut record = crate::lesson_planning::granular::tests::granular_record();
        record.program_snapshot.program_run_id = None;
        crate::lesson_planning::repository::save_granular_lesson(
            &context.database,
            crate::lesson_planning::domain::SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: sketch.clone(),
                record,
            },
        )
        .expect("a plan");

        assert_eq!(listed(&sketch), LessonPlanFormat::Granular);
    }

    /// The screen listing these lessons is written in another language and
    /// checks what arrives against its own schema, so the key names are a
    /// contract between the two. `lessonPlanning.ts` holds the other half.
    #[test]
    fn a_listed_lesson_reaches_the_screen_under_the_exact_names_it_reads() {
        let context = setup();
        save_draft(&context.database, structured_request(&context)).expect("lesson draft");
        let snapshot = get_context(
            &context.database,
            LessonWorkspaceRequest {
                context: context.lesson_context.clone(),
                selected_lesson_id: None,
            },
        )
        .expect("the workspace");

        let wire = serde_json::to_value(&snapshot.lessons[0]).expect("a listed lesson");
        let mut keys: Vec<&str> = wire
            .as_object()
            .expect("an object")
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();

        assert_eq!(
            keys,
            vec![
                "classworkComplete",
                "id",
                "inputMode",
                "latestVersionNumber",
                "planFormat",
                "schemeEntryId",
                "startedAt",
                "status",
                "subtopic",
                "topic",
                "weekOrdinal",
            ]
        );
        // The list tells two drafts of one subtopic apart by this, so an empty
        // string would leave them looking identical again.
        assert!(
            !wire["startedAt"].as_str().expect("a time").is_empty(),
            "a listed lesson says nothing about when it was started"
        );
    }

    #[test]
    fn saves_and_reopens_a_structured_lesson_with_curriculum_references() {
        let context = setup();
        let saved = save_draft(&context.database, structured_request(&context))
            .expect("lesson draft")
            .selected_lesson
            .expect("selected lesson");
        let reopened = get_context(
            &context.database,
            LessonWorkspaceRequest {
                context: context.lesson_context,
                selected_lesson_id: Some(saved.id.clone()),
            },
        )
        .expect("reopened lesson")
        .selected_lesson
        .expect("selected lesson");

        assert_eq!(saved, reopened);
        assert_eq!(
            reopened.scheme_entry_id.as_deref(),
            Some(context.scheme_entry_id.as_str())
        );
        assert_eq!(
            reopened
                .curriculum_unit
                .as_ref()
                .map(|unit| unit.title.as_str()),
            Some("Algebra")
        );
        assert_eq!(reopened.curriculum_outcomes.len(), 2);
        assert_eq!(
            reopened.steps[0].teacher_activity,
            "Model one equation using a balance."
        );
        assert_eq!(reopened.plan_format, LessonPlanFormat::LegacyImport);
        assert_eq!(reopened.granular_record, None);
    }

    #[test]
    fn starts_a_lesson_from_a_granular_curriculum_node_scheme_entry() {
        let context = setup();
        context
            .database
            .with_connection(|connection| {
                let (scheme_id, course_id): (String, String) = connection.query_row(
                    "SELECT scheme_id, curriculum_course_id FROM scheme_entries WHERE id = ?1",
                    [&context.scheme_entry_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?;
                connection.execute(
                    "INSERT INTO curriculum_nodes (
                         id, curriculum_course_id, kind, source_code, title, sequence
                     ) VALUES ('node-ordering-fractions', ?1, 'subtopic',
                               'ordering-fractions', 'Ordering fractions', 1)",
                    [&course_id],
                )?;
                connection.execute(
                    "INSERT INTO scheme_entries (
                         id, scheme_week_id, scheme_id, curriculum_course_id,
                         curriculum_node_id, sequence, topic, subtopic,
                         objectives, assessment, instructional_materials
                     ) VALUES (
                         'entry-ordering-fractions', ?1, ?2, ?3,
                         'node-ordering-fractions', 2, 'Fractions',
                         'Ordering fractions', '[\"Arrange fractions in order.\"]',
                         '[\"Order three fractions.\"]', '[\"Fraction cards\"]'
                     )",
                    params![context.teaching_week_id, scheme_id, course_id],
                )?;
                Ok::<(), rusqlite::Error>(())
            })
            .expect("granular scheme entry");

        let available = get_context(
            &context.database,
            LessonWorkspaceRequest {
                context: context.lesson_context.clone(),
                selected_lesson_id: None,
            },
        )
        .expect("lesson workspace")
        .available_scheme_entries;
        let option = available
            .iter()
            .find(|entry| entry.entry_id == "entry-ordering-fractions")
            .expect("granular weekly plan");
        assert_eq!(option.curriculum_unit.id, "node-ordering-fractions");
        assert_eq!(option.curriculum_unit.title, "Ordering fractions");

        let mut request = structured_request(&context);
        request.scheme_entry_id = Some("entry-ordering-fractions".to_owned());
        request.topic = "Fractions".to_owned();
        request.subtopic = Some("Ordering fractions".to_owned());
        let saved = save_draft(&context.database, request)
            .expect("lesson draft")
            .selected_lesson
            .expect("selected lesson");
        assert_eq!(
            saved
                .curriculum_unit
                .as_ref()
                .map(|focus| focus.title.as_str()),
            Some("Ordering fractions")
        );
        let persisted = context
            .database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT curriculum_unit_id, curriculum_node_id FROM lessons WHERE id = ?1",
                    [&saved.id],
                    |row| {
                        Ok((
                            row.get::<_, Option<String>>(0)?,
                            row.get::<_, Option<String>>(1)?,
                        ))
                    },
                )
            })
            .expect("persisted curriculum focus");
        assert_eq!(persisted.0, None);
        assert_eq!(persisted.1.as_deref(), Some("node-ordering-fractions"));
    }
}
