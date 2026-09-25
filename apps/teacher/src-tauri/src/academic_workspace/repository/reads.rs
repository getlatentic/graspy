use rusqlite::{params, Connection, OptionalExtension};

use crate::academic_workspace::domain::{
    AcademicCalendarKind, AcademicPeriod, AcademicPeriodKind, AcademicSession,
    AcademicSessionStatus, AcademicWorkspace, AcademicWorkspaceSnapshot, GradeLevel, GradeSystem,
    JurisdictionOption, NextLessonSummary, SchemeWeekSummary, SchoolProfile, SubjectOption,
    TeachingAssignment, TeachingAssignmentStatus, TermStanding,
};
use crate::db::Database;
use crate::lesson_planning::domain::CLASSWORK_COMPLETE_SQL;

use super::{RepositoryError, RepositoryResult};

pub(crate) fn get_snapshot(database: &Database) -> Result<AcademicWorkspaceSnapshot, String> {
    database.with_connection(load_snapshot)
}

pub(super) fn load_snapshot(
    connection: &Connection,
) -> RepositoryResult<AcademicWorkspaceSnapshot> {
    let subjects = query_subjects(connection)?;
    let grade_levels = query_grade_levels(connection)?;
    let jurisdictions = query_jurisdictions(connection)?;
    let grade_systems = query_grade_systems(connection)?;
    let preferences = connection
        .query_row(
            "SELECT
                 workspace_preferences.active_academic_session_id,
                 workspace_preferences.active_academic_period_id,
                 workspace_preferences.active_teaching_assignment_id
             FROM workspace_preferences
             WHERE workspace_preferences.singleton_id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()?;

    let workspace = preferences
        .map(
            |(active_session_id, active_period_id, active_assignment_id)| {
                Ok::<AcademicWorkspace, RepositoryError>(AcademicWorkspace {
                    school: query_school_profile(connection)?,
                    sessions: query_sessions(connection)?,
                    periods: query_periods(connection)?,
                    assignments: query_assignments(connection, &active_period_id)?,
                    active_session_id,
                    active_period_id,
                    active_assignment_id,
                })
            },
        )
        .transpose()?;

    Ok(AcademicWorkspaceSnapshot {
        workspace,
        subjects,
        grade_levels,
        jurisdictions,
        grade_systems,
    })
}

fn query_jurisdictions(connection: &Connection) -> RepositoryResult<Vec<JurisdictionOption>> {
    let mut statement = connection.prepare(
        "SELECT jurisdictions.id,
                jurisdictions.country_code,
                countries.name,
                jurisdictions.name
         FROM jurisdictions
         JOIN countries ON countries.code = jurisdictions.country_code
         ORDER BY jurisdictions.country_code, jurisdictions.name COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(JurisdictionOption {
            id: row.get(0)?,
            country_code: row.get(1)?,
            country: row.get(2)?,
            name: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_grade_systems(connection: &Connection) -> RepositoryResult<Vec<GradeSystem>> {
    let mut statement = connection.prepare(
        "SELECT id, jurisdiction_id, name, version
         FROM grade_systems
         WHERE status = 'active'
         ORDER BY name COLLATE NOCASE, version",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(GradeSystem {
            id: row.get(0)?,
            jurisdiction_id: row.get(1)?,
            name: row.get(2)?,
            version: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_school_profile(connection: &Connection) -> RepositoryResult<SchoolProfile> {
    connection
        .query_row(
            "SELECT jurisdictions.id,
                    jurisdictions.name,
                    jurisdictions.country_code,
                    grade_systems.id,
                    grade_systems.name
             FROM school_profiles
             JOIN jurisdictions ON jurisdictions.id = school_profiles.jurisdiction_id
             JOIN grade_systems ON grade_systems.id = school_profiles.grade_system_id
             WHERE school_profiles.singleton_id = 1",
            [],
            |row| {
                Ok(SchoolProfile {
                    jurisdiction_id: row.get(0)?,
                    jurisdiction: row.get(1)?,
                    country_code: row.get(2)?,
                    grade_system_id: row.get(3)?,
                    grade_system: row.get(4)?,
                })
            },
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound("Set up the school's academic profile first.".to_owned())
        })
}

fn query_periods(connection: &Connection) -> RepositoryResult<Vec<AcademicPeriod>> {
    let mut statement = connection.prepare(
        "SELECT id, academic_session_id, ordinal, name, kind
         FROM academic_periods
         ORDER BY academic_session_id, ordinal",
    )?;
    let rows = statement.query_map([], |row| {
        let kind = AcademicPeriodKind::from_str(&row.get::<_, String>(4)?).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, error.into())
        })?;
        Ok(AcademicPeriod {
            id: row.get(0)?,
            academic_session_id: row.get(1)?,
            ordinal: row.get(2)?,
            name: row.get(3)?,
            kind,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_subjects(connection: &Connection) -> RepositoryResult<Vec<SubjectOption>> {
    let mut statement = connection
        .prepare("SELECT id, name FROM subjects ORDER BY is_catalog DESC, name COLLATE NOCASE")?;
    let rows = statement.query_map([], |row| {
        Ok(SubjectOption {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_grade_levels(connection: &Connection) -> RepositoryResult<Vec<GradeLevel>> {
    let mut statement = connection.prepare(
        "SELECT id, grade_system_id, code, display_name
             FROM grade_levels ORDER BY grade_system_id, sort_order",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(GradeLevel {
            id: row.get(0)?,
            grade_system_id: row.get(1)?,
            code: row.get(2)?,
            display_name: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn query_sessions(connection: &Connection) -> RepositoryResult<Vec<AcademicSession>> {
    let mut statement = connection.prepare(
        "SELECT id, start_year, end_year, calendar_kind, status
         FROM academic_sessions
         ORDER BY start_year DESC",
    )?;
    let rows = statement.query_map([], |row| {
        let start_year = row.get::<_, i64>(1)?;
        let end_year = row.get::<_, i64>(2)?;
        let calendar_kind = match row.get::<_, String>(3)?.as_str() {
            "terms" => AcademicCalendarKind::Terms,
            "semesters" => AcademicCalendarKind::Semesters,
            "quarters" => AcademicCalendarKind::Quarters,
            "custom" => AcademicCalendarKind::Custom,
            _ => {
                return Err(rusqlite::Error::InvalidColumnType(
                    3,
                    "calendar_kind".to_owned(),
                    rusqlite::types::Type::Text,
                ));
            }
        };
        let status = match row.get::<_, String>(4)?.as_str() {
            "open" => AcademicSessionStatus::Open,
            _ => AcademicSessionStatus::Archived,
        };
        Ok(AcademicSession {
            id: row.get(0)?,
            start_year,
            end_year,
            label: format!("{start_year}/{end_year}"),
            calendar_kind,
            status,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Whether a class section says anything the grade level has not.
///
/// A teacher with one class often names the section after the year, so the
/// assignment read "Mathematics · JSS 1 · JSS1" and the same fact appeared
/// twice in every header. Spacing and case are not a difference.
pub(crate) fn names_a_distinct_class(section: &str, grade_level: &str) -> bool {
    let compact = |value: &str| {
        value
            .chars()
            .filter(|character| character.is_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect::<String>()
    };
    !section.trim().is_empty() && compact(section) != compact(grade_level)
}

fn query_assignments(
    connection: &Connection,
    active_period_id: &str,
) -> RepositoryResult<Vec<TeachingAssignment>> {
    let mut statement = connection.prepare(&format!(
        "SELECT
             teaching_assignments.id,
             teaching_assignments.academic_session_id,
             subjects.id,
             subjects.name,
             grade_levels.id,
             grade_levels.display_name,
             teaching_assignments.class_section,
             teaching_assignments.status,
             teaching_assignments.curriculum_course_id,
             curriculum_courses.title,
             curriculum_packages.publisher,
             curriculum_packages.trust,
             (SELECT COUNT(*) FROM lessons
                WHERE lessons.teaching_assignment_id = teaching_assignments.id),
             (SELECT COUNT(*) FROM lessons
                WHERE lessons.teaching_assignment_id = teaching_assignments.id
                  AND lessons.status = 'confirmed'
                  AND {CLASSWORK_COMPLETE_SQL})
         FROM teaching_assignments
         JOIN subjects ON subjects.id = teaching_assignments.subject_id
         JOIN grade_levels ON grade_levels.id = teaching_assignments.grade_level_id
         LEFT JOIN curriculum_courses
           ON curriculum_courses.id = teaching_assignments.curriculum_course_id
         LEFT JOIN curriculum_frameworks
           ON curriculum_frameworks.id = curriculum_courses.framework_id
         LEFT JOIN curriculum_packages
           ON curriculum_packages.id = curriculum_frameworks.package_id
         ORDER BY subjects.name COLLATE NOCASE,
                  grade_levels.sort_order,
                  teaching_assignments.class_section_key",
    ))?;
    let rows = statement.query_map([], |row| {
        let subject = row.get::<_, String>(3)?;
        let grade_level = row.get::<_, String>(5)?;
        let class_section = row.get::<_, Option<String>>(6)?;
        let display_name = match class_section
            .as_deref()
            .filter(|section| names_a_distinct_class(section, &grade_level))
        {
            Some(section) => format!("{subject} · {grade_level} · {section}"),
            None => format!("{subject} · {grade_level}"),
        };
        let status = match row.get::<_, String>(7)?.as_str() {
            "active" => TeachingAssignmentStatus::Active,
            _ => TeachingAssignmentStatus::Archived,
        };
        Ok(TeachingAssignment {
            id: row.get(0)?,
            academic_session_id: row.get(1)?,
            subject_id: row.get(2)?,
            subject,
            grade_level_id: row.get(4)?,
            grade_level,
            class_section,
            display_name,
            curriculum_course_id: row.get(8)?,
            curriculum_title: row.get(9)?,
            curriculum_publisher: row.get(10)?,
            curriculum_trust: row.get(11)?,
            status,
            lessons_total: row.get(12)?,
            lessons_ready: row.get(13)?,
            current_week: None,
            next_lesson: None,
        })
    })?;
    let mut assignments = rows.collect::<Result<Vec<_>, _>>()?;
    for assignment in &mut assignments {
        if let Some(scheme_id) = active_scheme_id(connection, &assignment.id, active_period_id)? {
            assignment.current_week = current_scheme_week(connection, &scheme_id)?;
            if let Some(week) = &assignment.current_week {
                assignment.next_lesson =
                    first_lesson_of_week(connection, &scheme_id, week.ordinal)?;
            }
        }
    }
    Ok(assignments)
}

/// The scheme the class has adopted for the active term, if any.
fn active_scheme_id(
    connection: &Connection,
    assignment_id: &str,
    period_id: &str,
) -> RepositoryResult<Option<String>> {
    connection
        .query_row(
            "SELECT id FROM schemes_of_work
             WHERE teaching_assignment_id = ?1 AND academic_period_id = ?2 AND status = 'active'
             LIMIT 1",
            params![assignment_id, period_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(Into::into)
}

/// Where the teacher is in the scheme: the first week that has not yet ended —
/// the one covering today, or the next one up if the term has not started. When
/// today is past the whole term the scheme reads from the start again, week one,
/// rather than an empty trailing week.
fn current_scheme_week(
    connection: &Connection,
    scheme_id: &str,
) -> RepositoryResult<Option<SchemeWeekSummary>> {
    let read = |row: &rusqlite::Row<'_>| {
        let standing: String = row.get(2)?;
        Ok(SchemeWeekSummary {
            ordinal: row.get(0)?,
            title: row.get(1)?,
            standing: match standing.as_str() {
                "thisWeek" => TermStanding::ThisWeek,
                "notStarted" => TermStanding::NotStarted,
                _ => TermStanding::Finished,
            },
        })
    };
    // The week today falls in, and — when there is none — the honest reason.
    if let Some(week) = connection
        .query_row(
            "SELECT ordinal, title,
                    CASE WHEN starts_on <= date('now') THEN 'thisWeek' ELSE 'notStarted' END
             FROM scheme_weeks
             WHERE scheme_id = ?1 AND ends_on >= date('now')
             ORDER BY ordinal LIMIT 1",
            params![scheme_id],
            read,
        )
        .optional()?
    {
        return Ok(Some(week));
    }
    connection
        .query_row(
            "SELECT ordinal, title, 'finished' FROM scheme_weeks
             WHERE scheme_id = ?1 ORDER BY ordinal DESC LIMIT 1",
            params![scheme_id],
            read,
        )
        .optional()
        .map_err(Into::into)
}

/// The first lesson the teacher meets in that week.
fn first_lesson_of_week(
    connection: &Connection,
    scheme_id: &str,
    week_ordinal: i64,
) -> RepositoryResult<Option<NextLessonSummary>> {
    connection
        .query_row(
            "SELECT entries.topic, entries.subtopic
             FROM scheme_entries entries
             JOIN scheme_weeks weeks ON weeks.id = entries.scheme_week_id
             WHERE weeks.scheme_id = ?1 AND weeks.ordinal = ?2
             ORDER BY entries.sequence LIMIT 1",
            params![scheme_id, week_ordinal],
            |row| {
                Ok(NextLessonSummary {
                    topic: row.get(0)?,
                    subtopic: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
}
