use rusqlite::{params, Connection, ErrorCode, OptionalExtension};

use crate::db::Database;
use crate::scheme_of_work::domain::{
    normalize_key, validate_week_title, ArchiveSchemeEntryRequest, CreateSchemeOfWorkRequest,
    MoveSchemeEntryRequest, SaveSchemeEntryRequest, SaveSchemeWeekRequest, SchemeContextSnapshot,
    ValidatedSchemeEntry, ValidatedSchemeSetup, ValidatedTermDates,
};

use super::reads::load_snapshot;
use super::{
    ensure_dates_within_session, ensure_no_scheme, ensure_term_calendar, insert_derived_weeks,
    new_id, resolve_context, resolve_course, resolve_framework, resolve_outcomes, resolve_unit,
    to_json, RepositoryError, RepositoryResult, ResolvedContext,
};

pub(crate) fn create_scheme(
    database: &Database,
    request: CreateSchemeOfWorkRequest,
) -> Result<SchemeContextSnapshot, String> {
    let dates = ValidatedTermDates::new(
        &request.term_starts_on,
        &request.term_ends_on,
        request.mid_term_break_starts_on.as_deref(),
        request.mid_term_break_ends_on.as_deref(),
    )?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        ensure_dates_within_session(dates, &context)?;
        ensure_no_scheme(&transaction, &context)?;

        let course_id = match &context.curriculum_course_id {
            Some(course_id) => course_id.clone(),
            None => {
                let setup = ValidatedSchemeSetup::new(&request)?;
                let framework_id = resolve_framework(&transaction, &setup)?;
                resolve_course(&transaction, &context, &framework_id)?
            }
        };
        ensure_term_calendar(&transaction, &context.period_id, dates)?;
        let scheme_id = new_id("scheme");
        let title = format!(
            "{} · {} · {}",
            context.subject, context.grade_level, context.period_name
        );
        transaction.execute(
            "INSERT INTO schemes_of_work (
                 id, academic_session_id, academic_period_id,
                 teaching_assignment_id, subject_id, grade_level_id,
                 curriculum_course_id, title
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                scheme_id,
                context.session_id,
                context.period_id,
                context.assignment_id,
                context.subject_id,
                context.grade_level_id,
                course_id,
                title,
            ],
        )?;
        insert_derived_weeks(&transaction, &scheme_id, dates)?;
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

