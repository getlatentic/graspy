use std::fmt;

mod reads;
mod writes;

pub(crate) use reads::get_snapshot;
pub(crate) use writes::{
    add_assignment, archive_assignment, create_session, create_workspace, set_active_context,
    update_assignment,
};

#[cfg(test)]
use super::domain::{
    AcademicCalendarKind, CreateAcademicSessionRequest, CreateAcademicWorkspaceRequest,
    SaveTeachingAssignmentRequest, SetActiveAcademicContextRequest,
};
#[cfg(test)]
use crate::db::Database;
pub(crate) use reads::names_a_distinct_class;

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
                    "The academic workspace could not be saved. Close the app, reopen it, and try again.",
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

#[cfg(test)]
mod tests {
    #[test]
    fn a_section_named_after_the_year_is_not_repeated_in_the_class_name() {
        assert!(!super::names_a_distinct_class("JSS1", "JSS 1"));
        assert!(!super::names_a_distinct_class("jss 1", "JSS1"));
        assert!(!super::names_a_distinct_class("   ", "JSS 1"));
        assert!(super::names_a_distinct_class("A", "JSS 1"));
        assert!(super::names_a_distinct_class("JSS 1B", "JSS 1"));
    }

    use super::super::domain::CreateTeachingAssignment;
    use super::*;

    fn setup_request(section: Option<&str>) -> CreateAcademicWorkspaceRequest {
        CreateAcademicWorkspaceRequest {
            start_year: 2026,
            jurisdiction_id: "jurisdiction-ng".to_owned(),
            grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
            calendar_kind: AcademicCalendarKind::Terms,
            period_names: vec![
                "First term".to_owned(),
                "Second term".to_owned(),
                "Third term".to_owned(),
            ],
            active_period_ordinal: 1,
            assignments: vec![CreateTeachingAssignment {
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: section.map(str::to_owned),
            }],
        }
    }

    #[test]
    fn opens_a_workspace_holding_every_subject_a_teacher_named() {
        let database = Database::in_memory();

        let snapshot = create_workspace(
            &database,
            CreateAcademicWorkspaceRequest {
                assignments: vec![
                    CreateTeachingAssignment {
                        subject: "Mathematics".to_owned(),
                        grade_level_id: "grade-jss-2".to_owned(),
                        class_section: None,
                    },
                    CreateTeachingAssignment {
                        subject: "Basic Science".to_owned(),
                        grade_level_id: "grade-jss-1".to_owned(),
                        class_section: None,
                    },
                ],
                ..setup_request(None)
            },
        )
        .expect("a workspace holding several subjects");

        let workspace = snapshot.workspace.expect("configured workspace");
        assert_eq!(workspace.assignments.len(), 2);
        let active = workspace
            .assignments
            .iter()
            .find(|assignment| assignment.id == workspace.active_assignment_id)
            .expect("an active assignment");
        assert_eq!(
            active.subject, "Mathematics",
            "a teacher lands in the subject they named first"
        );
    }

    #[test]
    fn refuses_a_workspace_with_nothing_taught_in_it() {
        let failure = create_workspace(
            &Database::in_memory(),
            CreateAcademicWorkspaceRequest {
                assignments: vec![],
                ..setup_request(None)
            },
        )
        .expect_err("a workspace teaching nothing");

        assert!(failure.contains("at least one subject"), "{failure}");
    }

    #[test]
    fn keeps_a_workspace_whole_when_one_named_subject_is_not_teachable() {
        let database = Database::in_memory();

        create_workspace(
            &database,
            CreateAcademicWorkspaceRequest {
                assignments: vec![
                    CreateTeachingAssignment {
                        subject: "Mathematics".to_owned(),
                        grade_level_id: "grade-jss-2".to_owned(),
                        class_section: None,
                    },
                    CreateTeachingAssignment {
                        subject: "Mathematics".to_owned(),
                        grade_level_id: "grade-us-7".to_owned(),
                        class_section: None,
                    },
                ],
                ..setup_request(None)
            },
        )
        .expect_err("a grade from another jurisdiction");

        // Asserted against the tables rather than the snapshot: preferences are
        // written last, so a snapshot with no workspace would also be the shape
        // of a session and its assignments left stranded behind one.
        let stranded = database
            .with_connection(|connection| {
                Ok::<_, rusqlite::Error>((
                    connection.query_row("SELECT COUNT(*) FROM academic_sessions", [], |row| {
                        row.get::<_, i64>(0)
                    })?,
                    connection.query_row(
                        "SELECT COUNT(*) FROM teaching_assignments",
                        [],
                        |row| row.get::<_, i64>(0),
                    )?,
                ))
            })
            .expect("session and assignment counts");

        assert_eq!(
            stranded,
            (0, 0),
            "a rejected subject leaves no half-built workspace behind"
        );
    }

    #[test]
    fn creates_and_restores_a_complete_academic_workspace() {
        let database = Database::in_memory();

        let created = create_workspace(&database, setup_request(Some("A")))
            .expect("academic workspace creation");
        let restored = get_snapshot(&database).expect("academic workspace restoration");

        assert_eq!(created, restored);
        let workspace = restored.workspace.expect("configured workspace");
        assert_eq!(workspace.sessions[0].label, "2026/2027");
        assert_eq!(workspace.periods.len(), 3);
        assert_eq!(
            workspace
                .periods
                .iter()
                .find(|period| period.id == workspace.active_period_id)
                .expect("active period")
                .name,
            "First term"
        );
        assert_eq!(
            workspace.assignments[0].display_name,
            "Mathematics · JSS 2 · A"
        );
    }

