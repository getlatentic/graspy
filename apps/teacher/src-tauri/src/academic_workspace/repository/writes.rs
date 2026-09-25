use rusqlite::{params, ErrorCode, OptionalExtension, Transaction};
use uuid::Uuid;

use crate::academic_workspace::domain::{
    validate_start_year, AcademicWorkspaceSnapshot, CreateAcademicSessionRequest,
    CreateAcademicWorkspaceRequest, SaveTeachingAssignmentRequest, SetActiveAcademicContextRequest,
    UpdateTeachingAssignmentRequest, ValidatedAcademicCalendar, ValidatedAssignmentInput,
};
use crate::db::Database;

use super::reads::load_snapshot;
use super::{RepositoryError, RepositoryResult};

pub(crate) fn create_workspace(
    database: &Database,
    request: CreateAcademicWorkspaceRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    let inputs = request
        .assignments
        .iter()
        .map(|assignment| {
            ValidatedAssignmentInput::new(
                &assignment.subject,
                &assignment.grade_level_id,
                assignment.class_section.as_deref(),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    if inputs.is_empty() {
        return Err("Choose at least one subject you teach.".to_owned());
    }
    let end_year = validate_start_year(request.start_year)?;
    let calendar = ValidatedAcademicCalendar::new(
        request.calendar_kind,
        &request.period_names,
        request.active_period_ordinal,
    )?;

    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let preference_count =
            transaction.query_row("SELECT COUNT(*) FROM workspace_preferences", [], |row| {
                row.get::<_, i64>(0)
            })?;
        if preference_count > 0 {
            return Err(RepositoryError::Conflict(
                "The academic workspace is already set up.".to_owned(),
            ));
        }

        validate_school_selection(
            &transaction,
            &request.jurisdiction_id,
            &request.grade_system_id,
        )?;
        transaction.execute(
            "UPDATE school_profiles
             SET jurisdiction_id = ?1, grade_system_id = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE singleton_id = 1",
            params![request.jurisdiction_id, request.grade_system_id],
        )?;

        insert_session_with_assignments(
            &transaction,
            request.start_year,
            end_year,
            &calendar,
            &request.grade_system_id,
            &inputs,
        )?;
        transaction.commit()?;
        load_snapshot(connection)
    })
}

pub(crate) fn create_session(
    database: &Database,
    request: CreateAcademicSessionRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    let input = ValidatedAssignmentInput::new(
        &request.subject,
        &request.grade_level_id,
        request.class_section.as_deref(),
    )?;
    let end_year = validate_start_year(request.start_year)?;
    let calendar = ValidatedAcademicCalendar::new(
        request.calendar_kind,
        &request.period_names,
        request.active_period_ordinal,
    )?;

    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let grade_system_id = school_grade_system_id(&transaction)?;
        insert_session_with_assignments(
            &transaction,
            request.start_year,
            end_year,
            &calendar,
            &grade_system_id,
            std::slice::from_ref(&input),
        )?;
        transaction.commit()?;
        load_snapshot(connection)
    })
}

pub(crate) fn add_assignment(
    database: &Database,
    request: SaveTeachingAssignmentRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    let input = ValidatedAssignmentInput::new(
        &request.subject,
        &request.grade_level_id,
        request.class_section.as_deref(),
    )?;

    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        ensure_open_session(&transaction, &request.academic_session_id)?;
        let subject_id = resolve_subject(&transaction, &input)?;
        let grade_system_id = school_grade_system_id(&transaction)?;
        ensure_grade_level(&transaction, &input.grade_level_id, &grade_system_id)?;
        insert_assignment(
            &transaction,
            &request.academic_session_id,
            &subject_id,
            &input,
        )?;
        transaction.commit()?;
        load_snapshot(connection)
    })
}

pub(crate) fn update_assignment(
    database: &Database,
    request: UpdateTeachingAssignmentRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    let input = ValidatedAssignmentInput::new(
        &request.subject,
        &request.grade_level_id,
        request.class_section.as_deref(),
    )?;

    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let session_id = transaction
            .query_row(
                "SELECT academic_session_id
                 FROM teaching_assignments
                 WHERE id = ?1 AND status = 'active'",
                params![request.assignment_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::NotFound("That class is no longer available.".to_owned())
            })?;
        let subject_id = resolve_subject(&transaction, &input)?;
        let grade_system_id = school_grade_system_id(&transaction)?;
        ensure_grade_level(&transaction, &input.grade_level_id, &grade_system_id)?;

        transaction
            .execute(
                "UPDATE teaching_assignments
                 SET subject_id = ?1,
                     grade_level_id = ?2,
                     class_section = ?3,
                     class_section_key = ?4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?5 AND academic_session_id = ?6",
                params![
                    subject_id,
                    input.grade_level_id,
                    input.class_section,
                    input.class_section_key,
                    request.assignment_id,
                    session_id,
                ],
            )
            .map_err(assignment_constraint)?;
        transaction.commit()?;
        load_snapshot(connection)
    })
}