pub(crate) fn save_week(
    database: &Database,
    request: SaveSchemeWeekRequest,
) -> Result<SchemeContextSnapshot, String> {
    let title = validate_week_title(request.kind, request.title.as_deref())?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let (scheme_id, _) = resolve_scheme_identity(&transaction, &context)?;
        let changed = transaction
            .execute(
                "UPDATE scheme_weeks
                 SET kind = ?1, title = ?2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?3 AND scheme_id = ?4",
                params![request.kind.as_str(), title, request.week_id, scheme_id],
            )
            .map_err(map_week_constraint)?;
        if changed == 0 {
            return Err(RepositoryError::NotFound(
                "That scheme week is no longer available.".to_owned(),
            ));
        }
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

pub(crate) fn save_entry(
    database: &Database,
    request: SaveSchemeEntryRequest,
) -> Result<SchemeContextSnapshot, String> {
    let input = ValidatedSchemeEntry::new(&request)?;
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let (scheme_id, course_id) = resolve_scheme_identity(&transaction, &context)?;
        ensure_teaching_week(&transaction, &request.week_id, &scheme_id)?;
        let objectives = to_json(&input.objectives)?;
        let assessment = to_json(&input.assessment)?;
        let instructional_materials = to_json(&input.instructional_materials)?;

        let (entry_id, outcome_ids) = match request.entry_id.as_deref() {
            Some(entry_id) => {
                let stable_node_id = transaction
                    .query_row(
                        "SELECT curriculum_node_id FROM scheme_entries
                     WHERE id = ?1 AND scheme_id = ?2 AND status = 'active'",
                        params![entry_id, scheme_id],
                        |row| row.get::<_, Option<String>>(0),
                    )
                    .optional()?
                    .ok_or_else(|| {
                        RepositoryError::NotFound(
                            "That weekly plan is no longer available.".to_owned(),
                        )
                    })?;
                if let Some(node_id) = stable_node_id {
                    validate_stable_alignment_input(&transaction, &course_id, &node_id, &input)?;
                    transaction.execute(
                        "UPDATE scheme_entries
                         SET scheme_week_id = ?1,
                             topic = ?2,
                             subtopic = ?3,
                             objectives = ?4,
                             assessment = ?5,
                             instructional_materials = ?6,
                             notes = ?7,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?8 AND scheme_id = ?9",
                        params![
                            request.week_id,
                            input.topic,
                            input.subtopic,
                            objectives,
                            assessment,
                            instructional_materials,
                            input.notes,
                            entry_id,
                            scheme_id,
                        ],
                    )?;
                    (entry_id.to_owned(), Vec::new())
                } else {
                    let unit_id = resolve_unit(&transaction, &course_id, &input)?;
                    let outcome_ids = resolve_outcomes(&transaction, &course_id, &unit_id, &input)?;
                    transaction.execute(
                        "UPDATE scheme_entries
                         SET scheme_week_id = ?1,
                             curriculum_unit_id = ?2,
                             topic = ?3,
                             subtopic = ?4,
                             objectives = ?5,
                             assessment = ?6,
                             instructional_materials = ?7,
                             notes = ?8,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?9 AND scheme_id = ?10",
                        params![
                            request.week_id,
                            unit_id,
                            input.topic,
                            input.subtopic,
                            objectives,
                            assessment,
                            instructional_materials,
                            input.notes,
                            entry_id,
                            scheme_id,
                        ],
                    )?;
                    transaction.execute(
                        "DELETE FROM scheme_entry_outcomes WHERE scheme_entry_id = ?1",
                        params![entry_id],
                    )?;
                    (entry_id.to_owned(), outcome_ids)
                }
            }
            None => {
                let unit_id = resolve_unit(&transaction, &course_id, &input)?;
                let outcome_ids = resolve_outcomes(&transaction, &course_id, &unit_id, &input)?;
                let sequence = transaction.query_row(
                    "SELECT COALESCE(MAX(sequence), 0) + 1
                     FROM scheme_entries WHERE scheme_week_id = ?1",
                    params![request.week_id],
                    |row| row.get::<_, i64>(0),
                )?;
                let entry_id = new_id("scheme-entry");
                transaction.execute(
                    "INSERT INTO scheme_entries (
                         id, scheme_week_id, scheme_id, curriculum_course_id,
                         curriculum_unit_id, sequence, topic, subtopic,
                         objectives, assessment, instructional_materials, notes
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        entry_id,
                        request.week_id,
                        scheme_id,
                        course_id,
                        unit_id,
                        sequence,
                        input.topic,
                        input.subtopic,
                        objectives,
                        assessment,
                        instructional_materials,
                        input.notes,
                    ],
                )?;
                (entry_id, outcome_ids)
            }
        };

        for outcome_id in outcome_ids {
            transaction.execute(
                "INSERT INTO scheme_entry_outcomes (
                     scheme_entry_id, curriculum_outcome_id, curriculum_course_id
                 ) VALUES (?1, ?2, ?3)",
                params![entry_id, outcome_id, course_id],
            )?;
        }
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

