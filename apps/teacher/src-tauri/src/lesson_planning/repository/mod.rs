use std::fmt;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::domain::{LessonContextRequest, LessonCurriculumOutcome};

mod confirmation;
mod discarding;
mod program_input;
mod scheduling;
mod snapshot;
mod teacher_curriculum;
#[cfg(test)]
mod test_support;
mod writes;

pub(super) use confirmation::confirm_granular_lesson;
pub(super) use discarding::discard_lesson;
pub(super) use program_input::get_granular_program_input;
#[cfg(test)]
pub(super) use program_input::load_source_evidence;
pub(super) use scheduling::move_draft;
pub(super) use snapshot::get_context;
pub(crate) use teacher_curriculum::{
    discard_teacher_authored_curriculum, load_teacher_goals, save_teacher_authored_curriculum,
};
pub(super) use writes::{save_authored_lesson, save_draft, save_granular_lesson, save_note};

type RepositoryResult<T> = Result<T, RepositoryError>;

#[derive(Debug)]
enum RepositoryError {
    Database(rusqlite::Error),
    Validation(String),
    Conflict(String),
    NotFound(String),
}

impl fmt::Display for RepositoryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => {
                let _diagnostic_source = error;
                formatter.write_str(
                    "The lesson could not be saved. Close the app, reopen it, and try again.",
                )
            }
            Self::Validation(message) | Self::Conflict(message) | Self::NotFound(message) => {
                formatter.write_str(message)
            }
        }
    }
}

impl From<rusqlite::Error> for RepositoryError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

impl From<String> for RepositoryError {
    fn from(message: String) -> Self {
        Self::Validation(message)
    }
}

#[derive(Debug)]
struct ResolvedContext {
    session_id: String,
    period_id: String,
    assignment_id: String,
    subject_id: String,
    grade_level_id: String,
    period_name: String,
}

#[derive(Debug)]
/// What a lesson plans, as the scheme sets it out.
///
/// A teacher writes one plan for a week, so that is the scope this resolves
/// first. One subtopic of a week stays available, because sometimes that is the
/// lesson. The row records whichever it is and never both.
struct ResolvedSchedule {
    week_id: String,
    /// Absent when the plan covers the week rather than one subtopic of it.
    entry_id: Option<String>,
    course_id: String,
    curriculum_unit_id: Option<String>,
    curriculum_node_id: Option<String>,
    outcomes: Vec<LessonCurriculumOutcome>,
}

impl ResolvedSchedule {
    /// The week this row stores, which is only the week's own plans. A
    /// subtopic's week is its entry's, and reading it from there is what keeps
    /// the two from disagreeing.
    fn stored_week_id(&self) -> Option<&String> {
        self.entry_id.is_none().then_some(&self.week_id)
    }
}

fn resolve_context(
    connection: &Connection,
    request: &LessonContextRequest,
) -> RepositoryResult<ResolvedContext> {
    let assignment = connection
        .query_row(
            "SELECT subject_id, grade_level_id
         FROM teaching_assignments
         WHERE id = ?1 AND academic_session_id = ?2 AND status = 'active'",
            params![request.teaching_assignment_id, request.academic_session_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(
                "Choose a subject and class from the selected academic session.".to_owned(),
            )
        })?;
    let period = connection
        .query_row(
            "SELECT id, name FROM academic_periods
             WHERE id = ?1 AND academic_session_id = ?2",
            params![request.academic_period_id, request.academic_session_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound(
                "The selected academic period is no longer available.".to_owned(),
            )
        })?;
    Ok(ResolvedContext {
        session_id: request.academic_session_id.clone(),
        period_id: period.0,
        assignment_id: request.teaching_assignment_id.clone(),
        subject_id: assignment.0,
        grade_level_id: assignment.1,
        period_name: period.1,
    })
}