pub(crate) fn archive_assignment(
    database: &Database,
    assignment_id: &str,
) -> Result<AcademicWorkspaceSnapshot, String> {
    let assignment_id = assignment_id.to_owned();
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let session_id = transaction
            .query_row(
                "SELECT academic_session_id
                 FROM teaching_assignments
                 WHERE id = ?1 AND status = 'active'",
                params![assignment_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::NotFound("That class is no longer available.".to_owned())
            })?;
        let active_count = transaction.query_row(
            "SELECT COUNT(*)
             FROM teaching_assignments
             WHERE academic_session_id = ?1 AND status = 'active'",
            params![session_id],
            |row| row.get::<_, i64>(0),
        )?;
        if active_count <= 1 {
            return Err(RepositoryError::Validation(
                "Add another class before archiving the only active class in this session."
                    .to_owned(),
            ));
        }

        transaction.execute(
            "UPDATE teaching_assignments
             SET status = 'archived', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![assignment_id],
        )?;

        let is_active = transaction.query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM workspace_preferences
                 WHERE active_teaching_assignment_id = ?1
             )",
            params![assignment_id],
            |row| row.get::<_, bool>(0),
        )?;
        if is_active {
            let next_assignment = transaction.query_row(
                "SELECT id
                 FROM teaching_assignments
                 WHERE academic_session_id = ?1 AND status = 'active'
                 ORDER BY created_at, id
                 LIMIT 1",
                params![session_id],
                |row| row.get::<_, String>(0),
            )?;
            transaction.execute(
                "UPDATE workspace_preferences
                 SET active_teaching_assignment_id = ?1, updated_at = CURRENT_TIMESTAMP
                 WHERE singleton_id = 1",
                params![next_assignment],
            )?;
        }

        transaction.commit()?;
        load_snapshot(connection)
    })
}

pub(crate) fn set_active_context(
    database: &Database,
    request: SetActiveAcademicContextRequest,
) -> Result<AcademicWorkspaceSnapshot, String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        ensure_open_session(&transaction, &request.academic_session_id)?;
        let assignment_exists = transaction.query_row(
            "SELECT EXISTS(
                 SELECT 1
                 FROM teaching_assignments
                 WHERE id = ?1
                   AND academic_session_id = ?2
                   AND status = 'active'
             )",
            params![request.assignment_id, request.academic_session_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !assignment_exists {
            return Err(RepositoryError::Validation(
                "Choose a class from the selected academic session.".to_owned(),
            ));
        }
        let period_exists = transaction.query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM academic_periods
                 WHERE id = ?1 AND academic_session_id = ?2
             )",
            params![request.academic_period_id, request.academic_session_id],
            |row| row.get::<_, bool>(0),
        )?;
        if !period_exists {
            return Err(RepositoryError::NotFound(
                "The selected academic period is unavailable for this session.".to_owned(),
            ));
        }

        transaction.execute(
            "UPDATE workspace_preferences
             SET active_academic_session_id = ?1,
                 active_academic_period_id = ?2,
                 active_teaching_assignment_id = ?3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE singleton_id = 1",
            params![
                request.academic_session_id,
                request.academic_period_id,
                request.assignment_id,
            ],
        )?;
        transaction.commit()?;
        load_snapshot(connection)
    })
}

/// Open a session and everything a teacher said they teach, in one transaction.
///
/// A teacher names several subjects in one step, so a half-created workspace —
/// a session holding some of what they said — is worse than none at all. The
/// first assignment becomes the active one, because it is the one they named
/// first.
fn insert_session_with_assignments(
    transaction: &Transaction<'_>,
    start_year: i64,
    end_year: i64,
    calendar: &ValidatedAcademicCalendar,
    grade_system_id: &str,
    inputs: &[ValidatedAssignmentInput],
) -> RepositoryResult<()> {
    let session_id = new_id("session");
    transaction
        .execute(
            "INSERT INTO academic_sessions (id, start_year, end_year, calendar_kind)
             VALUES (?1, ?2, ?3, ?4)",
            params![session_id, start_year, end_year, calendar.kind.as_str()],
        )
        .map_err(|error| session_constraint(error, start_year, end_year))?;

    let mut active_period_id = None;
    for period in &calendar.periods {
        let period_id = new_id("period");
        transaction.execute(
            "INSERT INTO academic_periods (
                 id, academic_session_id, ordinal, name, normalized_name, kind
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                period_id,
                session_id,
                period.ordinal,
                period.name,
                period.normalized_name,
                period.kind.as_str(),
            ],
        )?;
        if period.ordinal == calendar.active_period_ordinal {
            active_period_id = Some(period_id);
        }
    }

    let mut first_assignment_id = None;
    for input in inputs {
        let subject_id = resolve_subject(transaction, input)?;
        ensure_grade_level(transaction, &input.grade_level_id, grade_system_id)?;
        let assignment_id = insert_assignment(transaction, &session_id, &subject_id, input)?;
        first_assignment_id.get_or_insert(assignment_id);
    }
    let assignment_id = first_assignment_id.ok_or_else(|| {
        RepositoryError::Validation("Choose at least one subject you teach.".to_owned())
    })?;
    let active_period_id = active_period_id.ok_or_else(|| {
        RepositoryError::Validation("Choose an academic period from this calendar.".to_owned())
    })?;
    transaction.execute(
        "INSERT INTO workspace_preferences (
             singleton_id,
             active_academic_session_id,
             active_academic_period_id,
             active_teaching_assignment_id
         ) VALUES (1, ?1, ?2, ?3)
         ON CONFLICT(singleton_id) DO UPDATE SET
             active_academic_session_id = excluded.active_academic_session_id,
             active_academic_period_id = excluded.active_academic_period_id,
             active_teaching_assignment_id = excluded.active_teaching_assignment_id,
             updated_at = CURRENT_TIMESTAMP",
        params![session_id, active_period_id, assignment_id],
    )?;
    Ok(())
}