fn validate_stable_alignment_input(
    connection: &Connection,
    course_id: &str,
    node_id: &str,
    input: &ValidatedSchemeEntry,
) -> RepositoryResult<()> {
    let node_title = connection.query_row(
        "SELECT title FROM curriculum_nodes
         WHERE id = ?1 AND curriculum_course_id = ?2 AND kind = 'subtopic'",
        params![node_id, course_id],
        |row| row.get::<_, String>(0),
    )?;
    let mut statement = connection.prepare(
        "SELECT COALESCE(statement, title)
         FROM curriculum_nodes
         WHERE parent_node_id = ?1
           AND curriculum_course_id = ?2
           AND kind = 'performance_objective'
         ORDER BY sequence",
    )?;
    let learning_outcomes = statement
        .query_map(params![node_id, course_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if normalize_key(&node_title) != input.normalized_curriculum_unit
        || learning_outcomes
            .iter()
            .map(|outcome| normalize_key(outcome))
            .collect::<Vec<_>>()
            != input
                .curriculum_outcomes
                .iter()
                .map(|outcome| normalize_key(outcome))
                .collect::<Vec<_>>()
    {
        return Err(RepositoryError::Validation(
            "The curriculum entry and learning goals in an imported plan must stay aligned with its curriculum edition."
                .to_owned(),
        ));
    }
    Ok(())
}

pub(in crate::scheme_of_work) fn archive_entry(
    database: &Database,
    request: ArchiveSchemeEntryRequest,
) -> Result<SchemeContextSnapshot, String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let (scheme_id, _) = resolve_scheme_identity(&transaction, &context)?;
        let changed = transaction.execute(
            "UPDATE scheme_entries
             SET status = 'archived', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND scheme_id = ?2 AND status = 'active'",
            params![request.entry_id, scheme_id],
        )?;
        if changed == 0 {
            return Err(RepositoryError::NotFound(
                "That weekly plan is no longer available.".to_owned(),
            ));
        }
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

/// Moves a subtopic to another teaching week of the same scheme.
///
/// A plan already written for that subtopic moves with it, because a lesson is
/// bound to the entry and reads its week from there. What cannot follow is a
/// subtopic whose new week is already planned whole: the week's plan would
/// cover it and its own plan would too, and a head of department would be
/// signing the same ground twice. That is refused here, in the teacher's words,
/// rather than at the trigger that would otherwise catch it later.
pub(in crate::scheme_of_work) fn move_entry(
    database: &Database,
    request: MoveSchemeEntryRequest,
) -> Result<SchemeContextSnapshot, String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let context = resolve_context(&transaction, &request.context)?;
        let (scheme_id, _) = resolve_scheme_identity(&transaction, &context)?;

        let target_is_teaching: bool = transaction
            .query_row(
                "SELECT kind = 'teaching' FROM scheme_weeks
                 WHERE id = ?1 AND scheme_id = ?2",
                params![request.target_week_id, scheme_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| {
                RepositoryError::NotFound("That week is not in this scheme of work.".to_owned())
            })?;
        if !target_is_teaching {
            return Err(RepositoryError::Validation(
                "A subtopic cannot be moved into a break or examination week.".to_owned(),
            ));
        }

        let clash: bool = transaction.query_row(
            "SELECT EXISTS (
                 SELECT 1 FROM lessons planned
                 WHERE planned.scheme_week_id = ?1
             ) AND EXISTS (
                 SELECT 1 FROM lessons own WHERE own.scheme_entry_id = ?2
             )",
            params![request.target_week_id, request.entry_id],
            |row| row.get(0),
        )?;
        if clash {
            return Err(RepositoryError::Conflict(
                "That week already has a plan of its own, and this subtopic has one too. Move it to a week with no plan yet, or start from the week's plan instead."
                    .to_owned(),
            ));
        }

        let changed = transaction.execute(
            "UPDATE scheme_entries
             SET scheme_week_id = ?1,
                 sequence = 1 + COALESCE(
                     (SELECT MAX(sequence) FROM scheme_entries already
                      WHERE already.scheme_week_id = ?1 AND already.status = 'active'),
                     0),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2 AND scheme_id = ?3 AND status = 'active'",
            params![request.target_week_id, request.entry_id, scheme_id],
        )?;
        if changed == 0 {
            return Err(RepositoryError::NotFound(
                "That weekly plan is no longer available.".to_owned(),
            ));
        }
        transaction.commit()?;
        load_snapshot(connection, &context)
    })
}

fn resolve_scheme_identity(
    connection: &Connection,
    context: &ResolvedContext,
) -> RepositoryResult<(String, String)> {
    connection
        .query_row(
            "SELECT id, curriculum_course_id FROM schemes_of_work
             WHERE academic_period_id = ?1
               AND teaching_assignment_id = ?2
               AND status = 'active'",
            params![context.period_id, context.assignment_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound(
                "Set up the curriculum and term calendar before planning a week.".to_owned(),
            )
        })
}