fn resolve_schedule(
    connection: &Connection,
    context: &ResolvedContext,
    week_id: Option<&str>,
    entry_id: Option<&str>,
) -> RepositoryResult<Option<ResolvedSchedule>> {
    match (week_id, entry_id) {
        (None, None) => Ok(None),
        (None, Some(_)) => Err(RepositoryError::Validation(
            "Choose the teaching week that owns this weekly plan.".to_owned(),
        )),
        (Some(week_id), None) => {
            let kind = connection
                .query_row(
                    "SELECT scheme_weeks.kind
                     FROM scheme_weeks
                     JOIN schemes_of_work ON schemes_of_work.id = scheme_weeks.scheme_id
                     WHERE scheme_weeks.id = ?1
                       AND schemes_of_work.academic_period_id = ?2
                       AND schemes_of_work.teaching_assignment_id = ?3
                       AND schemes_of_work.status = 'active'",
                    params![week_id, context.period_id, context.assignment_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .ok_or_else(|| {
                    RepositoryError::NotFound(
                        "That scheme week is not available in this class and term.".to_owned(),
                    )
                })?;
            if kind != "teaching" {
                return Err(RepositoryError::Validation(
                    "A lesson cannot be created from a break or examination week.".to_owned(),
                ));
            }
            // The week's own plan: it covers every subtopic the scheme sets in
            // that week, so it names no single one of them and no curriculum
            // unit of its own — the entries it covers carry those.
            let course_id = connection
                .query_row(
                    "SELECT DISTINCT curriculum_course_id FROM scheme_entries
                     WHERE scheme_week_id = ?1 AND status = 'active'",
                    [week_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
                .ok_or_else(|| {
                    RepositoryError::Validation(
                        "That teaching week has nothing in the scheme to plan yet.".to_owned(),
                    )
                })?;
            Ok(Some(ResolvedSchedule {
                week_id: week_id.to_owned(),
                entry_id: None,
                outcomes: query_scheme_week_outcomes(connection, week_id, &course_id)?,
                course_id,
                curriculum_unit_id: None,
                curriculum_node_id: None,
            }))
        }
        (Some(week_id), Some(entry_id)) => {
            let schedule = connection
                .query_row(
                    "SELECT
                         scheme_entries.curriculum_course_id,
                         curriculum_units.id,
                         curriculum_nodes.id
                     FROM scheme_entries
                     JOIN scheme_weeks ON scheme_weeks.id = scheme_entries.scheme_week_id
                     JOIN schemes_of_work ON schemes_of_work.id = scheme_entries.scheme_id
                     LEFT JOIN curriculum_units
                       ON curriculum_units.id = scheme_entries.curriculum_unit_id
                     LEFT JOIN curriculum_nodes
                       ON curriculum_nodes.id = scheme_entries.curriculum_node_id
                     WHERE scheme_entries.id = ?1
                       AND scheme_entries.scheme_week_id = ?2
                       AND scheme_entries.status = 'active'
                       AND scheme_weeks.kind = 'teaching'
                       AND schemes_of_work.status = 'active'
                       AND schemes_of_work.academic_period_id = ?3
                       AND schemes_of_work.teaching_assignment_id = ?4",
                    params![entry_id, week_id, context.period_id, context.assignment_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )
                .optional()?
                .ok_or_else(|| {
                    RepositoryError::Validation(
                        "That weekly plan does not belong to this class, term and teaching week."
                            .to_owned(),
                    )
                })?;
            Ok(Some(ResolvedSchedule {
                week_id: week_id.to_owned(),
                entry_id: Some(entry_id.to_owned()),
                outcomes: query_scheme_entry_outcomes(connection, entry_id, &schedule.0)?,
                course_id: schedule.0,
                curriculum_unit_id: schedule.1,
                curriculum_node_id: schedule.2,
            }))
        }
    }
}

fn insert_outcomes(
    transaction: &Transaction<'_>,
    lesson_id: &str,
    schedule: Option<&ResolvedSchedule>,
) -> RepositoryResult<()> {
    let Some(schedule) = schedule else {
        return Ok(());
    };
    for outcome in &schedule.outcomes {
        transaction.execute(
            "INSERT INTO lesson_curriculum_outcomes (
                 lesson_id, curriculum_outcome_id, curriculum_course_id
             ) VALUES (?1, ?2, ?3)",
            params![lesson_id, outcome.id, schedule.course_id],
        )?;
    }
    Ok(())
}

fn query_scheme_entry_outcomes(
    connection: &Connection,
    entry_id: &str,
    course_id: &str,
) -> RepositoryResult<Vec<LessonCurriculumOutcome>> {
    let mut statement = connection.prepare(
        "SELECT curriculum_outcomes.id, curriculum_outcomes.statement
         FROM scheme_entry_outcomes
         JOIN curriculum_outcomes
           ON curriculum_outcomes.id = scheme_entry_outcomes.curriculum_outcome_id
         WHERE scheme_entry_outcomes.scheme_entry_id = ?1
           AND scheme_entry_outcomes.curriculum_course_id = ?2
         ORDER BY curriculum_outcomes.sequence",
    )?;
    let rows = statement.query_map(params![entry_id, course_id], |row| {
        Ok(LessonCurriculumOutcome {
            id: row.get(0)?,
            statement: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Every outcome the week commits a teacher to, which is what a plan covering
/// the whole week is written against.
fn query_scheme_week_outcomes(
    connection: &Connection,
    week_id: &str,
    course_id: &str,
) -> RepositoryResult<Vec<LessonCurriculumOutcome>> {
    let mut statement = connection.prepare(
        "SELECT DISTINCT curriculum_outcomes.id, curriculum_outcomes.statement,
                curriculum_outcomes.sequence
         FROM scheme_entries
         JOIN scheme_entry_outcomes
           ON scheme_entry_outcomes.scheme_entry_id = scheme_entries.id
         JOIN curriculum_outcomes
           ON curriculum_outcomes.id = scheme_entry_outcomes.curriculum_outcome_id
         WHERE scheme_entries.scheme_week_id = ?1
           AND scheme_entries.status = 'active'
           AND scheme_entry_outcomes.curriculum_course_id = ?2
         ORDER BY curriculum_outcomes.sequence",
    )?;
    let rows = statement.query_map(params![week_id, course_id], |row| {
        Ok(LessonCurriculumOutcome {
            id: row.get(0)?,
            statement: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// What a derived curriculum was worked out from, so that edited goals are
/// noticed rather than silently taught against.
pub(super) fn goals_fingerprint(learning_goals: &str) -> String {
    format!("{:x}", Sha256::digest(learning_goals.as_bytes()))
}

fn to_json(values: &[String]) -> RepositoryResult<String> {
    serde_json::to_string(values).map_err(|error| {
        RepositoryError::Validation(format!("The lesson could not be encoded: {error}"))
    })
}

fn from_json(value: &str) -> RepositoryResult<Vec<String>> {
    serde_json::from_str(value).map_err(|error| {
        RepositoryError::Validation(format!("The saved lesson is invalid: {error}"))
    })
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}