fn resolve_subject(
    transaction: &Transaction<'_>,
    input: &ValidatedAssignmentInput,
) -> RepositoryResult<String> {
    if let Some(subject_id) = transaction
        .query_row(
            "SELECT id FROM subjects WHERE normalized_name = ?1",
            params![input.normalized_subject],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(subject_id);
    }

    let subject_id = new_id("subject");
    transaction.execute(
        "INSERT INTO subjects (id, name, normalized_name)
         VALUES (?1, ?2, ?3)",
        params![subject_id, input.subject, input.normalized_subject],
    )?;
    Ok(subject_id)
}

fn validate_school_selection(
    transaction: &Transaction<'_>,
    jurisdiction_id: &str,
    grade_system_id: &str,
) -> RepositoryResult<()> {
    let valid = transaction.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM grade_systems
             WHERE id = ?1 AND jurisdiction_id = ?2 AND status = 'active'
         )",
        params![grade_system_id, jurisdiction_id],
        |row| row.get::<_, bool>(0),
    )?;
    if !valid {
        return Err(RepositoryError::Validation(
            "Choose a grade system published for the selected jurisdiction.".to_owned(),
        ));
    }
    Ok(())
}

fn school_grade_system_id(transaction: &Transaction<'_>) -> RepositoryResult<String> {
    transaction
        .query_row(
            "SELECT grade_system_id FROM school_profiles WHERE singleton_id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound("Set up the school's academic profile first.".to_owned())
        })
}

fn ensure_grade_level(
    transaction: &Transaction<'_>,
    grade_level_id: &str,
    grade_system_id: &str,
) -> RepositoryResult<()> {
    let exists = transaction.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM grade_levels WHERE id = ?1 AND grade_system_id = ?2
         )",
        params![grade_level_id, grade_system_id],
        |row| row.get::<_, bool>(0),
    )?;
    if !exists {
        return Err(RepositoryError::Validation(
            "Choose a grade level from the school's grade system.".to_owned(),
        ));
    }
    Ok(())
}

fn ensure_open_session(transaction: &Transaction<'_>, session_id: &str) -> RepositoryResult<()> {
    let exists = transaction.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM academic_sessions WHERE id = ?1 AND status = 'open'
         )",
        params![session_id],
        |row| row.get::<_, bool>(0),
    )?;
    if !exists {
        return Err(RepositoryError::NotFound(
            "That academic session is no longer available.".to_owned(),
        ));
    }
    Ok(())
}

fn insert_assignment(
    transaction: &Transaction<'_>,
    session_id: &str,
    subject_id: &str,
    input: &ValidatedAssignmentInput,
) -> RepositoryResult<String> {
    let assignment_id = new_id("class");
    transaction
        .execute(
            "INSERT INTO teaching_assignments (
                 id,
                 academic_session_id,
                 subject_id,
                 grade_level_id,
                 class_section,
                 class_section_key
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                assignment_id,
                session_id,
                subject_id,
                input.grade_level_id,
                input.class_section,
                input.class_section_key,
            ],
        )
        .map_err(assignment_constraint)?;
    Ok(assignment_id)
}

fn assignment_constraint(error: rusqlite::Error) -> RepositoryError {
    if is_constraint(&error) {
        RepositoryError::Conflict(
            "That subject, grade and class already exists in this academic session.".to_owned(),
        )
    } else {
        RepositoryError::Database(error)
    }
}

fn session_constraint(error: rusqlite::Error, start_year: i64, end_year: i64) -> RepositoryError {
    if is_constraint(&error) {
        RepositoryError::Conflict(format!(
            "The {start_year}/{end_year} academic session already exists."
        ))
    } else {
        RepositoryError::Database(error)
    }
}

fn is_constraint(error: &rusqlite::Error) -> bool {
    error.sqlite_error_code() == Some(ErrorCode::ConstraintViolation)
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}