    #[test]
    fn creates_a_us_semester_workspace_with_us_grade_levels() {
        let database = Database::in_memory();
        let snapshot = create_workspace(
            &database,
            CreateAcademicWorkspaceRequest {
                start_year: 2026,
                jurisdiction_id: "jurisdiction-us".to_owned(),
                grade_system_id: "grade-system-us-k12".to_owned(),
                calendar_kind: AcademicCalendarKind::Semesters,
                period_names: vec!["Fall semester".to_owned(), "Spring semester".to_owned()],
                active_period_ordinal: 1,
                assignments: vec![CreateTeachingAssignment {
                    subject: "Mathematics".to_owned(),
                    grade_level_id: "grade-us-7".to_owned(),
                    class_section: Some("A".to_owned()),
                }],
            },
        )
        .expect("US workspace");

        let workspace = snapshot.workspace.expect("configured workspace");
        assert_eq!(workspace.school.country_code, "US");
        assert_eq!(workspace.school.grade_system_id, "grade-system-us-k12");
        assert_eq!(workspace.periods.len(), 2);
        assert_eq!(workspace.assignments[0].grade_level, "Grade 7");
    }

    #[test]
    fn rejects_a_grade_system_and_grade_from_another_jurisdiction() {
        let database = Database::in_memory();
        let wrong_system = create_workspace(
            &database,
            CreateAcademicWorkspaceRequest {
                jurisdiction_id: "jurisdiction-us".to_owned(),
                grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
                ..setup_request(None)
            },
        )
        .expect_err("cross-jurisdiction grade system");
        assert!(wrong_system.contains("selected jurisdiction"));

        let wrong_grade = create_workspace(
            &Database::in_memory(),
            CreateAcademicWorkspaceRequest {
                assignments: vec![CreateTeachingAssignment {
                    subject: "Mathematics".to_owned(),
                    grade_level_id: "grade-us-7".to_owned(),
                    class_section: None,
                }],
                ..setup_request(None)
            },
        )
        .expect_err("cross-jurisdiction grade level");
        assert!(wrong_grade.contains("school's grade system"));
    }

    #[test]
    fn permits_distinct_sections_and_rejects_normalized_duplicates() {
        let database = Database::in_memory();
        let created = create_workspace(&database, setup_request(Some("A")))
            .expect("academic workspace creation");
        let session_id = created.workspace.expect("workspace").active_session_id;

        add_assignment(
            &database,
            SaveTeachingAssignmentRequest {
                academic_session_id: session_id.clone(),
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some("B".to_owned()),
            },
        )
        .expect("second section");
        let duplicate = add_assignment(
            &database,
            SaveTeachingAssignmentRequest {
                academic_session_id: session_id,
                subject: " mathematics ".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some(" a ".to_owned()),
            },
        )
        .expect_err("duplicate assignment must fail");

        assert!(duplicate.contains("already exists"));
    }

    #[test]
    fn allows_the_same_assignment_in_the_next_academic_session() {
        let database = Database::in_memory();
        create_workspace(&database, setup_request(None)).expect("initial session");

        let snapshot = create_session(
            &database,
            CreateAcademicSessionRequest {
                start_year: 2027,
                calendar_kind: AcademicCalendarKind::Semesters,
                period_names: vec!["Fall semester".to_owned(), "Spring semester".to_owned()],
                active_period_ordinal: 2,
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: None,
            },
        )
        .expect("next session");

        let workspace = snapshot.workspace.expect("workspace");
        assert_eq!(workspace.sessions.len(), 2);
        let active_period = workspace
            .periods
            .iter()
            .find(|period| period.id == workspace.active_period_id)
            .expect("active period");
        assert_eq!(active_period.name, "Spring semester");
    }

    #[test]
    fn rejects_an_assignment_from_another_session_as_active_context() {
        let database = Database::in_memory();
        let first = create_workspace(&database, setup_request(Some("A")))
            .expect("first session")
            .workspace
            .expect("workspace");
        let first_assignment_id = first.active_assignment_id;
        let second = create_session(
            &database,
            CreateAcademicSessionRequest {
                start_year: 2027,
                calendar_kind: AcademicCalendarKind::Quarters,
                period_names: vec![
                    "First quarter".to_owned(),
                    "Second quarter".to_owned(),
                    "Third quarter".to_owned(),
                    "Fourth quarter".to_owned(),
                ],
                active_period_ordinal: 1,
                subject: "English Language".to_owned(),
                grade_level_id: "grade-jss-1".to_owned(),
                class_section: None,
            },
        )
        .expect("second session")
        .workspace
        .expect("workspace");

        let error = set_active_context(
            &database,
            SetActiveAcademicContextRequest {
                academic_session_id: second.active_session_id,
                academic_period_id: second.active_period_id,
                assignment_id: first_assignment_id,
            },
        )
        .expect_err("cross-session context must fail");

        assert!(error.contains("selected academic session"));
    }

    #[test]
    fn protects_the_only_active_assignment_from_archival() {
        let database = Database::in_memory();
        let workspace = create_workspace(&database, setup_request(None))
            .expect("workspace")
            .workspace
            .expect("configured workspace");

        let error = archive_assignment(&database, &workspace.active_assignment_id)
            .expect_err("last assignment must remain active");

        assert!(error.contains("Add another class"));
    }
}
