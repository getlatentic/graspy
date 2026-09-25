use std::{collections::HashSet, fmt};

use chrono::{Duration, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use uuid::Uuid;

use super::domain::{
    normalize_key, SchemeContextRequest, ValidatedSchemeEntry, ValidatedSchemeSetup,
    ValidatedTermDates,
};
use crate::academic_workspace::domain::AcademicPeriodKind;

mod reads;
mod scheme_from_template;
mod template_packages;
#[cfg(test)]
mod test_support;
mod writes;

pub(super) use reads::get_context;
pub(super) use scheme_from_template::create_scheme_from_template;
pub(crate) use template_packages::install_bundled_packages;
pub(super) use template_packages::install_template_package;
pub(super) use writes::{archive_entry, move_entry};
pub(crate) use writes::{create_scheme, save_entry, save_week};

#[cfg(test)]
use super::domain::{
    CreateSchemeFromTemplateRequest, CreateSchemeOfWorkRequest,
    InstallSchemeTemplatePackageRequest, SaveSchemeEntryRequest, SaveSchemeWeekRequest,
    SchemeTemplateOrigin, SchemeTemplateTrust, SchemeWeekKind,
};
#[cfg(test)]
use crate::db::Database;
#[cfg(test)]
use template_packages::{install_bundled_package_contents, BUNDLED_LAGOS_JSS1_MATHEMATICS_PATHS};

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
                #[cfg(test)]
                {
                    write!(formatter, "scheme repository database error: {error}")
                }
                #[cfg(not(test))]
                {
                    let _diagnostic_source = error;
                    formatter.write_str(
                        "The scheme of work could not be saved. Close the app, reopen it, and try again.",
                    )
                }
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
    session_start_year: i32,
    session_end_year: i32,
    period_id: String,
    assignment_id: String,
    subject_id: String,
    subject: String,
    grade_level_id: String,
    grade_level_code: String,
    grade_level: String,
    curriculum_course_id: Option<String>,
    period_ordinal: i64,
    period_name: String,
    period_kind: AcademicPeriodKind,
}

fn resolve_context(
    connection: &Connection,
    request: &SchemeContextRequest,
) -> RepositoryResult<ResolvedContext> {
    let assignment = connection
        .query_row(
            "SELECT
                 teaching_assignments.subject_id,
                 subjects.name,
                 teaching_assignments.grade_level_id,
                 grade_levels.code,
                 grade_levels.display_name,
                 academic_sessions.start_year,
                 academic_sessions.end_year,
                 teaching_assignments.curriculum_course_id
             FROM teaching_assignments
             JOIN subjects ON subjects.id = teaching_assignments.subject_id
             JOIN grade_levels ON grade_levels.id = teaching_assignments.grade_level_id
             JOIN academic_sessions
               ON academic_sessions.id = teaching_assignments.academic_session_id
             WHERE teaching_assignments.id = ?1
               AND teaching_assignments.academic_session_id = ?2
               AND teaching_assignments.status = 'active'",
            params![request.teaching_assignment_id, request.academic_session_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i32>(5)?,
                    row.get::<_, i32>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::Validation(
                "Choose a subject and class from the selected academic session.".to_owned(),
            )
        })?;
    let period = connection
        .query_row(
            "SELECT id, ordinal, name, kind FROM academic_periods
             WHERE id = ?1 AND academic_session_id = ?2",
            params![request.academic_period_id, request.academic_session_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound(
                "The selected academic period is no longer available.".to_owned(),
            )
        })?;
    Ok(ResolvedContext {
        session_id: request.academic_session_id.clone(),
        session_start_year: assignment.5,
        session_end_year: assignment.6,
        period_id: period.0,
        assignment_id: request.teaching_assignment_id.clone(),
        subject_id: assignment.0,
        subject: assignment.1,
        grade_level_id: assignment.2,
        grade_level_code: assignment.3,
        grade_level: assignment.4,
        curriculum_course_id: assignment.7,
        period_ordinal: period.1,
        period_name: period.2,
        period_kind: AcademicPeriodKind::from_str(&period.3)?,
    })
}

