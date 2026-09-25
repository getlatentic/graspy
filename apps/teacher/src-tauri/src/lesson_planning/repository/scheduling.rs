use rusqlite::params;

use crate::db::Database;

use super::snapshot::load_snapshot;
use super::{insert_outcomes, resolve_context, resolve_schedule, RepositoryError};
use crate::lesson_planning::domain::{LessonWorkspaceSnapshot, MoveLessonDraftRequest};

pub(in crate::lesson_planning) fn move_draft(
    database: &Database,
    request: MoveLessonDraftRequest,
) -> Result<LessonWorkspaceSnapshot, String> {
    database.with_connection_mut(move |connection| {
        let transaction = connection.transaction()?;
        let source = resolve_context(&transaction, &request.source_context)?;
        let target = resolve_context(&transaction, &request.target_context)?;
        if source.assignment_id == target.assignment_id && source.period_id == target.period_id {
            return Err(RepositoryError::Validation(
                "Choose a different class or term before moving this lesson.".to_owned(),
            ));
        }
        if source.subject_id != target.subject_id || source.grade_level_id != target.grade_level_id
        {
            return Err(RepositoryError::Validation(
                "Move this lesson only to the same subject and class level.".to_owned(),
            ));
        }
        let schedule = resolve_schedule(
            &transaction,
            &target,
            request.scheme_week_id.as_deref(),
            request.scheme_entry_id.as_deref(),
        )?;
        let changed = transaction.execute(
            "UPDATE lessons
             SET academic_session_id = ?1,
                 academic_period_id = ?2,
                 teaching_assignment_id = ?3,
                 scheme_week_id = ?4,
                 scheme_entry_id = ?5,
                 curriculum_course_id = ?6,
                 curriculum_unit_id = ?7,
                 curriculum_node_id = ?8,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?9
               AND academic_period_id = ?10
               AND teaching_assignment_id = ?11
               AND status = 'draft'",
            params![
                target.session_id,
                target.period_id,
                target.assignment_id,
                schedule
                    .as_ref()
                    .and_then(super::ResolvedSchedule::stored_week_id),
                schedule.as_ref().and_then(|value| value.entry_id.as_ref()),
                schedule.as_ref().map(|value| &value.course_id),
                schedule
                    .as_ref()
                    .and_then(|value| value.curriculum_unit_id.as_deref()),
                schedule
                    .as_ref()
                    .and_then(|value| value.curriculum_node_id.as_deref()),
                request.lesson_id,
                source.period_id,
                source.assignment_id,
            ],
        )?;
        if changed == 0 {
            return Err(RepositoryError::Conflict(
                "Only an unconfirmed lesson draft can be moved from its current class and term."
                    .to_owned(),
            ));
        }
        transaction.execute(
            "DELETE FROM lesson_curriculum_outcomes WHERE lesson_id = ?1",
            [&request.lesson_id],
        )?;
        insert_outcomes(&transaction, &request.lesson_id, schedule.as_ref())?;
        transaction.commit()?;
        load_snapshot(connection, &target, Some(&request.lesson_id))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::academic_workspace::domain::SaveTeachingAssignmentRequest;
    use crate::academic_workspace::repository::add_assignment;
    use crate::lesson_planning::domain::LessonContextRequest;
    use crate::lesson_planning::domain::MoveLessonDraftRequest;
    use crate::lesson_planning::repository::test_support::{setup, structured_request};
    use crate::lesson_planning::repository::{
        confirm_granular_lesson, save_draft, save_granular_lesson,
    };

    #[test]
    fn moves_only_a_draft_to_an_explicit_compatible_context() {
        let context = setup();
        let second_assignment = add_assignment(
            &context.database,
            SaveTeachingAssignmentRequest {
                academic_session_id: context.lesson_context.academic_session_id.clone(),
                subject: "Mathematics".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some("B".to_owned()),
            },
        )
        .expect("second class")
        .workspace
        .expect("workspace")
        .assignments
        .into_iter()
        .find(|assignment| assignment.class_section.as_deref() == Some("B"))
        .expect("class B");
        let mut request = structured_request(&context);
        request.scheme_week_id = None;
        request.scheme_entry_id = None;
        let lesson_id = save_draft(&context.database, request)
            .expect("draft")
            .selected_lesson
            .expect("lesson")
            .id;
        let target_context = LessonContextRequest {
            academic_session_id: context.lesson_context.academic_session_id.clone(),
            academic_period_id: context.second_period_id.clone(),
            teaching_assignment_id: second_assignment.id,
        };

        let moved = move_draft(
            &context.database,
            MoveLessonDraftRequest {
                lesson_id,
                source_context: context.lesson_context,
                target_context: target_context.clone(),
                scheme_week_id: None,
                scheme_entry_id: None,
            },
        )
        .expect("moved draft")
        .selected_lesson
        .expect("lesson");

        assert_eq!(
            moved.teaching_assignment_id,
            target_context.teaching_assignment_id
        );
        assert_eq!(moved.academic_period_id, target_context.academic_period_id);
        assert_eq!(moved.academic_period_name, "Second term");
    }

    #[test]
    fn rejects_moving_a_draft_to_an_incompatible_subject() {
        let context = setup();
        let english_assignment = add_assignment(
            &context.database,
            SaveTeachingAssignmentRequest {
                academic_session_id: context.lesson_context.academic_session_id.clone(),
                subject: "English Language".to_owned(),
                grade_level_id: "grade-jss-2".to_owned(),
                class_section: Some("A".to_owned()),
            },
        )
        .expect("English class")
        .workspace
        .expect("workspace")
        .assignments
        .into_iter()
        .find(|assignment| assignment.subject == "English Language")
        .expect("English assignment");
        let mut request = structured_request(&context);
        request.scheme_week_id = None;
        request.scheme_entry_id = None;
        let lesson_id = save_draft(&context.database, request)
            .expect("draft")
            .selected_lesson
            .expect("lesson")
            .id;

        let error = move_draft(
            &context.database,
            MoveLessonDraftRequest {
                lesson_id,
                source_context: context.lesson_context.clone(),
                target_context: LessonContextRequest {
                    academic_session_id: context.lesson_context.academic_session_id,
                    academic_period_id: context.lesson_context.academic_period_id,
                    teaching_assignment_id: english_assignment.id,
                },
                scheme_week_id: None,
                scheme_entry_id: None,
            },
        )
        .expect_err("incompatible move");

        assert!(error.contains("same subject and class level"));
    }

    #[test]
    fn rejects_moving_a_confirmed_lesson() {
        let context = setup();
        let lesson_id = save_draft(&context.database, structured_request(&context))
            .expect("draft")
            .selected_lesson
            .expect("lesson")
            .id;
        let mut record = crate::lesson_planning::granular::tests::granular_record();
        record.program_snapshot.program_run_id = None;
        save_granular_lesson(
            &context.database,
            crate::lesson_planning::domain::SaveGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
                record,
            },
        )
        .expect("a plan to confirm");
        confirm_granular_lesson(
            &context.database,
            crate::lesson_planning::domain::ConfirmGranularLessonRequest {
                context: context.lesson_context.clone(),
                lesson_id: lesson_id.clone(),
            },
        )
        .expect("confirmed lesson");

        let error = move_draft(
            &context.database,
            MoveLessonDraftRequest {
                lesson_id,
                source_context: context.lesson_context.clone(),
                target_context: LessonContextRequest {
                    academic_session_id: context.lesson_context.academic_session_id,
                    academic_period_id: context.second_period_id,
                    teaching_assignment_id: context.lesson_context.teaching_assignment_id,
                },
                scheme_week_id: None,
                scheme_entry_id: None,
            },
        )
        .expect_err("confirmed move");

        assert!(error.contains("Only an unconfirmed lesson draft"));
    }
}