fn ensure_teaching_week(
    connection: &Connection,
    week_id: &str,
    scheme_id: &str,
) -> RepositoryResult<()> {
    let kind = connection
        .query_row(
            "SELECT kind FROM scheme_weeks WHERE id = ?1 AND scheme_id = ?2",
            params![week_id, scheme_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| {
            RepositoryError::NotFound("That scheme week is no longer available.".to_owned())
        })?;
    if kind != "teaching" {
        return Err(RepositoryError::Validation(
            "Weekly plans can only be added to teaching weeks.".to_owned(),
        ));
    }
    Ok(())
}

fn map_week_constraint(error: rusqlite::Error) -> RepositoryError {
    if error.sqlite_error_code() == Some(ErrorCode::ConstraintViolation) {
        RepositoryError::Conflict(
            "Archive the weekly plans before changing this to a non-teaching week.".to_owned(),
        )
    } else {
        RepositoryError::Database(error)
    }
}

#[cfg(test)]
mod tests {

    use super::MoveSchemeEntryRequest;
    use crate::academic_workspace::{
        domain::{CreateAcademicWorkspaceRequest, CreateTeachingAssignment},
        repository::create_workspace,
    };
    use crate::curriculum_catalog::{
        domain::AssignCurriculumCourseRequest,
        repository::{assign_course, install_school_test_package},
    };
    use crate::scheme_of_work::repository::test_support::*;
    use crate::scheme_of_work::repository::*;

    #[test]
    fn a_new_scheme_uses_the_curriculum_selected_for_the_assignment() {
        let database = Database::in_memory();
        let selected_course_id = install_school_test_package(&database).courses[0].id.clone();
        let workspace = create_workspace(
            &database,
            CreateAcademicWorkspaceRequest {
                start_year: 2026,
                jurisdiction_id: "jurisdiction-ng".to_owned(),
                grade_system_id: "grade-system-ng-basic-secondary".to_owned(),
                calendar_kind: crate::academic_workspace::domain::AcademicCalendarKind::Terms,
                period_names: vec![
                    "First term".to_owned(),
                    "Second term".to_owned(),
                    "Third term".to_owned(),
                ],
                active_period_ordinal: 1,
                assignments: vec![CreateTeachingAssignment {
                    subject: "Mathematics".to_owned(),
                    grade_level_id: "grade-jss-1".to_owned(),
                    class_section: Some("A".to_owned()),
                }],
            },
        )
        .expect("workspace")
        .workspace
        .expect("configured workspace");
        assign_course(
            &database,
            AssignCurriculumCourseRequest {
                assignment_id: workspace.active_assignment_id.clone(),
                curriculum_course_id: selected_course_id.clone(),
            },
        )
        .expect("selected curriculum");

        let saved = create_scheme(
            &database,
            CreateSchemeOfWorkRequest {
                context: SchemeContextRequest {
                    academic_session_id: workspace.active_session_id,
                    academic_period_id: workspace.active_period_id,
                    teaching_assignment_id: workspace.active_assignment_id,
                },
                framework_name: String::new(),
                authority: String::new(),
                jurisdiction: String::new(),
                version: String::new(),
                source_uri: None,
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-09-20".to_owned(),
                mid_term_break_starts_on: None,
                mid_term_break_ends_on: None,
            },
        )
        .expect("scheme")
        .scheme
        .expect("saved scheme");

        assert_eq!(saved.curriculum.id, selected_course_id);
    }

    /// A term is not a straight run of calendar weeks: a school resumes, breaks
    /// in the middle and closes. A plan sitting in a week the school is shut is
    /// the teacher's name on the paper, not the app's.
    #[test]
    fn a_term_with_a_mid_term_break_marks_the_week_it_falls_in() {
        let (database, context) = setup_database();
        let scheme = create_scheme(
            &database,
            CreateSchemeOfWorkRequest {
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-10-04".to_owned(),
                mid_term_break_starts_on: Some("2026-09-21".to_owned()),
                mid_term_break_ends_on: Some("2026-09-27".to_owned()),
                ..create_request(context)
            },
        )
        .expect("scheme creation")
        .scheme
        .expect("scheme");

        let kinds: Vec<_> = scheme.weeks.iter().map(|week| week.kind).collect();
        assert_eq!(
            kinds,
            vec![
                SchemeWeekKind::Teaching,
                SchemeWeekKind::Teaching,
                SchemeWeekKind::Break,
                SchemeWeekKind::Teaching,
            ]
        );
        assert_eq!(scheme.weeks[2].title.as_deref(), Some("Mid-term break"));
    }

    /// A day either side of a week is not a holiday week: the topic is still
    /// taught, so the week keeps it.
    /// A class that falls behind — which is every class — has to be able to say
    /// so, because the scheme is what the week's plan is written against.
    #[test]
    fn a_subtopic_moves_to_the_week_a_teacher_will_actually_teach_it() {
        let (database, context) = setup_database();
        let scheme = create_scheme(&database, create_request(context.clone()))
            .expect("scheme")
            .scheme
            .expect("scheme");
        let saved = save_entry(
            &database,
            SaveSchemeEntryRequest {
                context: context.clone(),
                entry_id: None,
                week_id: scheme.weeks[0].id.clone(),
                topic: "Linear equations".to_owned(),
                subtopic: Some("Inverse operations".to_owned()),
                curriculum_unit: "Algebra".to_owned(),
                curriculum_outcomes: vec!["Solve one-step linear equations.".to_owned()],
                objectives: vec!["Solve equations accurately.".to_owned()],
                assessment: vec!["Complete an exit problem.".to_owned()],
                instructional_materials: vec!["Balance-scale diagram".to_owned()],
                notes: None,
            },
        )
        .expect("weekly plan")
        .scheme
        .expect("scheme");
        let entry_id = saved.weeks[0].entries[0].id.clone();

        let moved = move_entry(
            &database,
            MoveSchemeEntryRequest {
                context,
                entry_id: entry_id.clone(),
                target_week_id: scheme.weeks[2].id.clone(),
            },
        )
        .expect("the move")
        .scheme
        .expect("scheme");

        assert!(
            moved.weeks[0].entries.is_empty(),
            "it left the week it was in"
        );
        assert_eq!(
            moved.weeks[2]
                .entries
                .iter()
                .map(|entry| entry.id.as_str())
                .collect::<Vec<_>>(),
            vec![entry_id.as_str()],
            "and arrived in the one the teacher named"
        );
    }

    /// A subtopic with a plan of its own cannot move into a week already
    /// planned whole: the week's plan would cover it and its own plan would
    /// too, and a head of department would be signing the same ground twice.
    /// Refused in the teacher's words rather than at the trigger that would
    /// catch it later.
    #[test]
    fn a_planned_subtopic_will_not_move_into_a_week_that_is_already_planned() {
        let (database, context) = setup_database();
        let scheme = create_scheme(&database, create_request(context.clone()))
            .expect("scheme")
            .scheme
            .expect("scheme");
        let saved = save_entry(
            &database,
            SaveSchemeEntryRequest {
                context: context.clone(),
                entry_id: None,
                week_id: scheme.weeks[0].id.clone(),
                topic: "Linear equations".to_owned(),
                subtopic: Some("Inverse operations".to_owned()),
                curriculum_unit: "Algebra".to_owned(),
                curriculum_outcomes: vec!["Solve one-step linear equations.".to_owned()],
                objectives: vec!["Solve equations accurately.".to_owned()],
                assessment: vec!["Complete an exit problem.".to_owned()],
                instructional_materials: vec!["Balance-scale diagram".to_owned()],
                notes: None,
            },
        )
        .expect("weekly plan")
        .scheme
        .expect("scheme");
        let entry_id = saved.weeks[0].entries[0].id.clone();
        let target = scheme.weeks[2].id.clone();

        // A plan for the subtopic, and a plan for the week it would move into.
        database
            .with_connection(|connection| {
                connection.execute_batch("PRAGMA foreign_keys = OFF")?;
                connection.execute(
                    "INSERT INTO lessons (id, academic_session_id, academic_period_id,
                         teaching_assignment_id, scheme_entry_id, curriculum_course_id,
                         curriculum_unit_id, input_mode, topic, learning_goals,
                         instructional_materials, assessment, reference_notes)
                     SELECT 'subtopic-plan', academic_session_id, academic_period_id,
                         teaching_assignment_id, id, curriculum_course_id, curriculum_unit_id,
                         'structured', topic, '[]', '[]', '[]', '[]'
                     FROM scheme_entries, (SELECT academic_session_id, academic_period_id,
                         teaching_assignment_id FROM schemes_of_work LIMIT 1)
                     WHERE scheme_entries.id = ?1",
                    [&entry_id],
                )?;
                connection.execute(
                    "INSERT INTO lessons (id, academic_session_id, academic_period_id,
                         teaching_assignment_id, scheme_week_id, input_mode, topic,
                         learning_goals, instructional_materials, assessment, reference_notes)
                     SELECT 'week-plan', academic_session_id, academic_period_id,
                         teaching_assignment_id, ?1, 'structured', 'The week', '[]', '[]', '[]', '[]'
                     FROM schemes_of_work LIMIT 1",
                    [&target],
                )
            })
            .expect("two plans");

        let refusal = move_entry(
            &database,
            MoveSchemeEntryRequest {
                context,
                entry_id,
                target_week_id: target,
            },
        )
        .expect_err("the clash");

        assert!(
            refusal.contains("already has a plan of its own"),
            "unexpected: {refusal}"
        );
    }

    #[test]
    fn a_break_that_clips_a_week_leaves_it_a_teaching_week() {
        let (database, context) = setup_database();
        let scheme = create_scheme(
            &database,
            CreateSchemeOfWorkRequest {
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-09-27".to_owned(),
                mid_term_break_starts_on: Some("2026-09-19".to_owned()),
                mid_term_break_ends_on: Some("2026-09-21".to_owned()),
                ..create_request(context)
            },
        )
        .expect("scheme creation")
        .scheme
        .expect("scheme");

        assert!(scheme
            .weeks
            .iter()
            .all(|week| week.kind == SchemeWeekKind::Teaching));
    }

    #[test]
    fn a_mid_term_break_outside_the_term_is_refused() {
        let (database, context) = setup_database();

        let error = create_scheme(
            &database,
            CreateSchemeOfWorkRequest {
                term_starts_on: "2026-09-07".to_owned(),
                term_ends_on: "2026-09-20".to_owned(),
                mid_term_break_starts_on: Some("2026-10-05".to_owned()),
                mid_term_break_ends_on: Some("2026-10-09".to_owned()),
                ..create_request(context)
            },
        )
        .expect_err("a break outside its term");

        assert!(error.contains("resumes"), "unexpected: {error}");
    }

    #[test]
    fn persists_a_structured_weekly_plan_with_curriculum_outcomes() {
        let (database, context) = setup_database();
        let scheme = create_scheme(&database, create_request(context.clone()))
            .expect("scheme creation")
            .scheme
            .expect("scheme");
        let snapshot = save_entry(
            &database,
            SaveSchemeEntryRequest {
                context,
                entry_id: None,
                week_id: scheme.weeks[0].id.clone(),
                topic: "Linear equations".to_owned(),
                subtopic: Some("Inverse operations".to_owned()),
                curriculum_unit: "Algebra".to_owned(),
                curriculum_outcomes: vec![
                    "Solve one-step linear equations.".to_owned(),
                    "Explain inverse operations.".to_owned(),
                ],
                objectives: vec!["Solve equations accurately.".to_owned()],
                assessment: vec!["Complete an exit problem.".to_owned()],
                instructional_materials: vec!["Balance-scale diagram".to_owned()],
                notes: None,
            },
        )
        .expect("weekly plan");

        let entry = &snapshot.scheme.expect("scheme").weeks[0].entries[0];
        assert_eq!(entry.curriculum_unit.title, "Algebra");
        assert_eq!(entry.curriculum_outcomes.len(), 2);
        assert_eq!(entry.objectives, vec!["Solve equations accurately."]);
    }

    #[test]
    fn rejects_an_entry_on_a_break_week() {
        let (database, context) = setup_database();
        let scheme = create_scheme(&database, create_request(context.clone()))
            .expect("scheme creation")
            .scheme
            .expect("scheme");
        let week_id = scheme.weeks[0].id.clone();
        save_week(
            &database,
            SaveSchemeWeekRequest {
                context: context.clone(),
                week_id: week_id.clone(),
                kind: SchemeWeekKind::Break,
                title: Some("Mid-term break".to_owned()),
            },
        )
        .expect("break week");

        let error = save_entry(
            &database,
            SaveSchemeEntryRequest {
                context,
                entry_id: None,
                week_id,
                topic: "Linear equations".to_owned(),
                subtopic: None,
                curriculum_unit: "Algebra".to_owned(),
                curriculum_outcomes: vec!["Solve equations.".to_owned()],
                objectives: vec!["Solve equations.".to_owned()],
                assessment: vec!["Exit problem.".to_owned()],
                instructional_materials: vec![],
                notes: None,
            },
        )
        .expect_err("entry on break");

        assert!(error.contains("teaching weeks"));
    }

    #[test]
    fn rejects_cross_session_scheme_context() {
        let (database, context) = setup_database();
        let mut invalid = create_request(context);
        invalid.context.academic_session_id = "another-session".to_owned();

        let error = create_scheme(&database, invalid).expect_err("cross-session scheme");

        assert!(error.contains("selected academic session"));
    }

    #[test]
    fn rejects_term_dates_outside_the_academic_session() {
        let (database, context) = setup_database();
        let mut invalid = create_request(context);
        invalid.term_starts_on = "2027-09-01".to_owned();
        invalid.term_ends_on = "2027-12-15".to_owned();

        let error = create_scheme(&database, invalid).expect_err("out-of-session calendar");

        assert!(error.contains("2026/2027 academic session"));
    }
}