fn ensure_dates_within_session(
    dates: ValidatedTermDates,
    context: &ResolvedContext,
) -> RepositoryResult<()> {
    let session_starts_on = NaiveDate::from_ymd_opt(context.session_start_year, 9, 1)
        .expect("validated academic session start year");
    let session_ends_on = NaiveDate::from_ymd_opt(context.session_end_year, 8, 31)
        .expect("validated academic session end year");
    if dates.starts_on < session_starts_on || dates.ends_on > session_ends_on {
        return Err(RepositoryError::Validation(format!(
            "Term dates must stay inside the {}/{} academic session.",
            context.session_start_year, context.session_end_year
        )));
    }
    Ok(())
}

fn ensure_no_scheme(connection: &Connection, context: &ResolvedContext) -> RepositoryResult<()> {
    let existing = connection.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM schemes_of_work
             WHERE academic_period_id = ?1 AND teaching_assignment_id = ?2
         )",
        params![context.period_id, context.assignment_id],
        |row| row.get::<_, bool>(0),
    )?;
    if existing {
        return Err(RepositoryError::Conflict(
            "This class already has a scheme of work for the selected term.".to_owned(),
        ));
    }
    Ok(())
}

fn resolve_framework(
    transaction: &Transaction<'_>,
    setup: &ValidatedSchemeSetup,
) -> RepositoryResult<String> {
    if let Some(id) = transaction
        .query_row(
            "SELECT id FROM curriculum_frameworks
             WHERE normalized_name = ?1 AND normalized_authority = ?2 AND version = ?3",
            params![
                setup.normalized_framework_name,
                setup.normalized_authority,
                setup.version
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = new_id("curriculum");
    transaction.execute(
        "INSERT INTO curriculum_frameworks (
             id, name, normalized_name, authority, normalized_authority,
             jurisdiction, version, source_uri
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            setup.framework_name,
            setup.normalized_framework_name,
            setup.authority,
            setup.normalized_authority,
            setup.jurisdiction,
            setup.version,
            setup.source_uri,
        ],
    )?;
    Ok(id)
}

fn resolve_course(
    transaction: &Transaction<'_>,
    context: &ResolvedContext,
    framework_id: &str,
) -> RepositoryResult<String> {
    if let Some(id) = transaction
        .query_row(
            "SELECT id FROM curriculum_courses
             WHERE framework_id = ?1 AND subject_id = ?2 AND grade_level_id = ?3",
            params![framework_id, context.subject_id, context.grade_level_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = new_id("course");
    let title = format!("{} · {}", context.subject, context.grade_level);
    transaction.execute(
        "INSERT INTO curriculum_courses (
             id, framework_id, subject_id, grade_level_id, title
         ) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            id,
            framework_id,
            context.subject_id,
            context.grade_level_id,
            title
        ],
    )?;
    Ok(id)
}

fn ensure_term_calendar(
    transaction: &Transaction<'_>,
    period_id: &str,
    dates: ValidatedTermDates,
) -> RepositoryResult<()> {
    let existing = transaction
        .query_row(
            "SELECT starts_on, ends_on FROM term_calendars WHERE academic_period_id = ?1",
            params![period_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    if let Some((starts_on, ends_on)) = existing {
        if starts_on != dates.starts_on.to_string() || ends_on != dates.ends_on.to_string() {
            return Err(RepositoryError::Conflict(
                "This term already uses different calendar dates. Use the confirmed term calendar."
                    .to_owned(),
            ));
        }
        return Ok(());
    }
    transaction.execute(
        "INSERT INTO term_calendars (id, academic_period_id, starts_on, ends_on)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            new_id("calendar"),
            period_id,
            dates.starts_on.to_string(),
            dates.ends_on.to_string()
        ],
    )?;
    Ok(())
}

/// Cut the term into its weeks, and say which of them are not taught.
///
/// A week the mid-term break covers is a break week, so nothing is planned into
/// it and a teacher is never handed a plan sitting in a week their school is
/// closed. Only the teaching weeks are returned, because a template's topics
/// are laid into the weeks that teach them.
fn insert_derived_weeks(
    transaction: &Transaction<'_>,
    scheme_id: &str,
    dates: ValidatedTermDates,
) -> RepositoryResult<Vec<String>> {
    let mut ordinal = 1_i64;
    let mut week_start = dates.starts_on;
    let mut teaching_week_ids = Vec::new();
    while week_start <= dates.ends_on {
        let week_end = std::cmp::min(week_start + Duration::days(6), dates.ends_on);
        let week_id = new_id("week");
        let on_break = dates.is_break_week(week_start, week_end);
        transaction.execute(
            "INSERT INTO scheme_weeks (
                 id, scheme_id, ordinal, starts_on, ends_on, kind, title
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                week_id,
                scheme_id,
                ordinal,
                week_start.to_string(),
                week_end.to_string(),
                if on_break { "break" } else { "teaching" },
                if on_break {
                    Some("Mid-term break")
                } else {
                    None
                },
            ],
        )?;
        if !on_break {
            teaching_week_ids.push(week_id);
        }
        ordinal += 1;
        week_start = week_end + Duration::days(1);
    }
    Ok(teaching_week_ids)
}

fn resolve_unit(
    transaction: &Transaction<'_>,
    course_id: &str,
    input: &ValidatedSchemeEntry,
) -> RepositoryResult<String> {
    if let Some(id) = transaction
        .query_row(
            "SELECT id FROM curriculum_units
             WHERE curriculum_course_id = ?1 AND normalized_title = ?2",
            params![course_id, input.normalized_curriculum_unit],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let sequence = transaction.query_row(
        "SELECT COALESCE(MAX(sequence), 0) + 1
         FROM curriculum_units WHERE curriculum_course_id = ?1",
        params![course_id],
        |row| row.get::<_, i64>(0),
    )?;
    let id = new_id("unit");
    transaction.execute(
        "INSERT INTO curriculum_units (
             id, curriculum_course_id, title, normalized_title, sequence
         ) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            id,
            course_id,
            input.curriculum_unit,
            input.normalized_curriculum_unit,
            sequence
        ],
    )?;
    Ok(id)
}

fn resolve_outcomes(
    transaction: &Transaction<'_>,
    course_id: &str,
    unit_id: &str,
    input: &ValidatedSchemeEntry,
) -> RepositoryResult<Vec<String>> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    for statement in &input.curriculum_outcomes {
        let normalized = normalize_key(statement);
        if !seen.insert(normalized.clone()) {
            continue;
        }
        if let Some(id) = transaction
            .query_row(
                "SELECT id FROM curriculum_outcomes
                 WHERE curriculum_unit_id = ?1 AND normalized_statement = ?2",
                params![unit_id, normalized],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        {
            ids.push(id);
            continue;
        }
        let sequence = transaction.query_row(
            "SELECT COALESCE(MAX(sequence), 0) + 1
             FROM curriculum_outcomes WHERE curriculum_unit_id = ?1",
            params![unit_id],
            |row| row.get::<_, i64>(0),
        )?;
        let id = new_id("outcome");
        transaction.execute(
            "INSERT INTO curriculum_outcomes (
                 id, curriculum_course_id, curriculum_unit_id,
                 statement, normalized_statement, sequence
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, course_id, unit_id, statement, normalized, sequence],
        )?;
        ids.push(id);
    }
    Ok(ids)
}

fn to_json(values: &[String]) -> RepositoryResult<String> {
    serde_json::to_string(values).map_err(|error| {
        RepositoryError::Validation(format!("The weekly plan could not be encoded: {error}"))
    })
}

fn from_json(value: &str) -> RepositoryResult<Vec<String>> {
    serde_json::from_str(value).map_err(|error| {
        RepositoryError::Validation(format!("The saved weekly plan is invalid: {error}"))
    })
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}
